/**
 * 共享状态和常量
 */
const path = require('path');
const fs = require('fs');

const PID_DIR = path.join(__dirname, '../../../.pids');
const BATCH_START_HEALTH_TIMEOUT = 120000;
const BATCH_START_HEALTH_INTERVAL = 3000;

if (!fs.existsSync(PID_DIR)) {
  fs.mkdirSync(PID_DIR, { recursive: true });
}

const serviceProcesses = new Map();
const serviceStatuses = new Map();
const buildProcesses = new Map();
const devServerProcesses = new Map();
const TRANSITIONAL_SERVICE_PHASES = new Set(['starting', 'checking_health', 'stopping', 'restarting']);

module.exports = {
  PID_DIR,
  BATCH_START_HEALTH_TIMEOUT,
  BATCH_START_HEALTH_INTERVAL,
  serviceProcesses,
  serviceStatuses,
  buildProcesses,
  devServerProcesses,
  TRANSITIONAL_SERVICE_PHASES
};
