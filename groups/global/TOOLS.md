# Available Tools for EureClaw

This file documents tools and capabilities available to EureClaw agents.

## Sending Images via Telegram/WhatsApp

EureClaw can send images and files via messaging platforms using the `send_image` MCP tool.

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

EureClaw automatically transcribes voice messages using Groq Whisper (free).

## Search Behavior

**CRITICAL RULES FOR ALL SEARCHES:**

When performing ANY search (news, YouTube, Wikipedia, web, Brave, GitHub, etc.):

1. **ALWAYS include clickable links** - Format: `[Title](URL)`
   - ❌ BAD: "I found an article about X"
   - ✅ GOOD: "I found [Article Title](https://example.com/article)"

2. **Provide rich context for each result:**
   - Title (as clickable link)
   - Brief description (1-2 sentences)
   - Source/domain
   - Publication date (if available)

3. **Links are MANDATORY** - They will be:
   - Reused later in the conversation
   - Shared with the user for reference
   - Used by other tools for deeper analysis

4. **Format example:**
   ```
   Here are the top results:
   
   1. [Article Title](https://example.com/article)
      Brief description of what this article covers.
      Source: example.com | Published: Jan 15, 2024
   
   2. [Another Resource](https://site.com/page)
      What makes this resource valuable.
      Source: site.com | Published: Dec 2023
   ```

5. **For complex questions:**
   - Start with a brief plan (5-10 bullet points)
   - Execute the search/research
   - Provide detailed results with links
   - End with summary and next steps

6. **For simple questions:**
   - Answer directly without deep research
   - Still include links if you mention external resources

**REMEMBER:** Every search result MUST have a clickable link. No exceptions.

## Vision/Image Analysis

EureClaw can analyze images sent by users (if vision model is configured).


