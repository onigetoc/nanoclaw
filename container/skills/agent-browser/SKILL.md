---
name: agent-browser
description: Browse the web for any task — research topics, read articles, interact with web apps, fill forms, take screenshots, extract data, and test web pages. Use whenever a browser would be useful, not just when the user explicitly asks.
allowed-tools: Bash(agent-browser:*)
---

# Browser Automation with agent-browser

## Setup (Container Mode — macOS/Linux)

```bash
agent-browser open <url>        # Navigate to page
agent-browser snapshot -i       # Get interactive elements with refs
agent-browser click @e1         # Click element by ref
agent-browser fill @e2 "text"   # Fill input by ref
agent-browser close             # Close browser
```

## Core workflow

1. Navigate: `agent-browser open <url>`
2. Snapshot: `agent-browser snapshot -i` (returns elements with refs like `@e1`, `@e2`)
3. Interact using refs from the snapshot
4. Re-snapshot after navigation or significant DOM changes

## Commands

### Navigation
```bash
agent-browser open <url>
agent-browser back
agent-browser forward
agent-browser reload
agent-browser close
```

### Snapshot (page analysis)
```bash
agent-browser snapshot            # Full accessibility tree
agent-browser snapshot -i         # Interactive elements only (recommended)
agent-browser snapshot -c         # Compact output
agent-browser snapshot -d 3       # Limit depth to 3
agent-browser snapshot -s "#main" # Scope to CSS selector
```

### Interactions (use @refs from snapshot)
```bash
agent-browser click @e1
agent-browser dblclick @e1
agent-browser fill @e2 "text"
agent-browser type @e2 "text"
agent-browser press Enter
agent-browser hover @e1
agent-browser check @e1
agent-browser uncheck @e1
agent-browser select @e1 "value"
agent-browser scroll down 500
agent-browser upload @e1 file.pdf
```

### Get information
```bash
agent-browser get text @e1
agent-browser get html @e1
agent-browser get value @e1
agent-browser get attr @e1 href
agent-browser get title
agent-browser get url
agent-browser get count ".item"
```

### Screenshots & PDF
```bash
agent-browser screenshot path.png
agent-browser screenshot --full
agent-browser pdf output.pdf
```

### Wait
```bash
agent-browser wait @e1
agent-browser wait 2000
agent-browser wait --text "Success"
agent-browser wait --url "**/dashboard"
agent-browser wait --load networkidle
```

### Semantic locators (alternative to refs)
```bash
agent-browser find role button click --name "Submit"
agent-browser find text "Sign In" click
agent-browser find label "Email" fill "user@test.com"
agent-browser find placeholder "Search" type "query"
```

### Authentication with saved state
```bash
agent-browser state save auth.json
agent-browser state load auth.json
```

## Sending Screenshots

After taking a screenshot, send it to the user with the `send_image` MCP tool:
```
send_image(filePath: "screenshot.png", caption: "optional description")
```

Save screenshots in the group folder for EureClaw to access them.
