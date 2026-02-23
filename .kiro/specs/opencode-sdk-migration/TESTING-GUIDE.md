# Production Testing Guide: OpenCode SDK Migration

## Overview

This guide provides step-by-step instructions for testing the OpenCode SDK migration in a production-like environment. The migration is backward compatible, so your existing sessions, groups, and configuration will continue to work.

## Prerequisites

Before testing, ensure:
- ✅ Container image has been rebuilt (`./container/build.sh`)
- ✅ All code changes are committed
- ✅ You have access to WhatsApp and/or Telegram for testing
- ✅ The EureClaw service is running

## Testing Checklist

### 1. Service Status Verification

**Objective:** Confirm the service is running with the new OpenCode SDK.

**Steps:**

```bash
# macOS - Check service status
launchctl list | grep eureclaw

# If not running, start it
launchctl kickstart -k gui/$(id -u)/com.eureclaw

# Linux (systemd) - Check service status
systemctl --user status eureclaw

# If not running, start it
systemctl --user restart eureclaw
```

**Expected Result:** Service should be running without errors.

**Verification:**
- Check logs for startup messages
- Look for "OpenCode" references in logs (not "Claude SDK")
- No error messages about missing dependencies

---

### 2. Basic Message Flow Test

**Objective:** Verify basic agent communication works.

**Test Case 2.1: Simple Query (WhatsApp)**

1. Open WhatsApp and go to your self-chat (main channel)
2. Send: `@Andy what is 2+2?`
3. Wait for response

**Expected Result:**
- Agent responds with the answer
- Response appears within 10 seconds
- No error messages

**Test Case 2.2: Simple Query (Telegram)**

1. Open Telegram and message your bot
2. Send: `@Andy what is the capital of France?`
3. Wait for response

**Expected Result:**
- Agent responds correctly
- Response appears within 10 seconds
- No error messages

---

### 3. Session Continuity Test

**Objective:** Verify sessions persist across messages and container restarts.

**Test Case 3.1: Multi-Turn Conversation**

1. Send: `@Andy remember that my favorite color is blue`
2. Wait for acknowledgment
3. Send: `@Andy what is my favorite color?`
4. Wait for response

**Expected Result:**
- Agent remembers the context from the first message
- Responds with "blue"
- Session ID is preserved between messages

**Test Case 3.2: Session Persistence After Restart**

1. Send: `@Andy my project name is EureClaw`
2. Wait for acknowledgment
3. Restart the service:
   ```bash
   # macOS
   launchctl kickstart -k gui/$(id -u)/com.eureclaw
   
   # Linux
   systemctl --user restart eureclaw
   ```
4. Wait 10 seconds for service to start
5. Send: `@Andy what is my project name?`

**Expected Result:**
- Agent remembers "EureClaw" from before the restart
- Session context is preserved
- No errors about invalid session IDs

---

### 4. MCP Tools Test

**Objective:** Verify custom tools work via the IPC-based MCP server.

**Test Case 4.1: Send Message Tool**

1. Send: `@Andy send a test message to this chat saying "MCP tools work"`
2. Wait for response

**Expected Result:**
- Agent uses the `send_message` tool
- You receive a message saying "MCP tools work"
- No IPC errors in logs

**Test Case 4.2: List Tasks Tool**

1. Send: `@Andy list all scheduled tasks`
2. Wait for response

**Expected Result:**
- Agent uses the `list_tasks` tool
- Returns a list of tasks (or empty list if none exist)
- No errors about tool invocation

**Test Case 4.3: Schedule Task Tool**

1. Send: `@Andy schedule a task to message me "test reminder" in 2 minutes`
2. Wait for acknowledgment
3. Wait 2 minutes
4. Check for the reminder message

**Expected Result:**
- Agent uses the `schedule_task` tool
- Task is created in the database
- Reminder arrives after 2 minutes
- Task executes successfully

---

### 5. File Operations Test

**Objective:** Verify file read/write operations work correctly.

**Test Case 5.1: Read File**

1. Send: `@Andy read the README.md file and tell me what EureClaw is`
2. Wait for response

**Expected Result:**
- Agent reads the file successfully
- Provides a summary of EureClaw
- No permission errors

**Test Case 5.2: Write File**

1. Send: `@Andy create a file called test-migration.txt in the group folder with the content "OpenCode SDK works"`
2. Wait for acknowledgment
3. Check the file exists:
   ```bash
   cat groups/main/test-migration.txt
   ```

**Expected Result:**
- File is created successfully
- Contains the correct content
- No permission errors

**Test Case 5.3: Edit File**

1. Send: `@Andy append " - tested on [current date]" to test-migration.txt`
2. Wait for acknowledgment
3. Check the file:
   ```bash
   cat groups/main/test-migration.txt
   ```

**Expected Result:**
- File is updated correctly
- Original content is preserved
- New content is appended

---

### 6. Group Isolation Test

**Objective:** Verify group isolation is maintained (if you have multiple groups).

**Test Case 6.1: Non-Main Group Access**

1. If you have a non-main group registered, send a message there
2. Send: `@Andy list all files in the current directory`
3. Wait for response

**Expected Result:**
- Agent only sees files in that group's folder
- Cannot access main group files
- Cannot access other groups' files

**Test Case 6.2: Main Group Privileges**

1. In your main channel (self-chat), send: `@Andy list all registered groups`
2. Wait for response

**Expected Result:**
- Agent can see all registered groups
- Uses the `list_groups` tool successfully
- Shows correct group information

---

### 7. Error Handling Test

**Objective:** Verify errors are handled gracefully.

**Test Case 7.1: Invalid Request**

1. Send: `@Andy read a file that doesn't exist: /nonexistent/file.txt`
2. Wait for response

**Expected Result:**
- Agent handles the error gracefully
- Returns a clear error message
- Container doesn't crash
- Logs show proper error handling

**Test Case 7.2: Network Interruption Simulation**

1. Send a complex request: `@Andy search the web for recent AI news and summarize the top 5 articles`
2. While processing, briefly disconnect from WiFi (2-3 seconds)
3. Reconnect
4. Wait for response

**Expected Result:**
- Agent either completes the request or returns a clear error
- No silent failures
- Session remains valid for next message

---

### 8. Scheduled Tasks Test

**Objective:** Verify scheduled tasks execute correctly.

**Test Case 8.1: Create Recurring Task**

1. Send: `@Andy create a task that messages me "daily test" every day at 9am`
2. Wait for acknowledgment
3. Check the database:
   ```bash
   sqlite3 data/eureclaw.db "SELECT * FROM tasks WHERE status='active';"
   ```

**Expected Result:**
- Task is created in database
- Schedule is correct (cron: `0 9 * * *`)
- Status is "active"

**Test Case 8.2: Verify Task Execution**

1. Wait until the scheduled time (or modify the task to run in 1 minute for testing)
2. Check for the message

**Expected Result:**
- Task executes at the scheduled time
- Message is delivered
- Task remains active for next execution
- Logs show successful task execution

---

### 9. Platform-Specific Tests

**Test Case 9.1: Container Mode (macOS)**

1. Verify you're using Apple Container:
   ```bash
   which container
   ```
2. Run a test message
3. Check container logs:
   ```bash
   ls -la groups/main/logs/
   cat groups/main/logs/container-*.log | tail -50
   ```

**Expected Result:**
- Container runtime is Apple Container
- Logs show container execution
- Mounts are configured correctly
- No permission errors

**Test Case 9.2: Direct Mode (Windows/Linux)**

1. Verify platform detection:
   ```bash
   node -e "console.log(require('os').platform())"
   ```
2. Run a test message
3. Check logs for direct mode indicators

**Expected Result:**
- Direct mode is used (no containers)
- Paths are real host paths (not container mount points)
- All functionality works identically to container mode

---

### 10. Backward Compatibility Test

**Objective:** Verify existing data works with the new SDK.

**Test Case 10.1: Existing Sessions**

1. Check for existing sessions in database:
   ```bash
   sqlite3 data/eureclaw.db "SELECT id, group_folder, created_at FROM sessions LIMIT 5;"
   ```
2. If you have existing sessions, send a message to resume one
3. Verify context is preserved

**Expected Result:**
- Old session IDs work with OpenCode SDK
- Context from before migration is preserved
- No errors about incompatible session format

**Test Case 10.2: Existing AGENTS.md Files**

1. Check your group AGENTS.md files:
   ```bash
   cat groups/main/AGENTS.md
   ```
2. Send: `@Andy what do you know about yourself from your memory?`
3. Wait for response

**Expected Result:**
- Agent loads AGENTS.md content correctly
- References information from the file
- No parsing errors

---

## Log Monitoring

During all tests, monitor logs for errors:

```bash
# Watch service logs (macOS)
tail -f ~/Library/Logs/eureclaw.log

# Watch service logs (Linux)
journalctl --user -u eureclaw -f

# Watch container logs
tail -f groups/main/logs/container-*.log
```

**Look for:**
- ✅ "OpenCode" or "Opencode" references (not "Claude SDK")
- ✅ Successful session creation/resumption
- ✅ Successful tool invocations
- ✅ Clean error handling
- ❌ Stack traces or unhandled exceptions
- ❌ References to missing Claude SDK modules
- ❌ Authentication errors

---

## Success Criteria

The migration is successful if:

1. ✅ All basic message flows work (WhatsApp and Telegram)
2. ✅ Sessions persist across messages and restarts
3. ✅ MCP tools work correctly (send_message, list_tasks, schedule_task)
4. ✅ File operations work (read, write, edit)
5. ✅ Group isolation is maintained
6. ✅ Errors are handled gracefully
7. ✅ Scheduled tasks execute correctly
8. ✅ Platform-specific modes work (container/direct)
9. ✅ Existing data is compatible (sessions, AGENTS.md)
10. ✅ No references to Claude SDK in logs
11. ✅ No authentication errors
12. ✅ No unhandled exceptions

---

## Troubleshooting

### Issue: Service won't start

**Check:**
```bash
# macOS
cat ~/Library/Logs/eureclaw.log

# Linux
journalctl --user -u eureclaw -n 50
```

**Common causes:**
- Missing dependencies (run `npm install`)
- Container image not rebuilt (run `./container/build.sh`)
- Port conflicts
- Permission issues

### Issue: Agent doesn't respond

**Check:**
1. Service is running: `launchctl list | grep eureclaw`
2. Container logs: `cat groups/main/logs/container-*.log | tail -100`
3. Database connection: `sqlite3 data/eureclaw.db "SELECT COUNT(*) FROM messages;"`

**Common causes:**
- Container timeout (check timeout settings)
- Network issues (check OPENCODE_BASE_URL)
- Authentication errors (check .env file)

### Issue: "Session not found" errors

**Check:**
1. Database has sessions: `sqlite3 data/eureclaw.db "SELECT * FROM sessions;"`
2. Session IDs are valid UUIDs
3. OpenCode SDK is configured correctly

**Solution:**
- Let the system create a new session
- Old session will be archived automatically

### Issue: MCP tools not working

**Check:**
1. IPC directory exists: `ls -la data/ipc/main/`
2. MCP server is running (check container logs)
3. Tool permissions are correct

**Common causes:**
- IPC directory permissions
- MCP server crash (check stderr in container logs)
- Tool invocation format changed

---

## Reporting Issues

If you encounter issues during testing:

1. **Collect logs:**
   ```bash
   # Service logs
   cat ~/Library/Logs/eureclaw.log > migration-test-service.log
   
   # Container logs
   cat groups/main/logs/container-*.log > migration-test-container.log
   
   # Database state
   sqlite3 data/eureclaw.db ".dump" > migration-test-db.sql
   ```

2. **Document the issue:**
   - What test case failed?
   - What was the expected result?
   - What actually happened?
   - Any error messages?

3. **Check for known issues:**
   - Review the design document's "Open Questions" section
   - Check if the issue is related to OpenCode SDK limitations

4. **Create a minimal reproduction:**
   - What's the simplest message that triggers the issue?
   - Does it happen consistently?
   - Does it happen in both WhatsApp and Telegram?

---

## Next Steps After Testing

Once all tests pass:

1. ✅ Mark task 18.2 as complete
2. ✅ Document any issues found
3. ✅ Update the migration guide if needed
4. ✅ Consider the migration complete
5. ✅ Monitor production usage for 24-48 hours
6. ✅ Clean up test files (test-migration.txt, test tasks, etc.)

---

## Rollback Procedure

If critical issues are found:

1. **Stop the service:**
   ```bash
   # macOS
   launchctl unload ~/Library/LaunchAgents/com.eureclaw.plist
   
   # Linux
   systemctl --user stop eureclaw
   ```

2. **Revert to previous version:**
   ```bash
   git checkout <previous-commit>
   ./container/build.sh
   npm install
   ```

3. **Restart the service:**
   ```bash
   # macOS
   launchctl load ~/Library/LaunchAgents/com.eureclaw.plist
   
   # Linux
   systemctl --user start eureclaw
   ```

4. **Verify rollback:**
   - Send a test message
   - Check logs for Claude SDK references
   - Verify existing sessions still work

**Note:** No data loss is expected during rollback since the database schema is unchanged.
