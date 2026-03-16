const { spawn } = require('child_process');
const { createAppError } = require('../utils/errors');

const COMMAND_TIMEOUT_MS = 10000;
const INVALID_PASSWORD_PATTERN = /(sorry, try again|incorrect password|a password is required|no password was provided)/i;

class SudoCommandService {
  /**
   * 通用 sudo 命令执行
   * @param {string} command - 要执行的命令
   * @param {Array<string>} args - 命令参数
   * @param {string} password - sudo 密码
   * @param {Object} options - 额外选项 { stdin, timeout }
   * @returns {Promise<{stdout: string, stderr: string}>}
   */
  async execute(command, args = [], password, options = {}) {
    if (!password) {
      throw createAppError(400, 'SUDO_PASSWORD_REQUIRED', '请输入管理员密码');
    }

    const { stdin = null, timeout = COMMAND_TIMEOUT_MS } = options;

    return new Promise((resolve, reject) => {
      const child = spawn('sudo', ['-S', '-k', '-p', '', command, ...args], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      let settled = false;

      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        if (!settled) {
          settled = true;
          reject(createAppError(504, 'SUDO_TIMEOUT', '命令执行超时'));
        }
      }, timeout);

      child.stdout?.on('data', (data) => { stdout += data.toString(); });
      child.stderr?.on('data', (data) => { stderr += data.toString(); });

      child.on('spawn', () => {
        child.stdin.write(`${password}\n`);
        if (stdin) {
          child.stdin.write(stdin);
        }
        child.stdin.end();
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;

        if (code === 0) {
          resolve({ stdout, stderr });
          return;
        }

        if (INVALID_PASSWORD_PATTERN.test(stderr)) {
          reject(createAppError(401, 'INVALID_SUDO_PASSWORD', '管理员密码错误'));
          return;
        }

        reject(createAppError(500, 'SUDO_COMMAND_FAILED', stderr.trim() || `命令执行失败 (exit code: ${code})`));
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          reject(createAppError(500, 'SUDO_EXEC_ERROR', `执行失败: ${error.message}`));
        }
      });
    });
  }

  async readFile(filePath, password) {
    const { stdout } = await this.execute('cat', [filePath], password);
    return stdout;
  }

  async writeFile(filePath, content, password) {
    await this.execute('tee', [filePath], password, { stdin: content || '' });
  }
}

module.exports = new SudoCommandService();
