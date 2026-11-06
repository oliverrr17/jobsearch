#!/bin/zsh
cd "$(dirname "$0")" || exit 1
SCOUT_NODE="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
if [[ ! -x "$SCOUT_NODE" ]]; then SCOUT_NODE=$(command -v node); fi
if [[ -z "$SCOUT_NODE" ]]; then print '请先安装 Node.js 20 或更高版本'; read; exit 1; fi
print "打开 http://127.0.0.1:${JOB_SCOUT_PORT:-8765} 使用岗位研究台。关闭服务请按 Ctrl+C。"
"$SCOUT_NODE" launch.mjs
