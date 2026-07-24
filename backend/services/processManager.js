/**
 * ProcessManager compatibility entry.
 *
 * Node resolves this file before the ./processManager directory. The existing
 * implementation remains in ./processManager/index.js; this entry only
 * replaces the Unix-specific process launch and log-tail helpers with
 * cross-platform Node implementations and adds Windows process discovery.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const processManager = require('./processManager/index');
const logger = require('../utils/logger');
const { serviceProcesses } = require('./processManager/shared');

function closeFd(fd) {
  if (typeof fd !== 'number') return;
  try {
    fs.closeSync(fd);
  } catch {
    // Ignore descriptors already closed by the runtime.
  }
}

processManager._spawnDetachedService = function spawnDetachedService(
  mavenCommand,
  serviceConfig,
  javaToolOptions,
  serviceLogFile
) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(serviceLogFile), { recursive: true });
    const stdoutFd = fs.openSync(serviceLogFile, 'a');
    const stderrFd = fs.openSync(serviceLogFile, 'a');
    const env = this._getExtendedEnv({
      ...process.env,
      ...(javaToolOptions ? { JAVA_TOOL_OPTIONS: javaToolOptions } : {})
    }, mavenCommand);

    const child = spawn(
      mavenCommand,
      ['-f', serviceConfig.pom, 'clean', 'spring-boot:run'],
      {
        cwd: this._getProjectRoot(),
        detached: true,
        windowsHide: true,
        shell: process.platform === 'win32',
        stdio: ['ignore', stdoutFd, stderrFd],
        env
      }
    );

    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      closeFd(stdoutFd);
      closeFd(stderrFd);
      callback(value);
    };

    child.once('error', (error) => finish(reject, error));
    child.once('spawn', () => {
      child.unref();
      finish(resolve, child);
    });
  });
};

processManager._stopServiceLogTail = function stopServiceLogTail(serviceId) {
  const existing = serviceProcesses.get(serviceId);
  if (!existing?.tailProcess) return;

  try {
    existing.tailProcess.kill?.();
    existing.tailProcess.close?.();
  } catch {
    // Ignore watcher cleanup failures.
  }
  existing.tailProcess = null;
};

processManager._attachServiceLogTail = function attachServiceLogTail(serviceId) {
  const serviceLogFile = path.join(this.logDir, `${serviceId}.log`);
  fs.mkdirSync(path.dirname(serviceLogFile), { recursive: true });
  fs.closeSync(fs.openSync(serviceLogFile, 'a'));
  this._stopServiceLogTail(serviceId);

  let position = fs.statSync(serviceLogFile).size;
  let reading = false;
  let closed = false;

  const readAppendedContent = async (currentSize) => {
    if (closed || reading) return;
    reading = true;

    try {
      if (currentSize < position) {
        position = 0;
      }
      if (currentSize === position) return;

      const length = currentSize - position;
      const handle = await fs.promises.open(serviceLogFile, 'r');
      try {
        const buffer = Buffer.alloc(length);
        const { bytesRead } = await handle.read(buffer, 0, length, position);
        position += bytesRead;
        if (bytesRead > 0) {
          logger.broadcast(buffer.subarray(0, bytesRead).toString(), 'service', serviceId);
        }
      } finally {
        await handle.close();
      }
    } catch (error) {
      logger.broadcast(`日志监控错误: ${error.message}`, 'service', serviceId);
    } finally {
      reading = false;
    }
  };

  const listener = (current) => {
    readAppendedContent(current.size).catch(() => {});
  };

  fs.watchFile(serviceLogFile, { interval: 500, persistent: false }, listener);

  return {
    kill() {
      if (closed) return;
      closed = true;
      fs.unwatchFile(serviceLogFile, listener);
    }
  };
};

if (process.platform === 'win32') {
  const runPowerShell = async (script) => {
    return processManager._execFileSafe('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      script
    ]);
  };

  processManager._findPidsByPort = async function findPidsByPort(port) {
    if (!port) return [];
    const output = await this._execFileSafe('netstat.exe', ['-ano', '-p', 'tcp']);
    const target = `:${port}`;
    return [...new Set(output.split(/\r?\n/).flatMap((line) => {
      const columns = line.trim().split(/\s+/);
      if (columns.length < 5 || columns[0].toUpperCase() !== 'TCP') return [];
      if (!columns[1].endsWith(target) || columns[3].toUpperCase() !== 'LISTENING') return [];
      const pid = Number.parseInt(columns[4], 10);
      return Number.isNaN(pid) || pid === process.pid ? [] : [pid];
    }))];
  };

  processManager._findChildPids = async function findChildPids(parentPid) {
    const output = await runPowerShell(
      `Get-CimInstance Win32_Process -Filter \"ParentProcessId=${Number(parentPid)}\" | Select-Object -ExpandProperty ProcessId`
    );
    return output.split(/\s+/).map(Number).filter(Number.isInteger);
  };

  processManager._getProcessCmdline = async function getProcessCmdline(pid) {
    const output = await runPowerShell(
      `(Get-CimInstance Win32_Process -Filter \"ProcessId=${Number(pid)}\").CommandLine`
    );
    return output.trim();
  };

  processManager._findPidsByPom = async function findPidsByPom(pom) {
    const escapedPom = String(pom || '').replace(/'/g, "''");
    const output = await runPowerShell(
      `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${escapedPom}*' } | Select-Object -ExpandProperty ProcessId`
    );
    return output
      .split(/\s+/)
      .map(Number)
      .filter((pid) => Number.isInteger(pid) && pid !== process.pid);
  };
}

module.exports = processManager;
