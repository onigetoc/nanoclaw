# Testing the /new Command

## Manual Testing Guide

### Prerequisites

1. EureClaw is running (`bun start`)
2. You have access to a registered chat (WhatsApp, Telegram, or Web UI)
3. OpenCode server is running

### Test Scenario 1: Basic /new Command

**Steps:**
1. Send a message to the bot: `Hello, what's your name?`
2. Bot responds with its name
3. Send: `/new`
4. Bot responds: `🆕 Starting a new session...`
5. Send: `What's your name?`
6. Bot should respond as if it's the first time (no memory of previous conversation)

**Expected Behavior:**
- Session ID is cleared
- New session is created
- Conversation history is reset
- Bot doesn't remember previous messages

### Test Scenario 2: /new with Ongoing Conversation

**Steps:**
1. Have a conversation with the bot (5-10 messages)
2. Ask: `What did we talk about?`
3. Bot summarizes the conversation
4. Send: `/new`
5. Ask again: `What did we talk about?`
6. Bot should say it doesn't have previous conversation history

**Expected Behavior:**
- Previous context is lost
- Bot starts fresh
- No memory of earlier messages

### Test Scenario 3: Multiple /new Commands

**Steps:**
1. Send: `/new`
2. Send: `Test message 1`
3. Send: `/new`
4. Send: `Test message 2`
5. Send: `/new`
6. Send: `Test message 3`

**Expected Behavior:**
- Each `/new` creates a fresh session
- No errors or crashes
- Each message is treated as the start of a new conversation

### Test Scenario 4: /new in Different Workspaces

**Steps:**
1. In Workspace A: Send `/new` and start conversation
2. In Workspace B: Send `/new` and start conversation
3. In Workspace A: Continue conversation
4. In Workspace B: Continue conversation

**Expected Behavior:**
- Each workspace has independent sessions
- `/new` in Workspace A doesn't affect Workspace B
- Sessions are isolated per workspace

### Test Scenario 5: Error Handling

**Steps:**
1. Stop OpenCode server
2. Send: `/new`
3. Bot responds with confirmation
4. Send a message
5. Check for error handling

**Expected Behavior:**
- `/new` command succeeds (just clears session ID)
- Next message fails gracefully with error message
- No crashes

## Automated Testing

Run the test suite:

```bash
bun test src/commands/__tests__/opencode-commands.test.ts
```

Expected output:
```
✓ src/commands/__tests__/opencode-commands.test.ts (8)
  ✓ OpenCode Commands (8)
    ✓ Command Registration (2)
      ✓ should register /new command
      ✓ should have all EureClaw commands registered
    ✓ Command Detection (3)
      ✓ should identify EureClaw commands
      ✓ should identify non-EureClaw commands
      ✓ should detect OpenCode commands in messages
    ✓ /new Command (3)
      ✓ should return success response with OpenCode data
      ✓ should require registered workspace
      ✓ should be case-insensitive
```

## Debugging

### Check Session State

```typescript
// In src/startup.ts or via debug tool
import { getSessions } from './state.js';

console.log('Current sessions:', getSessions());
// After /new, should show empty string for the group
```

### Check Logs

```bash
# Main process logs
tail -f logs/eureclaw.log | grep -E "(new|session)"

# Agent runner logs
tail -f logs/agent-runner.log | grep -E "(session|Creating)"
```

### Expected Log Output

After `/new` command:
```
[2026-03-02T10:30:00.000Z] [startup] Forcing new session via /new command
[2026-03-02T10:30:00.001Z] [state] Session cleared for workspace: main
[2026-03-02T10:30:01.000Z] [agent-runner] Creating new OpenCode session...
[2026-03-02T10:30:01.500Z] [agent-runner] ✓ Created new session: ses_abc123xyz
```

## Verification Checklist

- [ ] `/new` command is registered
- [ ] Command appears in `/help` output
- [ ] Command clears session ID
- [ ] New session is created on next message
- [ ] Conversation history is reset
- [ ] No errors in logs
- [ ] Works in all channels (WhatsApp, Telegram, Web UI)
- [ ] Sessions are isolated per workspace
- [ ] Multiple `/new` commands work correctly
- [ ] Error handling works when OpenCode is down

## Common Issues

### Issue: Session Not Resetting

**Symptoms:**
- Bot still remembers previous conversation after `/new`

**Diagnosis:**
```bash
# Check if session ID was cleared
grep "Forcing new session" logs/eureclaw.log

# Check if new session was created
grep "Creating new OpenCode session" logs/agent-runner.log
```

**Solution:**
- Verify `setGroupSession(folder, '')` is called
- Check that message processing continues after `/new`
- Ensure agent runner sees empty session ID

### Issue: Command Not Recognized

**Symptoms:**
- `/new` is treated as regular text

**Diagnosis:**
```bash
# Check command registration
grep "Command registered" logs/eureclaw.log | grep "new"
```

**Solution:**
- Verify `import './commands/opencode-commands.js'` in startup.ts
- Rebuild: `bun run build`
- Restart EureClaw

### Issue: Error After /new

**Symptoms:**
- Error message after sending `/new`

**Diagnosis:**
```bash
# Check error logs
grep "ERROR" logs/eureclaw.log
grep "ERROR" logs/agent-runner.log
```

**Solution:**
- Ensure OpenCode server is running
- Check OpenCode server health: `curl http://localhost:4096/health`
- Verify OpenCode SDK version is compatible

## Performance Testing

### Session Creation Time

Measure time to create new session:

```typescript
// In agent-runner/src/index.ts
const startTime = Date.now();
const sessionResult = await client.session.create();
const duration = Date.now() - startTime;
console.log(`Session creation took ${duration}ms`);
```

**Expected:**
- First session: 300-500ms
- Subsequent sessions: 50-100ms (if using session pool)

### Memory Usage

Monitor memory after multiple `/new` commands:

```bash
# Check process memory
ps aux | grep eureclaw

# Check for memory leaks
node --expose-gc src/index.ts
# Send multiple /new commands
# Check if memory is released
```

## Success Criteria

The `/new` command implementation is successful if:

1. ✅ Command is recognized and executed
2. ✅ Session ID is cleared
3. ✅ New session is created on next message
4. ✅ Conversation history is reset
5. ✅ No errors or crashes
6. ✅ Works across all channels
7. ✅ Sessions are isolated per workspace
8. ✅ Performance is acceptable (<500ms)
9. ✅ Error handling is graceful
10. ✅ Tests pass

## Next Steps

After successful testing:

1. Update user documentation
2. Announce feature to users
3. Monitor usage and errors
4. Gather feedback
5. Consider additional session commands:
   - `/history` - View conversation history
   - `/export` - Export conversation
   - `/sessions` - List all sessions
