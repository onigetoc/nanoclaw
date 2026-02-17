# Rollback Plan: OpenCode SDK Migration

## Overview

This document provides a comprehensive rollback strategy for the OpenCode SDK migration. The plan ensures that if critical issues are discovered after deployment, the system can be safely reverted to the Claude SDK implementation with minimal downtime and zero data loss.

## Rollback Triggers

Execute rollback if any of the following critical issues occur:

1. **Session Management Failures**
   - Sessions fail to create or resume consistently
   - Session context is lost between messages
   - Database corruption or session ID conflicts

2. **Message Processing Failures**
   - Messages fail to send or receive
   - Event streaming disconnects repeatedly
   - Response output is corrupted or incomplete

3. **MCP Tool Failures**
   - Custom tools (send_message, schedule_task, etc.) fail to execute
   - IPC communication breaks down
   - Tool permissions are not enforced correctly

4. **Platform Compatibility Issues**
   - Container mode fails on macOS
   - Direct mode fails on Windows/Linux
   - File path resolution errors across platforms

5. **Performance Degradation**
   - Session creation latency exceeds 5 seconds
   - Message response time exceeds 10 seconds
   - Memory usage exceeds 1GB per container

6. **Security Vulnerabilities**
   - Secrets leak into Bash subprocess environment
   - File access restrictions are bypassed
   - Container isolation is compromised

## Immediate Rollback Procedure

### Step 1: Stop All Services

**macOS (launchd):**
```bash
# Stop the NanoClaw service
launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist

# Verify service is stopped
launchctl list | grep nanoclaw
```

**Linux (systemd):**
```bash
# Stop the NanoClaw service
sudo systemctl stop nanoclaw

# Verify service is stopped
sudo systemctl status nanoclaw
```

**Windows (manual process):**
```powershell
# Find and kill the NanoClaw process
Get-Process -Name node | Where-Object {$_.Path -like "*nanoclaw*"} | Stop-Process -Force
```

### Step 2: Revert Container Image

**macOS:**
```bash
# Navigate to project directory
cd ~/nanoclaw

# Checkout previous commit (before migration)
git log --oneline --grep="OpenCode SDK" -1  # Find migration commit
git checkout HEAD~1  # Or specific commit hash

# Rebuild container with Claude SDK
./container/build.sh

# Verify container image
container images | grep nanoclaw-agent
```

**Windows/Linux (Direct Mode):**
```bash
# Navigate to project directory
cd ~/nanoclaw

# Checkout previous commit
git checkout HEAD~1  # Or specific commit hash

# Reinstall dependencies
cd container/agent-runner
npm install

# Verify Claude SDK is installed
npm list @anthropic-ai/claude-agent-sdk
```

### Step 3: Restore Environment Configuration

**Revert environment variables:**
```bash
# Edit .env file
nano .env  # or vim, code, etc.

# Remove OpenCode-specific variables:
# - OPENCODE_BASE_URL (if added)
# - Any new OpenCode-specific secrets

# Ensure Claude SDK variables are present:
# - ANTHROPIC_API_KEY
# - CLAUDE_CODE_OAUTH_TOKEN (if used)
```

### Step 4: Restart Services

**macOS:**
```bash
# Reload the service
launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist

# Verify service is running
launchctl list | grep nanoclaw

# Check logs
tail -f ~/nanoclaw/logs/nanoclaw.log
```

**Linux:**
```bash
# Restart the service
sudo systemctl start nanoclaw

# Verify service is running
sudo systemctl status nanoclaw

# Check logs
journalctl -u nanoclaw -f
```

**Windows:**
```powershell
# Start the process manually
cd C:\nanoclaw
node src\index.js

# Or use Task Scheduler to restart the scheduled task
```

### Step 5: Verify Rollback Success

**Test basic functionality:**
```bash
# Send a test message via WhatsApp or Telegram
# Expected: Agent responds normally

# Check session continuity
# Send follow-up message in same conversation
# Expected: Agent remembers context

# Verify MCP tools work
# Use send_message or schedule_task
# Expected: Tools execute successfully

# Check logs for errors
tail -n 100 ~/nanoclaw/logs/nanoclaw.log | grep -i error
```

## Data Preservation Strategy

### Database Compatibility

**Key Principle:** The migration does NOT change the database schema, ensuring full backward compatibility.

**Database Tables (Unchanged):**
- `sessions` - Session IDs remain valid for both SDKs
- `messages` - Message format unchanged
- `chats` - Chat registration unchanged
- `tasks` - Task scheduling unchanged
- `router_state` - Router state unchanged

**Session ID Compatibility:**
- Claude SDK session IDs: Valid with OpenCode SDK
- OpenCode SDK session IDs: Valid with Claude SDK
- No migration or conversion required

**Verification:**
```bash
# Check database integrity
sqlite3 ~/nanoclaw/data/nanoclaw.db "PRAGMA integrity_check;"

# Verify session count
sqlite3 ~/nanoclaw/data/nanoclaw.db "SELECT COUNT(*) FROM sessions;"

# Check recent sessions
sqlite3 ~/nanoclaw/data/nanoclaw.db "SELECT chat_jid, session_id, created_at FROM sessions ORDER BY created_at DESC LIMIT 10;"
```

### File System Preservation

**Group Memory (AGENTS.md):**
- Location: `~/nanoclaw/groups/{group_name}/AGENTS.md`
- Format: Unchanged
- Action: No changes required during rollback

**Conversation Archives:**
- Location: `~/nanoclaw/groups/{group_name}/conversations/`
- Format: Unchanged
- Action: Archives created by OpenCode SDK remain valid

**IPC Files:**
- Location: `~/nanoclaw/ipc/`
- Format: Unchanged
- Action: Clear stale IPC files after rollback

**Logs:**
- Location: `~/nanoclaw/logs/` and `~/nanoclaw/groups/{group_name}/logs/`
- Format: May differ slightly (OpenCode vs Claude SDK)
- Action: Preserve all logs for debugging

### Configuration Preservation

**Environment Variables:**
- `.env` file: Revert OpenCode-specific variables
- Secrets: Remain valid (ANTHROPIC_API_KEY unchanged)
- Paths: Unchanged (mount points, directories)

**Service Configuration:**
- macOS: `~/Library/LaunchAgents/com.nanoclaw.plist` (unchanged)
- Linux: `/etc/systemd/system/nanoclaw.service` (unchanged)
- Windows: Task Scheduler configuration (unchanged)

## Gradual Migration Approach

To minimize risk, consider a gradual migration strategy instead of immediate full rollback:

### Phase 1: Parallel Testing (Recommended)

**Run both SDKs simultaneously on different groups:**

1. **Identify Test Groups:**
   ```bash
   # List all registered groups
   sqlite3 ~/nanoclaw/data/nanoclaw.db "SELECT jid, name FROM chats WHERE is_active = 1;"
   
   # Select 1-2 low-traffic groups for OpenCode SDK testing
   ```

2. **Create Separate Containers:**
   ```bash
   # Build OpenCode SDK container with different tag
   cd ~/nanoclaw
   docker build -t nanoclaw-agent:opencode -f container/Dockerfile .
   
   # Keep existing Claude SDK container
   docker tag nanoclaw-agent:latest nanoclaw-agent:claude
   ```

3. **Route Groups to Different SDKs:**
   ```typescript
   // In src/container-runner.ts
   function getContainerImage(chatJid: string): string {
     const testGroups = ['120363336345536173@g.us']; // OpenCode test groups
     return testGroups.includes(chatJid) 
       ? 'nanoclaw-agent:opencode'
       : 'nanoclaw-agent:claude';
   }
   ```

4. **Monitor Both Groups:**
   ```bash
   # Compare logs side-by-side
   tail -f ~/nanoclaw/groups/test-group/logs/*.log &
   tail -f ~/nanoclaw/groups/main/logs/*.log &
   
   # Compare session behavior
   sqlite3 ~/nanoclaw/data/nanoclaw.db "SELECT chat_jid, COUNT(*) as msg_count FROM messages WHERE created_at > datetime('now', '-1 day') GROUP BY chat_jid;"
   ```

### Phase 2: Incremental Group Migration

**Migrate groups one at a time:**

1. **Week 1: Migrate 1 test group**
   - Monitor for 7 days
   - Collect user feedback
   - Verify all features work

2. **Week 2: Migrate 2-3 additional groups**
   - Monitor for 7 days
   - Compare performance metrics
   - Address any issues

3. **Week 3: Migrate remaining groups**
   - Monitor for 7 days
   - Verify session continuity
   - Complete migration

4. **Week 4: Decommission Claude SDK**
   - Remove Claude SDK dependencies
   - Update documentation
   - Archive rollback artifacts

### Phase 3: Canary Deployment

**Use feature flags to control SDK usage:**

```typescript
// In container/agent-runner/src/index.ts
const USE_OPENCODE_SDK = process.env.USE_OPENCODE_SDK === '1';

if (USE_OPENCODE_SDK) {
  // OpenCode SDK implementation
  const client = createOpencodeClient(sdkEnv);
  // ...
} else {
  // Claude SDK implementation (fallback)
  for await (const message of query({...})) {
    // ...
  }
}
```

**Control via environment variable:**
```bash
# Enable OpenCode SDK for specific container
USE_OPENCODE_SDK=1 node container/agent-runner/src/index.js

# Disable OpenCode SDK (use Claude SDK)
USE_OPENCODE_SDK=0 node container/agent-runner/src/index.js
```

## Rollback Validation Checklist

After executing rollback, verify the following:

### Functional Validation

- [ ] **Message Processing**
  - [ ] Send message via WhatsApp → receive response
  - [ ] Send message via Telegram → receive response
  - [ ] Multi-turn conversation preserves context

- [ ] **Session Management**
  - [ ] New sessions are created successfully
  - [ ] Existing sessions resume correctly
  - [ ] Session IDs are stored in database

- [ ] **MCP Tools**
  - [ ] `send_message` tool works
  - [ ] `schedule_task` tool works
  - [ ] `list_tasks` tool works
  - [ ] `register_group` tool works (main group only)

- [ ] **Scheduled Tasks**
  - [ ] Cron tasks execute on schedule
  - [ ] Interval tasks execute correctly
  - [ ] One-time tasks execute once

- [ ] **File Operations**
  - [ ] Agent can read files
  - [ ] Agent can write files
  - [ ] Agent can edit files
  - [ ] File permissions are enforced

### Performance Validation

- [ ] **Latency**
  - [ ] Session creation < 2 seconds
  - [ ] First token response < 5 seconds
  - [ ] Event stream latency < 500ms

- [ ] **Resource Usage**
  - [ ] Memory usage < 500MB per container
  - [ ] CPU usage reasonable (< 50% sustained)
  - [ ] Disk I/O not excessive

### Security Validation

- [ ] **Secret Isolation**
  - [ ] Secrets not in Bash subprocess environment
  - [ ] API keys not logged
  - [ ] Credentials not exposed in errors

- [ ] **File Access**
  - [ ] Mount restrictions enforced
  - [ ] Group isolation maintained
  - [ ] No unauthorized file access

- [ ] **Container Security**
  - [ ] No privilege escalation possible
  - [ ] Container isolation intact
  - [ ] Network restrictions enforced

### Data Validation

- [ ] **Database Integrity**
  - [ ] All tables accessible
  - [ ] No data corruption
  - [ ] Session IDs valid

- [ ] **File System Integrity**
  - [ ] AGENTS.md files intact
  - [ ] Conversation archives preserved
  - [ ] Logs complete and readable

## Post-Rollback Actions

### 1. Root Cause Analysis

**Investigate the failure:**
```bash
# Collect logs from failed deployment
mkdir -p ~/nanoclaw/rollback-analysis/$(date +%Y%m%d)
cp -r ~/nanoclaw/logs ~/nanoclaw/rollback-analysis/$(date +%Y%m%d)/
cp -r ~/nanoclaw/groups/*/logs ~/nanoclaw/rollback-analysis/$(date +%Y%m%d)/

# Extract error patterns
grep -r "ERROR" ~/nanoclaw/rollback-analysis/$(date +%Y%m%d)/ > errors.txt
grep -r "OpenCode" ~/nanoclaw/rollback-analysis/$(date +%Y%m%d)/ > opencode-refs.txt
```

**Document findings:**
- What triggered the rollback?
- Which component failed?
- What was the error message?
- How many users were affected?
- What data was lost (if any)?

### 2. Update Migration Plan

**Revise the migration strategy:**
- Address identified issues
- Add additional tests
- Update rollback triggers
- Improve monitoring

### 3. Communicate with Users

**Notify affected users:**
- Explain what happened
- Apologize for disruption
- Provide timeline for resolution
- Offer support channels

### 4. Schedule Retry

**Plan next migration attempt:**
- Fix identified issues
- Test thoroughly in staging
- Schedule during low-traffic period
- Prepare improved rollback plan

## Emergency Contacts

**In case of critical issues during rollback:**

- **System Administrator:** [Your contact info]
- **Database Administrator:** [Your contact info]
- **On-Call Engineer:** [Your contact info]
- **OpenCode SDK Support:** [Support channel]
- **Claude SDK Support:** [Support channel]

## Appendix: Common Issues and Solutions

### Issue 1: Container Fails to Start After Rollback

**Symptoms:**
- Container exits immediately
- Error: "Cannot find module '@anthropic-ai/claude-agent-sdk'"

**Solution:**
```bash
# Rebuild container from clean state
cd ~/nanoclaw
git clean -fdx container/agent-runner/node_modules
./container/build.sh --no-cache
```

### Issue 2: Sessions Fail to Resume

**Symptoms:**
- Error: "Session not found"
- New session created for every message

**Solution:**
```bash
# Check database for session IDs
sqlite3 ~/nanoclaw/data/nanoclaw.db "SELECT * FROM sessions WHERE chat_jid = 'YOUR_CHAT_JID';"

# If session IDs are corrupted, clear and start fresh
sqlite3 ~/nanoclaw/data/nanoclaw.db "DELETE FROM sessions WHERE chat_jid = 'YOUR_CHAT_JID';"
```

### Issue 3: MCP Tools Not Working

**Symptoms:**
- Tools fail with "Command not found"
- IPC files not created

**Solution:**
```bash
# Verify MCP server script exists
ls -la ~/nanoclaw/container/agent-runner/src/ipc-mcp-stdio.ts

# Check IPC directory permissions
ls -ld ~/nanoclaw/ipc
chmod 755 ~/nanoclaw/ipc

# Clear stale IPC files
rm -f ~/nanoclaw/ipc/*.json
```

### Issue 4: Environment Variables Not Loaded

**Symptoms:**
- Error: "ANTHROPIC_API_KEY not set"
- Authentication failures

**Solution:**
```bash
# Verify .env file exists and is readable
cat ~/nanoclaw/.env | grep ANTHROPIC_API_KEY

# Reload environment in service
# macOS:
launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist
launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist

# Linux:
sudo systemctl daemon-reload
sudo systemctl restart nanoclaw
```

### Issue 5: Logs Show Mixed SDK References

**Symptoms:**
- Logs contain both "OpenCode" and "Claude SDK" references
- Unclear which SDK is running

**Solution:**
```bash
# Check current commit
git log -1 --oneline

# Verify package.json
cat container/agent-runner/package.json | grep -E "(opencode|claude-agent-sdk)"

# Check running process
ps aux | grep node | grep nanoclaw
```

## Conclusion

This rollback plan ensures that the OpenCode SDK migration can be safely reverted if critical issues arise. The key principles are:

1. **Zero Data Loss:** Database and file system remain compatible
2. **Minimal Downtime:** Rollback can be executed in < 5 minutes
3. **Gradual Migration:** Incremental approach reduces risk
4. **Clear Validation:** Comprehensive checklist ensures success
5. **Documented Process:** Step-by-step instructions for any team member

By following this plan, the migration can proceed with confidence, knowing that a safe rollback path exists if needed.
