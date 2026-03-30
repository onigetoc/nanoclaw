#!/bin/bash
# Restart EureClaw script (macOS / Linux)

echo -e "\033[33mStopping EureClaw...\033[0m"

# Kill only EureClaw runtime processes (avoid killing editor tsserver, etc.)
pgrep -f 'src/index\.ts|scripts/start-with-opencode\.js|scripts/run-with-restart\.js|container/agent-runner/(src|dist)/index\.ts|container/agent-runner/dist/ipc-mcp-stdio\.js|opencode.*serve' | while read pid; do
  cmdline=$(ps -p "$pid" -o args= 2>/dev/null)
  # Skip dev tooling
  if echo "$cmdline" | grep -qE 'tsserver\.js|typingsInstaller\.js'; then
    continue
  fi
  echo -e "\033[31mKilling process $pid: $cmdline\033[0m"
  kill -9 "$pid" 2>/dev/null
done

echo -e "\033[33mWaiting 2 seconds...\033[0m"
sleep 2

echo -e "\033[32mStarting EureClaw...\033[0m"
bun start
