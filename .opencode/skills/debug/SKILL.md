---
name: debug
description: Debug container agent issues. Use when things aren't working, container fails, authentication problems, or to understand how the container system works. Covers logs, environment variables, mounts, and common issues.
---

# EureClaw Container Debugging

This guide covers debugging the containerized agent execution system.

## Architecture Overview

```
Host (macOS)                          Container (Linux VM)
─────────────────────────────────────────────────────────────
src/container-runner.ts               container/agent-runner/
    │                                      │
    │ spawns Apple Container               │ runs OpenCode SDK
    │ with volume mounts                   │ with MCP servers
    │                                      │
    ├── data/env/env ──────────────> /workspace/env-dir/env
    ├── workspaces/{folder} ───────────> /workspace/group
    ├── data/ipc/{folder} ────────> /workspace/ipc
    ├── data/sessions/{folder}/.opencode/ ──> /home/node/.opencode/ (isolated per-workspace)
    └── (main only) project root ──> /workspace/project
```

**Important:** The container runs as user `node` with `HOME=/home/node`. Session files must be mounted to `/home/node/.opencode/` (not `/root/.opencode/`) for session resumption to work.

## Log Locations

| Log | Location | Content |
|-----|----------|---------|
| **Main app logs** | `logs/eureclaw.log` | Host-side WhatsApp, routing, container spawning |
| **Main app errors** | `logs/eureclaw.error.log` | Host-side errors |
| **Container run logs** | `workspaces/{folder}/logs/container-*.log` | Per-run: input, mounts, stderr, stdout |
| **opencode sessions** | `~/.opencode/projects/` | OpenCode session history |

## Enabling Debug Logging

Set `LOG_LEVEL=debug` for verbose output:

```bash
# For development
LOG_LEVEL=debug npm run dev

# For launchd service, add to plist EnvironmentVariables:
<key>LOG_LEVEL</key>
<string>debug</string>
```

Debug level shows:
- Full mount configurations
- Container command arguments
- Real-time container stderr

## Common Issues

### 1. "OpenCode process exited with code 1"

**Check the container log file** in `workspaces/{folder}/logs/container-*.log`

Common causes:

#### Missing Authentication
```
Invalid API key · Please run /login
```
**Fix:** Ensure `.env` file exists with either OAuth token or API key:
```bash
cat .env  # Should show one of:
# opencode_CODE_OAUTH_TOKEN=sk-ant-oat01-...  (subscription)
# ANTHROPIC_API_KEY=sk-ant-api03-...        (pay-per-use)
```

#### Root User Restriction
```
--dangerously-skip-permissions cannot be used with root/sudo privileges
```
**Fix:** Container must run as non-root user. Check Dockerfile has `USER node`.

### 2. Environment Variables Not Passing

**Apple Container Bug:** Environment variables passed via `-e` are lost when using `-i` (interactive/piped stdin).

**Workaround:** The system extracts only authentication variables (`opencode_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY`) from `.env` and mounts them for sourcing inside the container. Other env vars are not exposed.

To verify env vars are reaching the container:
```bash
echo '{}' | container run -i \
  --mount type=bind,source=$(pwd)/data/env,target=/workspace/env-dir,readonly \
  --entrypoint /bin/bash eureclaw-agent:latest \
  -c 'export $(cat /workspace/env-dir/env | xargs); echo "OAuth: ${#opencode_CODE_OAUTH_TOKEN} chars, API: ${#ANTHROPIC_API_KEY} chars"'
```

### 3. Mount Issues

**Apple Container quirks:**
- Only mounts directories, not individual files
- `-v` syntax does NOT support `:ro` suffix - use `--mount` for readonly:
  ```bash
  # Readonly: use --mount
  --mount "type=bind,source=/path,target=/container/path,readonly"

  # Read-write: use -v
  -v /path:/container/path
  ```

To check what's mounted inside a container:
```bash
container run --rm --entrypoint /bin/bash eureclaw-agent:latest -c 'ls -la /workspace/'
```

Expected structure:
```
/workspace/
├── env-dir/env           # Environment file (opencode_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY)
├── group/                # Current workspace folder (cwd)
├── project/              # Project root (main channel only)
├── global/               # Global AGENTS.md (non-main only)
├── ipc/                  # Inter-process communication
│   ├── messages/         # Outgoing WhatsApp messages
│   ├── tasks/            # Scheduled task commands
│   ├── current_tasks.json    # Read-only: scheduled tasks visible to this workspace
│   └── available_workspaces.json # Read-only: WhatsApp groups for activation (main only)
└── extra/                # Additional custom mounts
```

### 4. Permission Issues

The container runs as user `node` (uid 1000). Check ownership:
```bash
container run --rm --entrypoint /bin/bash eureclaw-agent:latest -c '
  whoami
  ls -la /workspace/
  ls -la /app/
'
```

All of `/workspace/` and `/app/` should be owned by `node`.

### 5. Session Not Resuming / "OpenCode process exited with code 1"

If sessions aren't being resumed (new session ID every time), or OpenCode exits with code 1 when resuming:

**Root cause:** The SDK looks for sessions at `$HOME/.opencode/projects/`. Inside the container, `HOME=/home/node`, so it looks at `/home/node/.opencode/projects/`.

**Check the mount path:**
```bash
# In container-runner.ts, verify mount is to /home/node/.opencode/, NOT /root/.opencode/
grep -A3 "opencode sessions" src/container-runner.ts
```

**Verify sessions are accessible:**
```bash
container run --rm --entrypoint /bin/bash \
  -v ~/.opencode:/home/node/.opencode \
  eureclaw-agent:latest -c '
echo "HOME=$HOME"
ls -la $HOME/.opencode/projects/ 2>&1 | head -5
'
```

**Fix:** Ensure `container-runner.ts` mounts to `/home/node/.opencode/`:
```typescript
mounts.push({
  hostPath: opencodeDir,
  containerPath: '/home/node/.opencode',  // NOT /root/.opencode
  readonly: false
});
```

### 6. MCP Server Failures

If an MCP server fails to start, the agent may exit. Check the container logs for MCP initialization errors.

## Manual Container Testing

### Test the full agent flow:
```bash
# Set up env file
mkdir -p data/env workspaces/test
cp .env data/env/env

# Run test query
echo '{"prompt":"What is 2+2?","workspaceFolder":"test","chatJid":"test@g.us","isMain":false}' | \
  container run -i \
  --mount "type=bind,source=$(pwd)/data/env,target=/workspace/env-dir,readonly" \
  -v $(pwd)/workspaces/test:/workspace/group \
  -v $(pwd)/data/ipc:/workspace/ipc \
  eureclaw-agent:latest
```

### Test OpenCode directly:
```bash
container run --rm --entrypoint /bin/bash \
  --mount "type=bind,source=$(pwd)/data/env,target=/workspace/env-dir,readonly" \
  eureclaw-agent:latest -c '
  export $(cat /workspace/env-dir/env | xargs)
  opencode -p "Say hello" --dangerously-skip-permissions --allowedTools ""
'
```

### Interactive shell in container:
```bash
container run --rm -it --entrypoint /bin/bash eureclaw-agent:latest
```

## SDK Options Reference

The agent-runner uses these OpenCode SDK options:

```typescript
query({
  prompt: input.prompt,
  options: {
    cwd: '/workspace/group',
    allowedTools: ['Bash', 'Read', 'Write', ...],
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,  // Required with bypassPermissions
    settingSources: ['project'],
    mcpServers: { ... }
  }
})
```

**Important:** `allowDangerouslySkipPermissions: true` is required when using `permissionMode: 'bypassPermissions'`. Without it, OpenCode exits with code 1.

## Rebuilding After Changes

```bash
# Rebuild main app
npm run build

# Rebuild container (use --no-cache for clean rebuild)
./container/build.sh

# Or force full rebuild
container builder prune -af
./container/build.sh
```

## Checking Container Image

```bash
# List images
container images

# Check what's in the image
container run --rm --entrypoint /bin/bash eureclaw-agent:latest -c '
  echo "=== Node version ==="
  node --version

  echo "=== OpenCode version ==="
  opencode --version

  echo "=== Installed packages ==="
  ls /app/node_modules/
'
```

## Session Persistence

opencode sessions are stored per-workspace in `data/sessions/{workspace}/.opencode/` for security isolation. Each workspace has its own session directory, preventing cross-workspace access to conversation history.

**Critical:** The mount path must match the container user's HOME directory:
- Container user: `node`
- Container HOME: `/home/node`
- Mount target: `/home/node/.opencode/` (NOT `/root/.opencode/`)

To clear sessions:

```bash
# Clear all sessions for all workspaces
rm -rf data/sessions/

# Clear sessions for a specific workspace
rm -rf data/sessions/{workspaceFolder}/.opencode/

# Also clear the session ID from EureClaw's tracking (stored in SQLite)
sqlite3 store/messages.db "DELETE FROM sessions WHERE workspace_folder = '{workspaceFolder}'"
```

To verify session resumption is working, check the logs for the same session ID across messages:
```bash
grep "Session initialized" logs/eureclaw.log | tail -5
# Should show the SAME session ID for consecutive messages in the same workspace
```

## IPC Debugging

The container communicates back to the host via files in `/workspace/ipc/`:

```bash
# Check pending messages
ls -la data/ipc/messages/

# Check pending task operations
ls -la data/ipc/tasks/

# Read a specific IPC file
cat data/ipc/messages/*.json

# Check available workspaces (main channel only)
cat data/ipc/main/available_workspaces.json

# Check current tasks snapshot
cat data/ipc/{workspaceFolder}/current_tasks.json
```

**IPC file types:**
- `messages/*.json` - Agent writes: outgoing WhatsApp messages
- `tasks/*.json` - Agent writes: task operations (schedule, pause, resume, cancel, refresh_workspaces)
- `current_tasks.json` - Host writes: read-only snapshot of scheduled tasks
- `available_workspaces.json` - Host writes: read-only list of WhatsApp groups (main only)

## Quick Diagnostic Script

Run this to check common issues:

```bash
echo "=== Checking EureClaw Container Setup ==="

echo -e "\n1. Authentication configured?"
[ -f .env ] && (grep -q "opencode_CODE_OAUTH_TOKEN=sk-" .env || grep -q "ANTHROPIC_API_KEY=sk-" .env) && echo "OK" || echo "MISSING - add opencode_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY to .env"

echo -e "\n2. Env file copied for container?"
[ -f data/env/env ] && echo "OK" || echo "MISSING - will be created on first run"

echo -e "\n3. Apple Container system running?"
container system status &>/dev/null && echo "OK" || echo "NOT RUNNING - EureClaw should auto-start it; check logs"

echo -e "\n4. Container image exists?"
echo '{}' | container run -i --entrypoint /bin/echo eureclaw-agent:latest "OK" 2>/dev/null || echo "MISSING - run ./container/build.sh"

echo -e "\n5. Session mount path correct?"
grep -q "/home/node/.opencode" src/container-runner.ts 2>/dev/null && echo "OK" || echo "WRONG - should mount to /home/node/.opencode/, not /root/.opencode/"

echo -e "\n6. Workspaces directory?"
ls -la workspaces/ 2>/dev/null || echo "MISSING - run setup"

echo -e "\n7. Recent container logs?"
ls -t workspaces/*/logs/container-*.log 2>/dev/null | head -3 || echo "No container logs yet"

echo -e "\n8. Session continuity working?"
SESSIONS=$(grep "Session initialized" logs/eureclaw.log 2>/dev/null | tail -5 | awk '{print $NF}' | sort -u | wc -l)
[ "$SESSIONS" -le 2 ] && echo "OK (recent sessions reusing IDs)" || echo "CHECK - multiple different session IDs, may indicate resumption issues"
```

## OpenCode Usage Statistics

You can check OpenCode usage stats (sessions, costs, tokens, tool usage) in two ways:

### Via Command Line
```bash
# From the project directory
opencode stats
```

### Via Andy (MCP Tool)
Just ask Andy:
- "show me the stats"
- "how much am I spending?"
- "what's my OpenCode usage?"

Andy will call the `show_opencode_stats` MCP tool to display:
- Total sessions and messages
- Cost breakdown (total, per day, per session)
- Token usage (input, output, cache read/write)
- Tool usage statistics

**Note:** OpenCode has an excellent caching system. You'll see high "Cache Read" numbers (millions of tokens) which saves a lot of money - cached tokens are much cheaper than regular tokens!
