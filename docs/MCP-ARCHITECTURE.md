# EureClaw MCP Architecture

## Overview

EureClaw uses a **single built-in MCP server** to expose tools to the AI agent. This document explains how it works and how to extend it.

## Architecture

```
User (Telegram/WhatsApp)
    ↓
src/index.ts (Orchestrator)
    ↓
container-runner.ts / direct-runner.ts
    ↓
container/agent-runner/src/index.ts (Agent Runner)
    ↓
OpenCode SDK ← → OpenCode Server (LLM)
    ↑
    MCP Server (ipc-mcp-stdio.ts)
```

## The MCP Server

**Location:** `container/agent-runner/src/ipc-mcp-stdio.ts`

This is the **only** MCP server in EureClaw. It provides all tools that the AI agent can use.

### Why a Single Server?

1. **Simplicity** - One server to manage, one place to add tools
2. **Performance** - No overhead of spawning multiple processes
3. **Shared Context** - All tools share the same environment variables (group folder, JID, etc.)
4. **Easier Debugging** - Single log stream, single point of failure

### Current Tools (as of 2026-02-23)

- **Messaging:** `send_message`, `send_image`
- **Scheduling:** `schedule_task`, `list_tasks`, `pause_task`, `resume_task`, `cancel_task`
- **Groups:** `register_group`
- **Models:** `get_current_model`, `change_model`, `set_small_model`, `list_models`
- **Stats:** `show_opencode_stats`
- **Debugging:** `list_logs`, `read_log`

## Adding New Tools

### Step 1: Add Tool to MCP Server

Edit `container/agent-runner/src/ipc-mcp-stdio.ts`:

```typescript
server.tool(
  'tool_name',
  'Description of what the tool does',
  {
    param1: z.string().describe('Parameter description'),
    param2: z.number().optional().describe('Optional parameter')
  },
  async (args) => {
    // Access environment variables
    const groupDir = process.env.EURECLAW_GROUP_DIR || '/workspace/group';
    const projectDir = process.env.PROJECT_DIR || '/workspace/project';
    
    // Tool implementation
    try {
      // Do something
      return {
        content: [{
          type: 'text' as const,
          text: 'Success message'
        }]
      };
    } catch (err) {
      return {
        content: [{
          type: 'text' as const,
          text: `Error: ${err instanceof Error ? err.message : String(err)}`
        }],
        isError: true
      };
    }
  }
);
```

### Step 2: Build

```bash
bun run build
```

This compiles TypeScript to JavaScript in `container/agent-runner/dist/`.

### Step 3: Document

Update `workspaces/global/memory/TOOLS.md` with usage examples:

```markdown
## Tool Name

Description of what the tool does.

**Usage:**
```typescript
await use_mcp_tool('tool_name', {
  param1: 'value',
  param2: 123
});
```

**Example:**
[Provide a concrete example]
```

### Step 4: Restart EureClaw

The new tool will be available after restarting EureClaw.

## Environment Variables Available to Tools

Tools have access to these environment variables:

- `EURECLAW_CHAT_JID` - Current chat JID
- `EURECLAW_GROUP_FOLDER` - Current group folder name
- `EURECLAW_IS_MAIN` - "1" if main group, "0" otherwise
- `EURECLAW_GROUP_DIR` - Path to group directory
- `PROJECT_DIR` - Path to project root
- `EURECLAW_IPC_DIR` - Path to IPC directory

## IPC Communication

Tools can write IPC files to communicate with the orchestrator:

```typescript
function writeIpcFile(dir: string, data: object): string {
  fs.mkdirSync(dir, { recursive: true });
  
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
  const filepath = path.join(dir, filename);
  
  // Atomic write: temp file then rename
  const tempPath = `${filepath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
  fs.renameSync(tempPath, filepath);
  
  return filename;
}

// Example: Send a message
const MESSAGES_DIR = path.join(IPC_DIR, 'messages');
writeIpcFile(MESSAGES_DIR, {
  type: 'message',
  chatJid: chatJid,
  text: 'Hello!',
  timestamp: new Date().toISOString()
});
```

## Anti-Patterns to Avoid

### ❌ Creating a New MCP Server

```typescript
// DON'T DO THIS
// logs-mcp-server.ts
const newServer = new McpServer({ name: 'logs' });
```

### ✅ Extend Existing Server

```typescript
// DO THIS
// In ipc-mcp-stdio.ts
server.tool('list_logs', ...);
```

### ❌ Hardcoding Paths

```typescript
// DON'T DO THIS
const logsDir = '/workspace/group/logs';
```

### ✅ Use Environment Variables

```typescript
// DO THIS
const groupDir = process.env.EURECLAW_GROUP_DIR || '/workspace/group';
const logsDir = path.join(groupDir, 'logs');
```

## Testing Tools

### Manual Test

```bash
# Start EureClaw
bun start

# Send a message via Telegram/WhatsApp
# Use the tool in your message
```

### Direct Test (Advanced)

```bash
# Create test input
echo '{"prompt":"Use list_logs tool","groupFolder":"main","chatJid":"test@g.us","isMain":true}' > test-input.json

# Run agent runner directly
cat test-input.json | node container/agent-runner/dist/index.js
```

## Debugging

### Check if Tool is Registered

The agent runner logs all registered MCP tools on startup. Look for:

```
[agent-runner] Registered MCP server with tools: send_message, schedule_task, ...
```

### Check Tool Execution

Tool invocations are logged:

```
[agent-runner] MCP tool invoked: list_logs
[agent-runner] MCP tool result: {...}
```

### Common Issues

1. **Tool not found** - Did you run `bun run build`?
2. **Environment variable undefined** - Check if variable is passed in `container-runner.ts` or `direct-runner.ts`
3. **Permission denied** - Check file paths and permissions
4. **Tool returns error** - Check logs in `workspaces/{workspace}/logs/`

## Further Reading

- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [OpenCode SDK Documentation](../Project-Docs-Ressources-Helps/opencode-sdk.md)
- [EureClaw Complete Documentation](../Project-Docs-Ressources-Helps/eureclaw-complete-documentation.md)
