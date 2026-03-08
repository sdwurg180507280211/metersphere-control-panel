#!/usr/bin/env node
/**
 * 优雅地清理占用指定端口的进程
 * 
 * 相比 kill -9，此脚本会：
 * 1. 先尝试 SIGTERM 优雅终止
 * 2. 等待一段时间
 * 3. 如果进程仍在运行，再使用 SIGKILL 强制终止
 */

const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const PORT = process.argv[2] || '3000';
const TIMEOUT = parseInt(process.argv[3], 10) || 5000;

async function findPidByPort(port) {
  try {
    // macOS/Linux
    const { stdout } = await execAsync(`lsof -ti tcp:${port}`);
    const pids = stdout.trim().split('\n').filter(Boolean);
    return pids.map((pid) => parseInt(pid, 10)).filter((pid) => !isNaN(pid));
  } catch (error) {
    // 可能没有进程占用该端口
    return [];
  }
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return false;
  }
}

async function gracefulKill(pid, timeout = 5000) {
  if (!isProcessRunning(pid)) {
    console.log(`  进程 ${pid} 已经停止`);
    return true;
  }

  // 尝试优雅终止
  console.log(`  发送 SIGTERM 到进程 ${pid}...`);
  try {
    process.kill(pid, 'SIGTERM');
  } catch (error) {
    console.log(`  发送 SIGTERM 失败: ${error.message}`);
  }

  // 等待进程退出
  const startTime = Date.now();
  while (isProcessRunning(pid) && Date.now() - startTime < timeout) {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  if (!isProcessRunning(pid)) {
    console.log(`  进程 ${pid} 已优雅停止`);
    return true;
  }

  // 强制终止
  console.log(`  进程 ${pid} 未响应，发送 SIGKILL...`);
  try {
    process.kill(pid, 'SIGKILL');
    await new Promise((resolve) => setTimeout(resolve, 500));
    console.log(`  进程 ${pid} 已强制停止`);
    return true;
  } catch (error) {
    console.log(`  强制终止失败: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log(`🔍 检查端口 ${PORT}...`);

  const pids = await findPidByPort(PORT);

  if (pids.length === 0) {
    console.log(`✅ 端口 ${PORT} 未被占用`);
    process.exit(0);
  }

  console.log(`📍 发现 ${pids.length} 个进程占用端口 ${PORT}: ${pids.join(', ')}`);

  let successCount = 0;
  for (const pid of pids) {
    console.log(`\n🛑 停止进程 ${pid}...`);
    const success = await gracefulKill(pid, TIMEOUT);
    if (success) successCount++;
  }

  console.log(`\n✅ 已清理 ${successCount}/${pids.length} 个进程`);
  
  // 再次检查
  const remaining = await findPidByPort(PORT);
  if (remaining.length > 0) {
    console.log(`⚠️  端口 ${PORT} 仍被进程 ${remaining.join(', ')} 占用`);
    process.exit(1);
  } else {
    console.log(`✅ 端口 ${PORT} 已释放`);
    process.exit(0);
  }
}

main().catch((error) => {
  console.error('清理端口失败:', error.message);
  process.exit(1);
});
