#!/bin/zsh
cloud_host=${CLOUD_SSH_HOST:-aliyun}
cloud_dir=${CLOUD_TUNNEL_DIR:-$HOME/ideaProjects/new-api/.local/cloud}
disconnect_result=0
for socket in "$cloud_dir/ssh-oauth-control" "$cloud_dir/ssh-control"; do
  if [[ ! -S "$socket" ]]; then
    print -- "通道已断开，无需重复关闭：${socket:t}"
    continue
  fi
  if ssh -S "$socket" -O check "$cloud_host" >/dev/null 2>&1; then
    if ! ssh -S "$socket" -O exit "$cloud_host"; then
      print -u2 -- "关闭通道失败：${socket:t}"
      disconnect_result=1
    fi
  else
    print -u2 -- "通道控制文件存在但无法确认状态：${socket:t}"
    disconnect_result=1
  fi
done
exit "$disconnect_result"
