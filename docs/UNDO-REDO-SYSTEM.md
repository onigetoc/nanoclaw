# Undo/Redo System

EureClaw implements a conversation undo/redo system using OpenCode SDK's session management APIs.

## Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/undo [steps]` | Revert conversation by X user messages | `/undo 2` |
| `/redo [steps]` | Restore reverted conversations | `/redo 1` |

Default steps: 1

## How It Works

1. **Undo Operation:**
   - Fetches all messages from the OpenCode session
   - Filters for user messages only
   - Calculates target message (current position - steps)
   - Calls `client.session.revert({ messageID: targetMessageId })`
   - OpenCode cuts the conversation timeline at that point
   - Increments undo stack counter

2. **Redo Operation:**
   - Checks if there are any undone operations (undo stack > 0)
   - Calls `client.session.unrevert()` to restore ALL reverted messages
   - Decrements undo stack counter
   - Note: `unrevert()` restores everything at once (OpenCode SDK limitation)

3. **New Session:**
   - `/new` command automatically clears undo history
   - Fresh session starts with empty undo stack

## Architecture

```
src/commands/
├── undo-manager.ts          # Core undo/redo logic
├── builtin-commands.ts      # /undo and /redo command handlers
└── command-effects.ts       # Clears undo state on /new
```

### Key Functions

**`undo-manager.ts`:**
- `undo(sessionId, steps)` - Revert X conversation steps
- `redo(sessionId, steps)` - Restore X conversation steps
- `clearUndoState(sessionId)` - Clear undo history
- `getUndoStackDepth(sessionId)` - Get current undo depth

**State Management:**
```typescript
interface UndoState {
  undoStack: number;        // Number of undo operations performed
  lastMessageCount: number; // Last known message count
}

// In-memory storage per session
const undoStates = new Map<string, UndoState>();
```

## Usage Examples

### Basic Undo/Redo
```
User: Write a function to calculate fibonacci
Bot: [generates code]
User: /undo
Bot: ⏪ Undid 1 conversation. Stack: 1
User: /redo
Bot: ⏩ Redid 1 conversation. Stack remaining: 0
```

### Multiple Steps
```
User: Message 1
Bot: Response 1
User: Message 2
Bot: Response 2
User: Message 3
Bot: Response 3
User: /undo 2
Bot: ⏪ Undid 2 conversations. Stack: 2
[Now at Message 1 / Response 1]
```

### New Session Clears History
```
User: /undo
Bot: ⏪ Undid 1 conversation. Stack: 1
User: /new
Bot: 🆕 New session created (abc123...)
User: /redo
Bot: ❌ Nothing to redo
```

## Cross-Channel Support

The undo/redo system works identically across all channels:
- WhatsApp groups
- Telegram chats
- Web UI

Commands are processed by the universal command system (`src/commands/index.ts`) before reaching the agent, ensuring consistent behavior everywhere.

## Limitations

1. **Unrevert Behavior:** OpenCode's `unrevert()` restores ALL reverted messages at once. You can't partially redo (e.g., redo 1 out of 3 undone messages).

2. **In-Memory State:** Undo stack is stored in memory and lost on server restart. Consider persisting to database for production use.

3. **Registered Groups Only:** Requires an active OpenCode session, so only works in registered chats.

4. **No File Versioning:** This system only reverts conversation history, not file changes. For file versioning, use Git or implement a separate file history system.

## Future Enhancements

- [ ] Persist undo state to database (survive server restarts)
- [ ] Add visual undo/redo buttons in Web UI
- [ ] Show undo stack depth in UI status bar
- [ ] Implement partial redo (requires custom message tracking)
- [ ] Add keyboard shortcuts (Ctrl+Z, Ctrl+Y) in Web UI
- [ ] Show preview of what will be undone/redone
- [ ] Add undo/redo for file changes (integrate with Git)

## OpenCode SDK APIs Used

```typescript
import { createOpencodeClient } from '@opencode-ai/sdk';

const client = createOpencodeClient({ baseUrl: 'http://localhost:4096' });

// Get messages
const messages = await client.session.messages({ path: { id: sessionId } });

// Revert to specific message
await client.session.revert({
  path: { id: sessionId },
  body: { messageID: targetMessageId }
});

// Restore all reverted messages
await client.session.unrevert({ path: { id: sessionId } });
```

## Error Handling

The system handles various error cases:
- No active session → "No active session found"
- No messages to undo → "No messages to undo"
- Not enough messages → "Not enough messages to undo"
- Nothing to redo → "Nothing to redo"
- API failures → "Undo/Redo failed: [error message]"

All errors are logged with context (sessionId, steps, error details) for debugging.

## Testing

To test the undo/redo system:

1. Start a conversation in any channel
2. Send multiple messages
3. Use `/undo` to revert
4. Verify conversation history is cut
5. Use `/redo` to restore
6. Verify messages are back
7. Use `/new` to start fresh session
8. Verify undo history is cleared

## References

- OpenCode SDK: https://opencode.ai/docs/sdk/
- Session Management: https://opencode.ai/docs/sdk/session/
- EureClaw Command System: `docs/COMMAND-SYSTEM-IMPLEMENTATION.md`
