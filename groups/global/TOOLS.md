# Available Tools for NanoClaw

This file documents tools and capabilities available to NanoClaw agents.

## Sending Images via Telegram/WhatsApp

NanoClaw can send images and files via messaging platforms using the `send_image` MCP tool.

**Supported file types:**
- Images: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`
- Documents: `.pdf`

**How to send an image:**

```typescript
// After taking a screenshot or generating an image
await use_mcp_tool('send_image', {
  filePath: 'screenshot.png',  // Relative to group folder
  caption: 'Amazon search results'  // Optional
});
```

**Path resolution:**
- Relative paths are resolved from the group folder (e.g., `screenshot.png` → `groups/main/screenshot.png`)
- Absolute paths are supported
- The tool will search both group folder and project root

**Example workflow with browser automation:**

```bash
# 1. Navigate and take screenshot (all-in-one, saves to groups/{group}/)
node .opencode/skills/browser-playwright/scripts/navigate-and-screenshot.js "https://example.com" "results.png"

# 2. Send via MCP tool
await use_mcp_tool('send_image', {
  filePath: 'results.png',
  caption: 'Here are the search results'
});
```

## Browser Automation

See skills:
- `browser-playwright` (Windows native)
- `agent-browser` (Container mode)

Both skills can take screenshots. Screenshots are automatically saved in the group folder (`groups/{group}/`) and can be sent using the `send_image` tool.

## Audio Transcription

NanoClaw automatically transcribes voice messages using Groq Whisper (free).

## Search Behavior

When performing any search (news, YouTube, Wikipedia, web, Brave, GitHub, etc.):
- Provide maximum detail: title, description, and links
- Links are critical — they may be reused later in the conversation, in interactions with the user, or by other tools
- Always include source URLs in your responses
- For complex questions, start with a brief bullet-point plan (5-10 points) of what you'll do
- After answering complex questions, include a summary and next steps at the end
- Use MCP server tools to go deeper when the task requires structured work
- For simple questions (greetings, quick facts), just answer directly without deep research

## Vision/Image Analysis

NanoClaw can analyze images sent by users (if vision model is configured).
