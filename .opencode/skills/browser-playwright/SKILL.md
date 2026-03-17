---
name: browser-playwright
description: Browse the web, take screenshots, search, click, fill forms, and extract data. Use for ANY web browsing task. The browser stays open between commands — navigate, then screenshot, then click, all on the same page. Auto-starts if not running.
allowed-tools: Bash(node:*)
---

# Browser Automation (Playwright)

## How It Works

A browser daemon keeps Chrome open in the background. Each command operates on the SAME browser session. Navigate to a page, take a screenshot, click a button — all on the same page. The daemon auto-starts on first use.

## Commands

All commands use: `node .opencode/skills/browser-playwright/scripts/browser.js <action> [args]`

### Navigate
```bash
node .opencode/skills/browser-playwright/scripts/browser.js navigate "https://reddit.com"
```

### Screenshot
```bash
node .opencode/skills/browser-playwright/scripts/browser.js screenshot "page.png"
node .opencode/skills/browser-playwright/scripts/browser.js screenshot "page.png" --full
```

### Click
```bash
node .opencode/skills/browser-playwright/scripts/browser.js click "button[type='submit']"
```

### Fill (clear + type)
```bash
node .opencode/skills/browser-playwright/scripts/browser.js fill "input[name='q']" "search text"
```

### Type (keystroke by keystroke, more human-like)
```bash
node .opencode/skills/browser-playwright/scripts/browser.js type "input[name='q']" "search text"
```

### Press key
```bash
node .opencode/skills/browser-playwright/scripts/browser.js press "Enter"
```

### Wait
```bash
node .opencode/skills/browser-playwright/scripts/browser.js wait 2000
node .opencode/skills/browser-playwright/scripts/browser.js wait ".results"
```

### Extract text
```bash
node .opencode/skills/browser-playwright/scripts/browser.js extract "h1"
node .opencode/skills/browser-playwright/scripts/browser.js extract ".post-title" --all
node .opencode/skills/browser-playwright/scripts/browser.js extract "a" --all --attr href
```

### Scroll
```bash
node .opencode/skills/browser-playwright/scripts/browser.js scroll down 500
node .opencode/skills/browser-playwright/scripts/browser.js scroll up 300
```

### Get current URL / title
```bash
node .opencode/skills/browser-playwright/scripts/browser.js url
node .opencode/skills/browser-playwright/scripts/browser.js title
```

### Close browser
```bash
node .opencode/skills/browser-playwright/scripts/browser.js close
```

## Typical Workflow

1. Navigate to page
2. Screenshot to see what's on screen
3. Decide next action (click, fill, scroll)
4. Screenshot again to verify
5. If CAPTCHA or login needed: send screenshot to user and ask them to handle it
6. Continue after user confirms

## ⚠️ Windows Limitations (No Docker/WSL)

Without Docker or WSL, browser automation is severely limited on Windows:
- Most major sites (Twitter/X, Google, Reddit) will block or CAPTCHA you immediately
- Fresh Playwright profiles have no cookies/sessions = login walls everywhere
- Browser fingerprinting detects automation even with stealth patches
- The browser skill is only useful for simple, public websites that don't require login
- Do NOT attempt to browse Twitter, Google Search, Reddit, or any site requiring authentication
- If the user asks to browse a site that requires login, explain the limitation and suggest alternatives (web search skill, API access, etc.)

## CRITICAL: Failure Handling

- If the browser daemon fails to start after 1 attempt: STOP. Tell the user the browser is not available and suggest they check the setup.
- If a navigation fails (timeout, ERR_ABORTED, etc.): retry up to 3 times. After 3 failures, STOP and report the error to the user.
- If you get blocked by a login wall or CAPTCHA: take a screenshot, send it to the user, and WAIT for their response. Do NOT retry on your own.
- NEVER retry the same failing command more than 3 times total. After 3 failures, close the browser and inform the user.
- Do NOT "think out loud" about what to try. Just try it. If it fails 3 times, report and stop.
- If the browser seems frozen (commands timeout repeatedly): close the browser with the `close` command and tell the user.
- Budget awareness: each browser command costs agent tokens. Looping on failures wastes tokens rapidly.

## Sending Screenshots

After taking a screenshot, send it to the user with the `send_image` MCP tool:
```
send_image(filePath: "page.png", caption: "description")
```

## Notes

- Browser stays open between commands (daemon mode)
- Auto-starts on first command, no manual setup needed
- Uses persistent profile in `data/browser-profile/` (cookies survive)
- Stealth mode enabled (anti-bot detection)
- Close browser with `close` command when done
