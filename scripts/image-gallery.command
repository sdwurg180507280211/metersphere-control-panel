#!/bin/bash
set -euo pipefail
url='http://39.102.212.37/image-gallery/'
repo="${IMAGE_GALLERY_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)/image-gallery}"
case "${1:-open}" in
  open|browse) open "$url" ;;
  styles) python3 "$repo/scripts/manage-wechat.py" ;;
  stop) printf '图库由阿里云持续托管，无需停止；关闭浏览器标签页即可。\n' ;;
  deploy|rollback)
    cd "$repo"
    bash scripts/deploy-aliyun.sh "${1}"
    ;;
  *) printf 'Usage: %s [open|styles|browse|stop|deploy|rollback]\n' "$0" >&2; exit 2 ;;
esac
