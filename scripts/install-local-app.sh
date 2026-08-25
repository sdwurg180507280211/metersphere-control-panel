#!/bin/bash
set -euo pipefail

APP_NAME="Local Service Hub"
INSTALL_DIR="${LOCAL_SERVICE_HUB_INSTALL_DIR:-/Applications}"
TARGET_APP="${INSTALL_DIR}/${APP_NAME}.app"
ICON_PATH="build/icon.icns"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "错误：install:local 仅支持 macOS。" >&2
  exit 1
fi

if [[ ! -f "$ICON_PATH" ]]; then
  echo "错误：未找到 $ICON_PATH" >&2
  echo "请先把正式 App 图标保存为 build/icon.icns，然后重新运行 npm run install:local。" >&2
  exit 1
fi

echo "[1/4] 构建 ${APP_NAME}.app"
npm run electron:app

SOURCE_APP="$(find dist -maxdepth 3 -type d -name "${APP_NAME}.app" -print -quit)"
if [[ -z "$SOURCE_APP" || ! -d "$SOURCE_APP" ]]; then
  echo "错误：构建完成后未找到 ${APP_NAME}.app" >&2
  exit 1
fi

echo "[2/4] 退出已安装的 ${APP_NAME}"
osascript -e "tell application \"${APP_NAME}\" to quit" >/dev/null 2>&1 || true

for _ in {1..50}; do
  if ! pgrep -f "${TARGET_APP}/Contents/MacOS/${APP_NAME}" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done

if pgrep -f "${TARGET_APP}/Contents/MacOS/${APP_NAME}" >/dev/null 2>&1; then
  echo "错误：${APP_NAME} 未能正常退出。请手动退出应用后重新运行 npm run install:local。" >&2
  exit 1
fi

echo "[3/4] 安装到 ${TARGET_APP}"
mkdir -p "$INSTALL_DIR"
rm -rf "$TARGET_APP"
ditto "$SOURCE_APP" "$TARGET_APP"

echo "[4/4] 启动 ${APP_NAME}"
open "$TARGET_APP"

echo "完成：${TARGET_APP} 已更新并启动。"
