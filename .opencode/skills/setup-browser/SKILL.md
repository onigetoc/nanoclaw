---
name: setup-browser
description: Setup and verify agent-browser installation for Windows direct mode. Checks if agent-browser is installed and guides installation if needed.
---

# Browser Setup (Windows Direct Mode)

This skill helps setup agent-browser on Windows when running without Docker.

## Check Installation

```bash
agent-browser --version
```

If this works, you're all set! ✅

## Install agent-browser

If not installed:

```bash
# Install globally
npm install -g agent-browser

# Download Chromium
agent-browser install

# Verify
agent-browser --version
```

## Troubleshooting

**Command not found:**
- Make sure Node.js and npm are installed
- Check npm global bin is in PATH: `npm config get prefix`
- On Windows, restart terminal after installation

**Permission errors:**
- Run terminal as Administrator
- Or use: `npm install -g agent-browser --force`

**Chromium download fails:**
- Check internet connection
- Try manual download: `agent-browser install --force`
- Check antivirus isn't blocking

## Verify Setup

Test with a simple command:

```bash
agent-browser open https://example.com
agent-browser screenshot test.png
agent-browser close
```

If this works, agent-browser is ready! You can now use the `agent-browser` skill.

## Container Mode

If running on macOS/Linux with Docker, agent-browser is pre-installed in the container. No setup needed.
