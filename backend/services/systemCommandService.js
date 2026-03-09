const { spawn } = require('child_process');
const logger = require('../utils/logger');
const { createAppError } = require('../utils/errors');

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
}

module.exports = new SystemCommandService();
