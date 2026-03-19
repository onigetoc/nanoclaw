# Windows Setup Guide

EureClaw works on Windows in **direct mode** (without Docker). This guide covers Windows-specific setup steps.

## Prerequisites

1. **Node.js** (v18 or later)
   - Download from https://nodejs.org/
   - Verify: `node --version`

2. **Bun** (package manager)
   - Install: `npm install -g bun`
   - Verify: `bun --version`

3. **OpenCode CLI** (required!)
   - Install: `npm install -g opencode-ai`
   - Verify: `opencode --version`

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/yourusername/eureclaw.git
cd eureclaw

# 2. Install dependencies
bun install

# 3. Configure environment
cp .env.example .env
# Edit .env with your settings (TELEGRAM_BOT_TOKEN, etc.)

# 4. Configure OpenCode authentication
opencode auth login
# Select your provider (Google, Anthropic, etc.)
# Paste your API key when prompted

# 5. Build the project
bun run build

# 6. Start EureClaw
bun start
```

## Windows-Specific Notes

### Direct Mode (No Docker)

On Windows, EureClaw runs in **direct mode** because Docker/containers are not available. This means:

- ✅ Agents run directly via Node.js (no container isolation)
- ✅ Faster startup (no container overhead)
- ⚠️ Less secure (no filesystem isolation)
- ⚠️ Agents have access to your full filesystem

**Security implications:**
- Agents can read/write any file your user account can access
- Be careful with untrusted code or prompts
- Consider running in a dedicated Windows user account for isolation

### OpenCode Server

The OpenCode server is automatically managed by EureClaw:
- Starts on port 4100 (or next available port)
- Auto-restarts if it crashes
- Health checks every 30 seconds

You can verify it's running:
```powershell
netstat -ano | findstr ":4100"
```

### Common Issues

#### "opencode: command not found"

**Problem:** The `opencode` binary is not in your PATH.

**Solution:**
```bash
npm install -g opencode-ai
```

Then restart your terminal.

#### "fetch failed" error in logs

**Problem:** OpenCode server is not running or not accessible.

**Diagnosis:**
```powershell
# Check if OpenCode is installed
opencode --version

# Check if server is running
netstat -ano | findstr ":4100"
```

**Solution:**
1. Ensure OpenCode is installed: `npm install -g opencode-ai`
2. Restart EureClaw: `bun start`
3. Check logs in `workspaces/main/logs/` for details

#### Port 4100 already in use

**Problem:** Another process is using port 4100.

**Solution:**
```powershell
# Find the process using port 4100
netstat -ano | findstr ":4100"

# Kill the process (replace PID with actual process ID)
taskkill /F /PID <PID>

# Or set a different port in .env
echo OPENCODE_PORT=4101 >> .env
```

#### Agent exits with code 1

**Problem:** Usually means OpenCode server connection failed.

**Check:**
1. Is OpenCode installed? `opencode --version`
2. Is the server running? `netstat -ano | findstr ":4100"`
3. Check recent logs: `workspaces/main/logs/direct-*.log`

**Solution:**
- Restart EureClaw: `bun start`
- If problem persists, check `workspaces/main/logs/` for detailed error messages

## Performance Tips

### Use SSD for Database

SQLite performs much better on SSD. If possible, keep the `store/` directory on an SSD.

### Adjust Timeout Settings

If you have a slow internet connection, increase timeouts in `.env`:
```bash
CONTAINER_TIMEOUT=3600000  # 1 hour (default: 30 minutes)
IDLE_TIMEOUT=120000        # 2 minutes (default: 1 minute)
```

### Disable Verbose Logging

For better performance, use minimal logging:
```bash
LOG_LEVEL=info  # or 'warn' for even less output
```

## Upgrading OpenCode

To upgrade to the latest OpenCode version:
```bash
npm update -g opencode-ai
opencode --version
```

Then restart EureClaw.

## Troubleshooting

### Enable Debug Logging

Edit `.env`:
```bash
LOG_LEVEL=debug
```

Then restart EureClaw. Check logs in:
- Console output
- `workspaces/main/logs/direct-*.log`

### Clean Restart

If things are broken, try a clean restart:
```bash
# 1. Stop EureClaw (Ctrl+C)

# 2. Kill any orphaned OpenCode processes
tasklist | findstr opencode
taskkill /F /IM opencode.exe

# 3. Clear corrupted database files (if needed)
# Only do this if you're having database issues!
del %USERPROFILE%\.local\share\opencode\opencode.db-wal
del %USERPROFILE%\.local\share\opencode\opencode.db-shm

# 4. Restart
bun start
```

### Get Help

If you're still stuck:
1. Check the logs in `workspaces/main/logs/`
2. Look for error messages in the console
3. Open an issue on GitHub with:
   - Your Windows version
   - OpenCode version (`opencode --version`)
   - Node version (`node --version`)
   - Relevant log excerpts

## Related Documentation

- [API Keys Setup](API-KEYS-SETUP.md) - Configure AI provider credentials
- [Model Configuration](MODEL-CONFIGURATION.md) - Choose your AI models
- [Main README](../README.md) - General EureClaw documentation
