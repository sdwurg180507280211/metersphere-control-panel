const { createAppError } = require('../utils/errors');

// The desktop backend is a single process. Reserve synchronously, before any
// persistence await, so an installation cannot race an unpublished job.
let maintenance = false;
let creating = 0;
function assertAllowed() {
  if (maintenance) throw createAppError(409, 'DESKTOP_UPDATE_MAINTENANCE', '应用正在安装更新，暂时不能启动新任务');
}
function reserve() {
  assertAllowed();
  creating += 1;
  let released = false;
  return () => { if (!released) { released = true; creating -= 1; } };
}
function enterMaintenance() {
  assertAllowed();
  if (creating) throw createAppError(409, 'DESKTOP_UPDATE_TASKS_ACTIVE', '有任务正在创建，请任务结束后再更新');
  maintenance = true;
  let released = false;
  return () => { if (!released) { released = true; maintenance = false; } };
}
module.exports = { assertAllowed, reserve, enterMaintenance };
