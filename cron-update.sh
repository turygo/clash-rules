#!/usr/bin/env bash
# 部署在「能正常访问目标站」的 VPS 上，由 crontab 每天调用：
#   git pull → 解析合并域名 → 有变化则提交推送。
# 必须跑在未被站点屏蔽的 IP 上（GitHub 托管 runner 的 Azure IP 会被 403）。
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"

git pull --quiet --rebase --autostash

# update-list.js：成功退出 0（无论有无新增）；所有种子全失败退出 2 → 不提交，保留原清单
if node update-list.js; then
  if [[ -n "$(git status --porcelain sports-live.list)" ]]; then
    git add sports-live.list
    git commit -q -m "chore: auto-update sports-live domains ($(date -u +%F))"
    git push -q
    echo "已更新并推送"
  else
    echo "无新增域名"
  fi
else
  echo "解析全部失败（IP 可能被屏蔽），保留原清单不提交" >&2
fi
