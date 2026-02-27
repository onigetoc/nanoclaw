# Available Tools for EureClaw

This file documents tools and capabilities available to EureClaw agents.

## Model Management

### change_model

**CRITICAL:** Use this tool to change AI models. DO NOT edit `opencode.json` or `models-config.json` manually!

**Usage:**
```typescript
await use_mcp_tool('change_model', {
  model: 'google/gemini-2.5-flash-lite'
});
```

**Returns:**
```
✓ Primary model changed to: google/gemini-2.5-flash-lite

⚠️  Restart required for changes to take effect.

/restart
```

**Important:**
- Modifies `models-config.json` (NOT `opencode.json`)
- Always returns `/restart` command for user to click
- Requires restart to apply changes

### set_small_model

Change the lightweight model for simple tasks.

**Usage:**
```typescript
await use_mcp_tool('set_small_model', {
  model: 'google/gemini-2.5-flash-lite'
});
```

### get_current_model

Get current model configuration.

**Usage:**
```typescript
await use_mcp_tool('get_current_model', {});
```

**Returns:**
- Configured primary model
- Configured small model
- Configured fallback model
- Currently running model
- Whether models are in sync

### list_models

List available AI models.

**Usage:**
```typescript
await use_mcp_tool('list_models', {
  category: 'all'  // 'free', 'premium', or 'all'
});
```

## System Monitoring and Status

### show_system_status

Show current system status including active agents, model configuration, OpenCode server status, and recent activity.

**Usage:**
```typescript
await use_mcp_tool('show_system_status', {});
```

**Returns:**
- Current model configuration (primary, small, fallback, vision)
- OpenCode server status and port
- Number of active agents
- Number of registered groups
- Sleep status
- System uptime
- Recent agent executions (last 10)

**When to use:**
- User asks "what's happening?" or "what are you doing?"
- User wants to know which model is being used
- Debugging system issues
- Understanding current system load

### show_execution_stats

Show detailed statistics about agent executions including success rate, average duration, and breakdown by agent type and group.

**Usage:**
```typescript
await use_mcp_tool('show_execution_stats', {});
```

**Returns:**
- Total executions count
- Success rate percentage
- Average execution duration
- Breakdown by agent type (orchestrator, researcher, etc.)
- Breakdown by group

**When to use:**
- User asks about system performance
- Analyzing which agents are used most
- Understanding execution patterns
- Performance troubleshooting

## Logs and Debugging

**Agent execution logs** are written to `groups/{group}/logs/`:
- `direct-*.log` - Direct mode execution logs (Windows/Linux)
- `container-*.log` - Container mode execution logs (macOS)

Each log file contains:
- Full stderr output (agent-runner logs with timestamps)
- Full stdout output (agent responses)
- Execution duration and exit code

### Reading Logs with MCP Tools

Use these MCP tools to access and debug logs:

**list_logs** - List recent log files
```typescript
await use_mcp_tool('list_logs', {
  limit: 20,           // Optional: max files to show (default: 20)
  all_groups: false    // Optional: (main only) show logs from all groups
});
```

**read_log** - Read a specific log file
```typescript
await use_mcp_tool('read_log', {
  filename: 'direct-2026-02-23T12-00-00-000Z.log',
  lines: 100,          // Optional: read last N lines only
  group: 'work'        // Optional: (main only) read from another group
});
```

### What to Look For in Logs

To check if multi-agent system worked, look for:
- `🧠 Complex task detected, using orchestrator agent`
- `agent: orchestrator` in the response metadata
- `step-start` and `step-finish` in parts types

For debugging errors:
- Look for stack traces and error messages
- Check tool invocations and their results
- Verify environment variables and paths
- Check for timeout or memory issues

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


