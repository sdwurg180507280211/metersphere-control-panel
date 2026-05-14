const { spawn } = require('child_process');
const logger = require('../utils/logger');
const { createAppError } = require('../utils/errors');
const configManager = require('./configManager');
const websocketService = require('./websocketService');
const validator = require('../utils/validator');

const COMMAND_TIMEOUT_MS = 30000;
const INVALID_PASSWORD_PATTERN = /(sorry, try again|incorrect password|a password is required|no password was provided|incorrect password attempt)/i;
const COMMAND_NOT_FOUND_PATTERN = /(msctl: command not found|command not found|sudo: msctl: command not found)/i;
const MAX_OUTPUT_LENGTH = 1000;

const TUNNEL_MAX_RETRIES = 5;
const TUNNEL_RETRY_BASE_DELAY = 3000;

function sanitizeOutput(output = '') {
  const normalized = String(output || '').trim();
  if (normalized.length <= MAX_OUTPUT_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_OUTPUT_LENGTH)}...`;
}

function broadcastTunnelEvent(event, data = {}) {
  if (websocketService && websocketService.broadcast) {
    websocketService.broadcast('tunnel:status', { event, ...data });
  }
}

function validateTunnelEndpoint(config) {
  const remoteHost = config.sshTunnel?.remoteHost || config.tunnel?.remoteHost || '';
  const remoteUser = config.sshTunnel?.remoteUser || config.tunnel?.remoteUser || '';

  if (!/^[a-zA-Z0-9.-]{1,253}$/.test(remoteHost)) {
    throw createAppError(400, 'INVALID_TUNNEL_HOST', 'SSH 隧道远程主机未配置或格式不合法');
  }
  if (!/^[a-zA-Z0-9._-]{1,64}$/.test(remoteUser)) {
    throw createAppError(400, 'INVALID_TUNNEL_USER', 'SSH 隧道远程用户未配置或格式不合法');
  }

  return { remoteHost, remoteUser };
}

function validateTunnelPorts(ports) {
  if (!Array.isArray(ports) || ports.length === 0) {
    throw createAppError(400, 'PORTS_REQUIRED', '请选择至少一个端口映射');
  }
  if (ports.length > 20) {
    throw createAppError(400, 'TOO_MANY_TUNNEL_PORTS', '端口映射数量不能超过 20 个');
  }

  return ports.map((item) => {
    const remotePort = Number.parseInt(item.remotePort, 10);
    const localPort = Number.parseInt(item.localPort, 10);
    if (!validator.isValidPort(remotePort) || !validator.isValidPort(localPort)) {
      throw createAppError(400, 'INVALID_TUNNEL_PORT', '端口必须是 1 到 65535 之间的整数');
    }
    return { remotePort, localPort };
  });
}

class SystemCommandService {
  constructor() {
    this._tunnelChild = null;
    this._tunnelPorts = null;
    this._tunnelRetryCount = 0;
    this._tunnelRetryTimer = null;
    this._tunnelIntentionalStop = false;
    this._tunnelMonitorTimer = null;
  }
  async reloadMsctl(password) {
    if (typeof password !== 'string' || password.length === 0) {
      throw createAppError(400, 'SUDO_PASSWORD_REQUIRED', '请输入管理员密码');
    }

    logger.broadcast('\n========== 执行系统 msctl reload ==========', 'service');
    logger.broadcastCommand('sudo -S -k -p "" msctl reload', 'service');

    return new Promise((resolve, reject) => {
      const child = spawn('sudo', ['-S', '-k', '-p', '', 'msctl', 'reload'], {
        env: {
          ...process.env,
          LANG: 'C',
          LC_ALL: 'C'
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      let settled = false;

      const finishReject = (error) => {
        if (settled) {
          return;
        }
        settled = true;
        reject(error);
      };

      const finishResolve = (payload) => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(payload);
      };

      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        finishReject(createAppError(504, 'MSCTL_RELOAD_TIMEOUT', 'msctl reload 执行超时'));
      }, COMMAND_TIMEOUT_MS);

      const cleanup = () => {
        clearTimeout(timer);
      };

      const handleOutput = (raw, isError = false) => {
        const message = raw.toString();
        if (isError) {
          stderr += message;
        } else {
          stdout += message;
        }

        if (message.trim()) {
          logger.broadcast(message, 'service');
        }
      };

      child.stdout?.on('data', (raw) => handleOutput(raw, false));
      child.stderr?.on('data', (raw) => handleOutput(raw, true));

      child.on('error', (error) => {
        cleanup();
        if (error.code === 'ENOENT') {
          finishReject(createAppError(500, 'SUDO_NOT_AVAILABLE', '未找到 sudo 命令，请确认运行环境支持 sudo'));
          return;
        }

        finishReject(createAppError(500, 'MSCTL_RELOAD_EXEC_ERROR', `执行 msctl reload 失败: ${error.message}`));
      });

      child.on('spawn', () => {
        child.stdin.write(`${password}\n`);
        child.stdin.end();
      });

      child.on('close', (code) => {
        cleanup();

        if (code === 0) {
          logger.broadcast('msctl reload 执行完成', 'service');
          finishResolve({
            stdout: sanitizeOutput(stdout),
            stderr: sanitizeOutput(stderr)
          });
          return;
        }

        const output = sanitizeOutput(stderr || stdout);

        if (INVALID_PASSWORD_PATTERN.test(output)) {
          finishReject(createAppError(401, 'INVALID_SUDO_PASSWORD', '管理员密码错误，请重试'));
          return;
        }

        if (COMMAND_NOT_FOUND_PATTERN.test(output)) {
          finishReject(createAppError(500, 'MSCTL_NOT_FOUND', '未找到 msctl 命令，请确认已正确安装'));
          return;
        }

        finishReject(createAppError(500, 'MSCTL_RELOAD_FAILED', output || 'msctl reload 执行失败'));
      });
    });
  }

  /**
   * 启动 SSH 反向隧道
   * @param {Array<{remotePort: number, localPort: number}>} ports 端口映射列表
   * @returns {Promise<{pid: number}>}
   */
  async startTunnel(ports) {
    const resolvedConfig = configManager.getResolvedConfig();
    const safePorts = validateTunnelPorts(ports);
    const { remoteHost, remoteUser } = validateTunnelEndpoint(resolvedConfig);

    // 检查是否已有隧道进程
    const currentStatus = await this.getTunnelStatus();
    if (currentStatus === 'RUNNING') {
      throw createAppError(409, 'TUNNEL_ALREADY_RUNNING', 'SSH 隧道已在运行中');
    }

    // 清理之前的状态
    this._clearTunnelRetry();
    this._tunnelIntentionalStop = false;
    this._tunnelPorts = safePorts;

    return this._doStartTunnel(safePorts, remoteUser, remoteHost);
  }

  async _doStartTunnel(ports, remoteUser, remoteHost) {
    // 构建 -R 参数
    const reverseArgs = ports.flatMap(({ remotePort, localPort }) => [
      '-R', `${remotePort}:localhost:${localPort}`
    ]);

    const sshArgs = [
      '-o', 'ServerAliveInterval=60',
      '-o', 'ServerAliveCountMax=3',
      '-o', 'ExitOnForwardFailure=yes',
      '-N',
      ...reverseArgs,
      `${remoteUser}@${remoteHost}`
    ];

    const isReconnect = this._tunnelRetryCount > 0;
    if (isReconnect) {
      logger.broadcast(`\n========== 重连 SSH 隧道 (第 ${this._tunnelRetryCount} 次) ==========`, 'service');
    } else {
      logger.broadcast('\n========== 建立 SSH 反向隧道 ==========', 'service');
    }
    logger.broadcastCommand(`ssh ${sshArgs.join(' ')}`, 'service');

    return new Promise((resolve, reject) => {
      const child = spawn('ssh', sshArgs, {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          PATH: `${process.env.PATH}:/usr/local/bin:/opt/homebrew/bin`,
          LANG: 'C',
          LC_ALL: 'C'
        }
      });

      let stderr = '';
      let settled = false;
      let connectTimer = null;

      const cleanup = () => {
        if (connectTimer) clearTimeout(connectTimer);
      };

      const finishReject = (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };

      const finishResolve = (payload) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(payload);
      };

      child.stderr?.on('data', (raw) => {
        const msg = raw.toString();
        stderr += msg;
        if (msg.trim()) {
          logger.broadcast(msg, 'service');
        }
      });

      // 给 ssh 3 秒时间连接，之后检查进程是否仍在运行
      connectTimer = setTimeout(async () => {
        connectTimer = null;
        try {
          process.kill(child.pid, 0);
          // 进程还在，保留引用并监听退出
          this._tunnelChild = child;
          this._tunnelRetryCount = 0; // 连接成功，重置重试计数
          child.unref();

          // 监听进程退出，触发自动重连
          child.on('close', (code) => {
            this._tunnelChild = null;
            if (this._tunnelIntentionalStop) return;
            this._handleTunnelExit(code, ports, remoteUser, remoteHost);
          });

          const msg = isReconnect
            ? `SSH 隧道重连成功，PID: ${child.pid}`
            : `SSH 隧道已建立，PID: ${child.pid}`;
          logger.broadcast(msg, 'service');
          broadcastTunnelEvent('connected', { pid: child.pid, reconnected: isReconnect });
          finishResolve({ pid: child.pid });
        } catch {
          finishReject(createAppError(500, 'TUNNEL_CONNECT_FAILED',
            stderr.trim() || 'SSH 隧道连接失败，进程已退出'));
        }
      }, 3000);

      child.on('error', (error) => {
        this._tunnelChild = null;
        if (error.code === 'ENOENT') {
          finishReject(createAppError(500, 'SSH_NOT_FOUND', '未找到 ssh 命令'));
          return;
        }
        finishReject(createAppError(500, 'TUNNEL_EXEC_ERROR',
          `SSH 隧道启动失败: ${error.message}`));
      });

      child.on('close', (code) => {
        if (code !== 0 && !settled) {
          this._tunnelChild = null;
          const output = stderr.trim();
          if (/permission denied|authentication failure/i.test(output)) {
            finishReject(createAppError(401, 'INVALID_SSH_PASSWORD', '远程主机密码错误'));
          } else {
            finishReject(createAppError(500, 'TUNNEL_FAILED',
              output || 'SSH 隧道启动失败'));
          }
        }
      });
    });
  }

  /**
   * 处理隧道进程意外退出，尝试自动重连
   */
  _handleTunnelExit(exitCode, ports, remoteUser, remoteHost) {
    this._tunnelRetryCount += 1;

    if (this._tunnelRetryCount > TUNNEL_MAX_RETRIES) {
      const msg = `SSH 隧道已断开，重连 ${TUNNEL_MAX_RETRIES} 次后仍失败，请手动重连`;
      logger.broadcast(msg, 'service');
      broadcastTunnelEvent('disconnected', { reason: 'max_retries_exceeded', exitCode });
      this._tunnelRetryCount = 0;
      return;
    }

    const delay = Math.min(TUNNEL_RETRY_BASE_DELAY * this._tunnelRetryCount, 30000);
    const msg = `SSH 隧道已断开 (退出码: ${exitCode})，${delay / 1000} 秒后尝试第 ${this._tunnelRetryCount} 次重连...`;
    logger.broadcast(msg, 'service');
    broadcastTunnelEvent('reconnecting', { attempt: this._tunnelRetryCount, maxRetries: TUNNEL_MAX_RETRIES, delay, exitCode });

    this._tunnelRetryTimer = setTimeout(async () => {
      this._tunnelRetryTimer = null;
      if (this._tunnelIntentionalStop) return;

      try {
        await this._doStartTunnel(ports, remoteUser, remoteHost);
      } catch (error) {
        // 重连失败，继续尝试或放弃
        this._handleTunnelExit(1, ports, remoteUser, remoteHost);
      }
    }, delay);
  }

  _clearTunnelRetry() {
    if (this._tunnelRetryTimer) {
      clearTimeout(this._tunnelRetryTimer);
      this._tunnelRetryTimer = null;
    }
    this._tunnelRetryCount = 0;
  }

  /**
   * 停止 SSH 反向隧道
   */
  async stopTunnel() {
    logger.broadcast('\n========== 停止 SSH 反向隧道 ==========', 'service');
    this._tunnelIntentionalStop = true;
    this._clearTunnelRetry();
    this._tunnelChild = null;

    return new Promise((resolve, reject) => {
      const resolvedConfig = configManager.getResolvedConfig();
      const remoteHost = resolvedConfig.sshTunnel?.remoteHost || resolvedConfig.tunnel?.remoteHost || '';
      if (!remoteHost) {
        resolve({ message: '无需停止，隧道未配置' });
        return;
      }
      const escapedHost = remoteHost.replace(/\./g, '\\.');
      logger.broadcastCommand(`pkill -f ssh.*${escapedHost}`, 'service');
      const child = spawn('pkill', ['-f', `ssh.*${escapedHost}`], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      child.on('close', (code) => {
        if (code === 0) {
          logger.broadcast('SSH 隧道已停止', 'service');
          resolve({ message: 'SSH 隧道已停止' });
        } else if (code === 1) {
          // pkill exit 1 means no matching process
          logger.broadcast('未找到运行中的隧道进程', 'service');
          resolve({ message: '无需停止，隧道未运行' });
        } else {
          reject(createAppError(500, 'TUNNEL_STOP_FAILED', '停止隧道进程失败'));
        }
      });

      child.on('error', (error) => {
        reject(createAppError(500, 'TUNNEL_STOP_ERROR',
          `停止隧道失败: ${error.message}`));
      });
    });
  }

  /**
   * 获取 SSH 隧道状态
   * @returns {Promise<string>} 'RUNNING' | 'STOPPED'
   */
  async getTunnelStatus() {
    return new Promise((resolve) => {
      const resolvedConfig = configManager.getResolvedConfig();
      const remoteHost = resolvedConfig.sshTunnel?.remoteHost || resolvedConfig.tunnel?.remoteHost || '';
      if (!remoteHost) {
        resolve('STOPPED');
        return;
      }
      const escapedHost = remoteHost.replace(/\./g, '\\.');
      const child = spawn('pgrep', ['-f', `ssh.*${escapedHost}`], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      child.on('close', (code) => {
        resolve(code === 0 ? 'RUNNING' : 'STOPPED');
      });

      child.on('error', () => {
        resolve('STOPPED');
      });
    });
  }
}

module.exports = new SystemCommandService();
