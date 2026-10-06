#!/bin/bash
set -euo pipefail

action="${1:-open}"
repo="${EVENT_QNA_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)/event-qna}"
port="${EVENT_QNA_PORT:-3036}"
live_base="${EVENT_QNA_LIVE_URL:-http://39.102.212.37:3036}"
case "$port" in ''|*[!0-9]*) printf '本地端口无效。\n' >&2; exit 2 ;; esac
if [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then printf '本地端口无效。\n' >&2; exit 2; fi
local_base="http://127.0.0.1:$port"

case "$action" in
  live) open "$live_base/event/demo/ask"; exit ;;
  live-admin) open "$live_base/admin"; exit ;;
  live-display) open "$live_base/event/demo/display"; exit ;;
  live-stop) printf '线上提问系统由阿里云持续运行；此入口不停止云端服务，关闭浏览器标签页即可。\n'; exit ;;
esac

if [ ! -d "$repo" ]; then printf '未找到 event-qna 项目：%s\n' "$repo" >&2; exit 1; fi
repo="$(cd "$repo" && pwd -P)"
state="$repo/.local/control-panel"
log="$state/development.log"

listeners() { lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true; }
owned() {
  local pid="$1" owner command
  owner="$(ps -p "$pid" -o uid= 2>/dev/null | tr -d ' ')"
  [ "$owner" = "$(id -u)" ] || return 1
  lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | grep -Fxq "n$repo" || return 1
  command="$(ps -p "$pid" -o command= 2>/dev/null)"
  printf '%s\n' "$command" | grep -Eq '(^|/)(node|npm|next)([[:space:]-]|$)'
}
assert_listeners_owned() {
  local pid
  for pid in $(listeners); do
    if ! owned "$pid"; then
      printf '端口 %s 被其他项目占用，不会启动或关闭该进程。\n' "$port" >&2
      return 1
    fi
  done
}
healthy() { curl -fsS --max-time 3 "$local_base/api/health" >/dev/null 2>&1; }

case "$action" in
  start)
    assert_listeners_owned
    if [ -n "$(listeners)" ]; then
      if healthy; then printf 'Event Q&A 已运行：%s/event/demo/ask\n' "$local_base"; exit; fi
      printf '项目端口已运行但健康检查失败，请查看项目日志。\n' >&2; exit 1
    fi
    [ -f "$repo/.env" ] || { printf '请先按 event-qna README 配置 .env。\n' >&2; exit 1; }
    [ -f "$repo/node_modules/next/dist/bin/next" ] || { printf '请先安装 event-qna 依赖。\n' >&2; exit 1; }
    node="${EVENT_QNA_NODE:-}"
    if [ -z "$node" ]; then
      node="$(/usr/bin/python3 - <<'PY'
from pathlib import Path
import shutil
def version(p):
    try: return tuple(int(n) for n in p.parent.parent.name.lstrip('v').split('.'))
    except ValueError: return (0,)
candidates = sorted(Path.home().glob('.nvm/versions/node/v*/bin/node'), key=version, reverse=True)
print(str(candidates[0]) if candidates else (shutil.which('node') or ''))
PY
)"
    fi
    [ -x "$node" ] || { printf '未找到 Node.js，请设置 EVENT_QNA_NODE。\n' >&2; exit 1; }
    "$node" -e 'if(Number(process.versions.node.split(".")[0])<22)process.exit(1)' || { printf '需要 Node.js 22 或更新版本。\n' >&2; exit 1; }
    docker="$(command -v docker || true)"
    if [ -z "$docker" ] && [ -x /Applications/Docker.app/Contents/Resources/bin/docker ]; then docker=/Applications/Docker.app/Contents/Resources/bin/docker; fi
    [ -n "$docker" ] || { printf '请先安装并打开 Docker Desktop。\n' >&2; exit 1; }
    cd "$repo"
    "$docker" compose up -d --pull never postgres
    mkdir -p "$state"
    chmod 700 "$state"
    export PATH="$(dirname "$node"):$PATH"
    launch_pid="$("$node" - "$repo" "$port" "$log" <<'JS'
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const [repo, port, log] = process.argv.slice(2);
const fd = fs.openSync(log, 'a', 0o600);
const child = spawn(process.execPath, [path.join(repo, 'node_modules/next/dist/bin/next'), 'dev', '--port', port], {
  cwd: repo, env: process.env, detached: true, stdio: ['ignore', fd, fd],
});
fs.closeSync(fd);
child.once('error', () => { console.error('无法创建本地开发进程。'); process.exitCode = 1; });
child.unref();
if (child.pid) console.log(child.pid);
JS
)"
    for attempt in $(seq 1 45); do
      if healthy; then assert_listeners_owned; printf 'Event Q&A 已启动：%s/event/demo/ask\n' "$local_base"; exit; fi
      if ! kill -0 "$launch_pid" 2>/dev/null; then printf '启动失败，日志：%s\n' "$log" >&2; exit 1; fi
      sleep 1
    done
    printf '启动尚未通过健康检查，请查看：%s\n' "$log" >&2; exit 1
    ;;
  stop)
    assert_listeners_owned
    pids="$(listeners)"
    if [ -z "$pids" ]; then printf 'Event Q&A 本地服务已关闭。\n'; exit; fi
    for pid in $pids; do
      parent="$(ps -p "$pid" -o ppid= 2>/dev/null | tr -d ' ')"
      command="$(ps -p "$parent" -o command= 2>/dev/null || true)"
      if owned "$parent" && [[ "$command" == *next* && "$command" == *"--port $port"* ]]; then
        kill -TERM "$parent"
      else
        kill -TERM "$pid"
      fi
    done
    for attempt in $(seq 1 15); do
      if [ -z "$(listeners)" ]; then printf 'Event Q&A 本地应用已关闭，数据库保留运行。\n'; exit; fi
      sleep 1
    done
    printf '关闭尚未完成，请核对本地项目进程；不会强制终止其他服务。\n' >&2; exit 1
    ;;
  status)
    assert_listeners_owned
    if [ -n "$(listeners)" ] && healthy; then printf '本地项目正常运行：%s\n' "$local_base"; else printf '本地项目未运行或未通过健康检查。\n'; exit 1; fi
    ;;
  open) open "$local_base/event/demo/ask" ;;
  admin) open "$local_base/admin" ;;
  display) open "$local_base/event/demo/display" ;;
  preview) open "$local_base/event/brand-preview/ask" ;;
  *) printf 'Usage: %s [start|stop|status|open|admin|display|preview|live|live-admin|live-display|live-stop]\n' "$0" >&2; exit 2 ;;
esac
