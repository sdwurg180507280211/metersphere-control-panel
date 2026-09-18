// A tiny test-only application. It acknowledges its own version/nonce/PID and
// stays alive while the helper retains the old bundle; it exits on cleanup.
function acknowledgingExecutable(ready = true) {
  if (!ready) return '#!/bin/sh\nexit 1\n';
  return `#!/bin/sh
set -eu
printf '%s\\n%s\\n%s\\n' "$MS_UPDATE_EXPECTED_VERSION" "$MS_UPDATE_NONCE" "$$" > "$MS_UPDATE_READY_FILE"
bundle="\${0%/Contents/MacOS/*}"
count=0
while [ -d "$bundle.previous" ] && [ -d "$bundle" ] && [ "$count" -lt 1000 ]; do
  /bin/sleep 0.01
  count=$((count + 1))
done
`;
}
module.exports = { acknowledgingExecutable };
