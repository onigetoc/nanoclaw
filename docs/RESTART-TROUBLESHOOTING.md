# Restart Command Troubleshooting

## Common Issues with `/restart`

### Bot doesn't respond after restart

**Symptom:** You send `/restart`, bot replies "🔄 Restarting...", but then doesn't respond to new messages.

**Causes:**
1. Telegram/WhatsApp connection conflict
2. Process didn't restart properly
3. Multiple instances running

**Solutions:**

#### 1. Check if process is running
```bash
# Windows PowerShell
Get-Process node | Where-Object {$_.CommandLine -like "*eureclaw*"}

# Linux/macOS
ps aux | grep eureclaw
```

#### 2. Kill all EureClaw processes and restart
```bash
# Stop the supervisor (Ctrl+C in terminal)
# Then restart:
bun run start:supervised
```

#### 3. Restart Telegram/WhatsApp client
Sometimes the messaging app caches the connection. Close and reopen:
- **Telegram Desktop:** Close completely and reopen
- **Telegram Mobile:** Force close app and reopen
- **WhatsApp:** Same process

#### 4. Check logs
Look for errors in the terminal output:
- Connection errors
- Port conflicts
- Authentication issues

### Multiple restarts in a row

**Symptom:** Bot keeps restarting in a loop.

**Cause:** Restart loop protection triggered (max 5 restarts/minute).

**Solution:**
```bash
# Stop the supervisor (Ctrl+C)
# Wait 1 minute
# Restart manually:
bun run start:supervised
```

### "Too many restarts" error

**Symptom:** Supervisor stops with "Too many restarts in a short time".

**Cause:** Something is causing the bot to crash repeatedly.

**Solution:**
1. Check logs for errors
2. Fix the underlying issue
3. Restart manually after fixing

## Best Practices

### When to use `/restart`

✅ **Good reasons:**
- After changing configuration (models, settings)
- After updating code
- When bot seems stuck or unresponsive
- To apply new features

❌ **Bad reasons:**
- Every few minutes (indicates a bug)
- As a "fix" for errors (find root cause instead)
- Just to test (use `/status` instead)

### Recommended restart process

1. Send `/restart` in chat
2. Wait 5-10 seconds
3. Check terminal for "🚀 Starting EureClaw..."
4. Wait for "Telegram bot connected" or "WhatsApp connected"
5. Send a test message

### If restart doesn't work

**Manual restart (safest):**
```bash
# 1. Stop supervisor (Ctrl+C in terminal)
# 2. Wait 5 seconds
# 3. Restart:
bun run start:supervised
```

## Platform-Specific Notes

### Windows

**PowerShell scripts (.ps1):**
- Only work on Windows
- May require execution policy: `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser`

**Recommended:**
```bash
bun run start:supervised  # Works on all platforms
```

### macOS/Linux

**Service management:**
If using launchd (macOS) or systemd (Linux), restart via service manager:

```bash
# macOS
launchctl kickstart -k gui/$(id -u)/com.eureclaw

# Linux (systemd)
systemctl --user restart eureclaw
```

## Understanding the Restart Flow

```
User sends /restart
    ↓
Bot replies "🔄 Restarting..."
    ↓
Wait 2 seconds (for message to send)
    ↓
Process exits with code 0
    ↓
Supervisor detects exit
    ↓
Wait 5 seconds (for clean disconnect)
    ↓
Supervisor starts new process
    ↓
Bot reconnects to Telegram/WhatsApp
    ↓
Bot ready to receive messages
```

**Total time:** ~7-10 seconds

## Debugging

### Enable debug logging

Add to `.env`:
```bash
LOG_LEVEL=debug
```

Restart and check logs for detailed information.

### Check process status

```bash
# See if EureClaw is running
bun run start:supervised

# In another terminal:
# Windows
Get-Process node

# Linux/macOS
ps aux | grep node
```

### Test without supervisor

If supervisor is causing issues, test direct mode:
```bash
bun start
```

Then manually restart when needed (Ctrl+C and restart).

## When to Report a Bug

Report if:
- Bot never comes back after `/restart`
- Supervisor crashes
- Multiple instances spawn
- Restart works but bot behaves strangely

Include:
- OS and version
- Node.js version
- Terminal output (last 50 lines)
- Steps to reproduce

## Quick Reference

| Issue | Solution |
|-------|----------|
| Bot doesn't respond after restart | Restart Telegram/WhatsApp client |
| "Too many restarts" error | Wait 1 minute, restart manually |
| Process not restarting | Check terminal for errors |
| Multiple instances | Kill all, restart once |
| Slow restart | Normal (7-10 seconds) |

---

**Remember:** `/restart` is for convenience. Manual restart (Ctrl+C + restart) is always more reliable if you're having issues.
