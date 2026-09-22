#!/bin/zsh
set -e
# Set CLOUD_SSH_HOST and CLOUD_TUNNEL_DIR for another machine.
cloud_host=${CLOUD_SSH_HOST:-aliyun}
cloud_dir=${CLOUD_TUNNEL_DIR:-$HOME/ideaProjects/new-api/.local/cloud}
mkdir -p "$cloud_dir"
socket="$cloud_dir/ssh-control"
if ! ssh -S "$socket" -O check "$cloud_host" 2>/dev/null; then
  ssh -M -S "$socket" -fN -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -L 127.0.0.1:13001:127.0.0.1:3001 -L 127.0.0.1:18317:127.0.0.1:8317 "$cloud_host"
fi
oauth_socket="$cloud_dir/ssh-oauth-control"
if ! ssh -S "$oauth_socket" -O check "$cloud_host" 2>/dev/null; then
  ssh -M -S "$oauth_socket" -fN -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -L 127.0.0.1:1455:127.0.0.1:1455 -L 127.0.0.1:51121:127.0.0.1:51121 "$cloud_host"
fi
open http://127.0.0.1:13001
open http://127.0.0.1:18317/management.html
