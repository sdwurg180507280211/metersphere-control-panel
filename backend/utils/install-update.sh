#!/bin/bash
set -euo pipefail
CURRENT_PID="$1"
TARGET_APP="$2"
STAGED_APP="$3"
UPDATE_DIR="$4"
MODE="${5:-full}"
EXPECTED_VERSION="$6"
NONCE="$7"
APP_NAME='Local Service Hub'
TARGET_EXECUTABLE="$TARGET_APP/Contents/MacOS/$APP_NAME"
NEW_APP="$TARGET_APP.new"
BACKUP_APP="$TARGET_APP.previous"
STAGED_APP_DIR="$STAGED_APP/Contents/Resources/app"
NEW_APP_DIR="$NEW_APP/Contents/Resources/app"
READY_FILE="$UPDATE_DIR/ready-$NONCE"
LOG_FILE="$UPDATE_DIR/update-helper.log"
exec >>"$LOG_FILE" 2>&1
printf '[%s] updater started (mode=%s)\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$MODE"
[[ "$NONCE" =~ ^[a-f0-9]{64}$ ]] || exit 1
[[ "$EXPECTED_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || exit 1
for _ in {1..150}; do
  if ! kill -0 "$CURRENT_PID" >/dev/null 2>&1; then break; fi
  sleep 0.1
done
if kill -0 "$CURRENT_PID" >/dev/null 2>&1; then echo '旧版本未能退出'; exit 1; fi
# A previous backup can represent an interrupted earlier update. Never erase it blindly.
if [[ -e "$BACKUP_APP" ]]; then echo '存在待处理的上一版备份，保留现场并拒绝覆盖'; exit 1; fi
rm -rf "$NEW_APP"
if [[ "$MODE" == 'delta' ]]; then
  test -f "$STAGED_APP/Contents/Info.plist"
  test -f "$STAGED_APP_DIR/package.json"
  if ! cp -cR "$TARGET_APP" "$NEW_APP" 2>/dev/null; then rm -rf "$NEW_APP"; cp -R "$TARGET_APP" "$NEW_APP"; fi
  rm -rf "$NEW_APP_DIR"
  ditto "$STAGED_APP_DIR" "$NEW_APP_DIR"
  cp -f "$STAGED_APP/Contents/Info.plist" "$NEW_APP/Contents/Info.plist"
else
  ditto "$STAGED_APP" "$NEW_APP"
  test -f "$NEW_APP/Contents/Info.plist"
fi
test -x "$NEW_APP/Contents/MacOS/$APP_NAME"
mv "$TARGET_APP" "$BACKUP_APP"
NEW_PID=''
is_new_running() {
  [[ -n "$NEW_PID" ]] && jobs -pr | grep -Fxq "$NEW_PID" && kill -0 "$NEW_PID" >/dev/null 2>&1
}
rollback() {
  echo '新版本未通过应用就绪确认，恢复旧版本'
  if is_new_running; then
    kill -TERM "$NEW_PID" >/dev/null 2>&1 || true
    for _ in {1..50}; do
      if ! is_new_running; then break; fi
      sleep 0.1
    done
    # Do not force-kill an arbitrary pgrep match; the PID must still belong to this shell's running job table.
    if is_new_running; then kill -KILL "$NEW_PID" >/dev/null 2>&1 || true; fi
    wait "$NEW_PID" 2>/dev/null || true
  fi
  rm -rf "$NEW_APP" "$TARGET_APP"
  if [[ -d "$BACKUP_APP" ]]; then mv "$BACKUP_APP" "$TARGET_APP"; open "$TARGET_APP" >/dev/null 2>&1 || true; fi
}
if ! mv "$NEW_APP" "$TARGET_APP"; then rollback; exit 1; fi
# Direct launch binds nonce, version and readiness path to this exact process.
MS_UPDATE_READY_FILE="$READY_FILE" MS_UPDATE_NONCE="$NONCE" MS_UPDATE_EXPECTED_VERSION="$EXPECTED_VERSION" \
  "$TARGET_EXECUTABLE" >/dev/null 2>&1 &
NEW_PID=$!
ready=false
for _ in {1..600}; do
  if ! is_new_running; then break; fi
  if [[ -f "$READY_FILE" && ! -L "$READY_FILE" ]] \
    && [[ "$(sed -n '1p' "$READY_FILE")" == "$EXPECTED_VERSION" ]] \
    && [[ "$(sed -n '2p' "$READY_FILE")" == "$NONCE" ]] \
    && [[ "$(sed -n '3p' "$READY_FILE")" == "$NEW_PID" ]]; then ready=true; break; fi
  sleep 0.1
done
if [[ "$ready" != true ]]; then rollback; exit 1; fi
sleep 2
if ! is_new_running; then rollback; exit 1; fi
rm -rf "$BACKUP_APP"
printf '[%s] update completed; confirmed by version=%s pid=%s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$EXPECTED_VERSION" "$NEW_PID"
