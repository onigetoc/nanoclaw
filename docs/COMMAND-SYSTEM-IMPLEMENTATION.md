# Command System Implementation

## Overview

EureClaw now has a flexible command system that supports both EureClaw-specific commands and OpenCode SDK commands.

## Architecture

### Command Flow

```
User Message → executeCommand() → Command Handler → CommandResponse
                     ↓
              Is it a command?
                     ↓
         ┌───────────┴───────────┐
         ↓                       ↓
    EureClaw Command      OpenCode Command
    (execute & return)    (set flags & continue)
         ↓                       ↓
    Send reply            Process with agent
                               ↓
                          Agent sees flags
                               ↓
                          Takes action
```

### Files Structure

```
src/commands/
├── index.ts                    # Command registry and execution
├── builtin-commands.ts         # EureClaw system commands
├── opencode-commands.ts        # OpenCode SDK commands
├── sleep-manager.ts            # Sleep mode logic
└── __tests__/
    └── opencode-commands.test.ts
```

## Command Types

### 1. EureClaw Commands (Immediate Execution)

These commands are handled directly by EureClaw and return immediately:

- `/restart` - Restart the service
- `/sleep [duration]` - Put bot to sleep
- `/awake` - Wake from sleep
- `/status` - Check bot status
- `/help` - Show help message
- `/chatid` - Get chat ID (Telegram)

**Behavior:**
1. Command is executed
2. Reply is sent to user
3. Processing stops (returns early)

### 2. OpenCode Commands (Deferred Execution)

These commands set flags and continue processing:

- `/new` - Create new session

**Behavior:**
1. Command sets flags in `CommandResponse.data`
2. Reply is sent to user
3. Processing continues (doesn't return)
4. Message is sent to agent with modified state

## Implementation Details

### Command Registration

```typescript
// In src/commands/opencode-commands.ts
registerCommand('new', async (ctx: CommandContext): Promise<CommandResponse> => {
  return {
    reply: '🆕 Starting a new session...',
    action: 'none',
    data: {
      opencodeCommand: 'new',
      forceNewSession: true,
    },
  };
});
```

### Command Detection

```typescript
// Check if command is EureClaw-specific
const EURECLAW_COMMANDS = new Set([
  'restart', 'sleep', 'awake', 'status', 'help', 'chatid'
]);

function isEureClawCommand(command: string): boolean {
  return EURECLAW_COMMANDS.has(command.toLowerCase());
}

// Check if message is an OpenCode command
function isOpenCodeCommand(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed.startsWith('/')) return false;
  
  const command = trimmed.slice(1).split(/\s+/)[0].toLowerCase();
  return !isEureClawCommand(command);
}
```

### Session Reset Flow

```typescript
// In src/startup.ts
if (commandResult.data?.opencodeCommand === 'new' && 
    commandResult.data?.forceNewSession) {
  if (group) {
    logger.info({ chatJid, groupFolder: group.folder }, 
                'Forcing new session via /new command');
    // Clear session ID to force new session creation
    setGroupSession(group.folder, '');
  }
}

// Don't return - let message continue to agent
if (commandResult.data?.opencodeCommand === 'new') {
  // Continue processing
} else {
  return; // Stop for other commands
}
```

## Adding New Commands

### EureClaw Command Example

```typescript
// In src/commands/builtin-commands.ts
registerCommand('mycommand', async (ctx: CommandContext): Promise<CommandResponse> => {
  // Validate context
  if (!ctx.group) {
    return {
      reply: '⛔ This command is only available in registered chats.',
    };
  }

  // Execute logic
  const result = doSomething(ctx.args);

  // Return response
  return {
    reply: `✅ Command executed: ${result}`,
    action: 'none',
  };
});
```

### OpenCode Command Example

```typescript
// In src/commands/opencode-commands.ts
registerCommand('history', async (ctx: CommandContext): Promise<CommandResponse> => {
  return {
    reply: '📜 Fetching conversation history...',
    action: 'none',
    data: {
      opencodeCommand: 'history',
      limit: ctx.args[0] ? parseInt(ctx.args[0]) : 10,
    },
  };
});

// Then in src/startup.ts, handle the command:
if (commandResult.data?.opencodeCommand === 'history') {
  // Fetch history and send to user
  const limit = commandResult.data.limit;
  // ... implementation
}
```

## Testing

Run tests:
```bash
bun test src/commands/__tests__/opencode-commands.test.ts
```

Test coverage:
- Command registration
- Command detection (EureClaw vs OpenCode)
- Command execution
- Error handling
- Case insensitivity

## Future Enhancements

### Potential Features

1. **Command Aliases**
   ```typescript
   registerCommand('n', async (ctx) => {
     // Alias for /new
     return executeCommand('/new', ctx);
   });
   ```

2. **Command Permissions**
   ```typescript
   interface CommandOptions {
     adminOnly?: boolean;
     allowedGroups?: string[];
   }
   ```

3. **Command Rate Limiting**
   ```typescript
   const rateLimits = new Map<string, number>();
   // Limit commands per user per minute
   ```

4. **Command History**
   ```typescript
   // Store command usage for analytics
   storeCommandUsage(ctx.chatJid, ctx.senderId, command);
   ```

5. **Dynamic Command Loading**
   ```typescript
   // Load commands from plugins
   loadCommandsFromDirectory('./plugins/commands');
   ```

## Troubleshooting

### Command Not Working

1. Check if command is registered:
   ```typescript
   console.log(getRegisteredCommands());
   ```

2. Check command detection:
   ```typescript
   console.log(parseCommand('/mycommand arg1 arg2'));
   ```

3. Check logs:
   ```bash
   tail -f logs/eureclaw.log | grep "command"
   ```

### Session Not Resetting

1. Verify session is cleared:
   ```typescript
   console.log(getSessions());
   // Should show empty string for the group
   ```

2. Check agent runner logs:
   ```bash
   # Look for "Creating new OpenCode session"
   ```

## Related Documentation

- [Commands Reference](./COMMANDS.md) - User-facing command documentation
- [Technical Decisions](../dev-notes/decisions.md) - Architecture decisions
- [OpenCode SDK](../dev-notes/opencode-sdk-help.md) - SDK integration details

## Summary

The command system provides:
- ✅ Clean separation between EureClaw and OpenCode commands
- ✅ Easy command registration
- ✅ Flexible command handling (immediate vs deferred)
- ✅ Extensible architecture for future features
- ✅ Type-safe command handlers
- ✅ Comprehensive testing

The `/new` command successfully creates fresh OpenCode sessions by clearing the session ID before agent execution.
