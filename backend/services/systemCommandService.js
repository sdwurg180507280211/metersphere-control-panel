const { spawn } = require('child_process');
const logger = require('../utils/logger');
const { createAppError } = require('../utils/errors');
const configManager = require('./configManager');

const COMMAND_TIMEOUT_MS = 30000;
const INVALID_PASSWORD_PATTERN = /(sorry, try again|incorrect password|a password is required|no password was provided|incorrect password attempt)/i;
const COMMAND_NOT_FOUND_PATTERN = /(msctl: command not found|command not found|sudo: msctl: command not found)/i;
const MAX_OUTPUT_LENGTH = 1000;

function sanitizeOutput(output = '') {
  const normalized = String(output || '').trim();
  if (normalized.length <= MAX_OUTPUT_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_OUTPUT_LENGTH)}...`;
}

class SystemCommandService {
  async reloadMsctl(password) {
    if (typeof password !== 'string' || password.length === 0) {
      throw createAppError(400, 'SUDO_PASSWORD_REQUIRED', '请输入管理员密码');
    }

    logger.broadcast('\n========== 执行系统 msctl reload ==========', 'service');

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
    if (!Array.isArray(ports) || ports.length === 0) {
      throw createAppError(400, 'PORTS_REQUIRED', '请选择至少一个端口映射');
    }

    const resolvedConfig = configManager.getResolvedConfig();
    const REMOTE_HOST = resolvedConfig.tunnel?.remoteHost || '8.152.216.176';
    const REMOTE_USER = resolvedConfig.tunnel?.remoteUser || 'root';

    // 检查是否已有隧道进程
    const currentStatus = await this.getTunnelStatus();
    if (currentStatus === 'RUNNING') {
      throw createAppError(409, 'TUNNEL_ALREADY_RUNNING', 'SSH 隧道已在运行中');
    }

    // 构建 -R 参数
    const reverseArgs = ports.flatMap(({ remotePort, localPort }) => [
      '-R', `${remotePort}:localhost:${localPort}`
    ]);

    const sshArgs = [
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'ServerAliveInterval=60',
      '-o', 'ServerAliveCountMax=3',
      '-o', 'ExitOnForwardFailure=yes',
      '-N',
      ...reverseArgs,
      `${REMOTE_USER}@${REMOTE_HOST}`
    ];

    logger.broadcast('\n========== 建立 SSH 反向隧道 ==========', 'service');
    logger.broadcast(`目标: ${REMOTE_USER}@${REMOTE_HOST}`, 'service');
    ports.forEach(({ remotePort, localPort }) => {
      logger.broadcast(`  端口映射: 远程:${remotePort} → 本地:${localPort}`, 'service');
    });

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

      const finishReject = (error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };

      const finishResolve = (payload) => {
        if (settled) return;
        settled = true;
        resolve(payload);
      };

      // 给 ssh 一些时间连接，3 秒后检查是否仍在运行
      const connectTimer = setTimeout(async () => {
        try {
          // 进程仍在运行，视为连接成功
          process.kill(child.pid, 0);
          child.unref();
          logger.broadcast('SSH 隧道已建立', 'service');
          finishResolve({ pid: child.pid });
        } catch {
          // 进程已退出，连接失败
          finishReject(createAppError(500, 'TUNNEL_CONNECT_FAILED',
            stderr.trim() || 'SSH 隧道连接失败'));
        }
      }, 3000);

      child.stderr?.on('data', (raw) => {
        const msg = raw.toString();
        stderr += msg;
        if (msg.trim()) {
          logger.broadcast(msg, 'service');
        }
      });

      child.on('error', (error) => {
        clearTimeout(connectTimer);
        if (error.code === 'ENOENT') {
          finishReject(createAppError(500, 'SSH_NOT_FOUND',
            '未找到 ssh 命令'));
          return;
        }
        finishReject(createAppError(500, 'TUNNEL_EXEC_ERROR',
          `SSH 隧道启动失败: ${error.message}`));
      });

      child.on('close', (code) => {
        clearTimeout(connectTimer);
        if (code !== 0 && !settled) {
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
   * 停止 SSH 反向隧道
   */
  async stopTunnel() {
    logger.broadcast('\n========== 停止 SSH 反向隧道 ==========', 'service');

    return new Promise((resolve, reject) => {
      const resolvedConfig = configManager.getResolvedConfig();
      const remoteHost = resolvedConfig.tunnel?.remoteHost || '8.152.216.176';
      const escapedHost = remoteHost.replace(/\./g, '\\.');
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
      const remoteHost = resolvedConfig.tunnel?.remoteHost || '8.152.216.176';
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
