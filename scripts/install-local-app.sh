#!/bin/bash
set -euo pipefail

APP_NAME="Local Service Hub"
INSTALL_DIR="${LOCAL_SERVICE_HUB_INSTALL_DIR:-/Applications}"
TARGET_APP="${INSTALL_DIR}/${APP_NAME}.app"
STAGING_APP="${TARGET_APP}.new"
BACKUP_APP="${TARGET_APP}.previous"
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

cleanup_staging() {
  rm -rf "$STAGING_APP"
}

rollback_install() {
  echo "检测到新版本启动失败，正在回滚旧版本..." >&2
  rm -rf "$TARGET_APP"
  if [[ -d "$BACKUP_APP" ]]; then
    mv "$BACKUP_APP" "$TARGET_APP"
    open "$TARGET_APP" >/dev/null 2>&1 || true
    echo "已恢复旧版本：$TARGET_APP" >&2
  fi
}

trap cleanup_staging EXIT

echo "[1/6] 校验桌面端代码与前端构建"
npm run verify:desktop

echo "[2/6] 生成 ${APP_NAME}.app"
npx electron-builder --mac --dir

SOURCE_APP="$(find dist -maxdepth 3 -type d -name "${APP_NAME}.app" -print -quit)"
if [[ -z "$SOURCE_APP" || ! -d "$SOURCE_APP" ]]; then
  echo "错误：构建完成后未找到 ${APP_NAME}.app" >&2
  exit 1
fi

SOURCE_EXECUTABLE="${SOURCE_APP}/Contents/MacOS/${APP_NAME}"
if [[ ! -x "$SOURCE_EXECUTABLE" || ! -f "${SOURCE_APP}/Contents/Info.plist" ]]; then
  echo "错误：构建产物不完整，缺少可执行文件或 Info.plist。" >&2
  exit 1
fi

echo "[3/6] 预复制新版本"
mkdir -p "$INSTALL_DIR"
rm -rf "$STAGING_APP"
ditto "$SOURCE_APP" "$STAGING_APP"

STAGING_EXECUTABLE="${STAGING_APP}/Contents/MacOS/${APP_NAME}"
if [[ ! -x "$STAGING_EXECUTABLE" || ! -f "${STAGING_APP}/Contents/Info.plist" ]]; then
  echo "错误：预复制后的 App 校验失败，保留当前已安装版本。" >&2
  exit 1
fi

echo "[4/6] 正常退出当前版本"
osascript -e "tell application \"${APP_NAME}\" to quit" >/dev/null 2>&1 || true

for _ in {1..50}; do
  if ! pgrep -f "${TARGET_APP}/Contents/MacOS/${APP_NAME}" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done

if pgrep -f "${TARGET_APP}/Contents/MacOS/${APP_NAME}" >/dev/null 2>&1; then
  echo "错误：${APP_NAME} 未能正常退出。旧版本未被替换。" >&2
  echo "请手动退出应用后重新运行 npm run install:local。" >&2
  exit 1
fi

echo "[5/6] 原子替换 /Applications 中的版本"
rm -rf "$BACKUP_APP"
if [[ -d "$TARGET_APP" ]]; then
  mv "$TARGET_APP" "$BACKUP_APP"
fi

if ! mv "$STAGING_APP" "$TARGET_APP"; then
  echo "错误：新版本替换失败，正在恢复旧版本。" >&2
  if [[ -d "$BACKUP_APP" ]]; then
    mv "$BACKUP_APP" "$TARGET_APP"
  fi
  exit 1
fi

echo "[6/6] 启动并验证新版本"
if ! open "$TARGET_APP"; then
  rollback_install
  exit 1
fi

launched=false
for _ in {1..50}; do
  if pgrep -f "${TARGET_APP}/Contents/MacOS/${APP_NAME}" >/dev/null 2>&1; then
    launched=true
    break
  fi
  sleep 0.1
done

if [[ "$launched" != "true" ]]; then
  rollback_install
  exit 1
fi

rm -rf "$BACKUP_APP"
trap - EXIT

echo "完成：${TARGET_APP} 已安全更新并启动。"
