# Undo/Redo System Test Plan

## Manual Testing Steps

### Test 1: Basic Undo
1. Open Web UI or Telegram
2. Send message: "Hello"
3. Wait for bot response
4. Send message: "How are you?"
5. Wait for bot response
6. Send: `/undo`
7. **Expected:** Bot says "⏪ Undid 1 conversation. Stack: 1"
8. **Verify:** Last message ("How are you?") and its response are gone

### Test 2: Basic Redo
1. After Test 1, send: `/redo`
2. **Expected:** Bot says "⏩ Redid 1 conversation. Stack remaining: 0"
3. **Verify:** Message "How are you?" and response are back

### Test 3: Multiple Undo Steps
1. Send 3 messages with responses
2. Send: `/undo 2`
3. **Expected:** Bot says "⏪ Undid 2 conversations. Stack: 2"
4. **Verify:** Last 2 messages and responses are gone

### Test 4: Undo Without Messages
1. Start new session: `/new`
2. Send: `/undo`
3. **Expected:** Bot says "❌ No messages to undo"

### Test 5: Redo Without Undo
1. Start new session: `/new`
2. Send message: "Test"
3. Send: `/redo`
4. **Expected:** Bot says "❌ Nothing to redo"

### Test 6: New Session Clears Undo
1. Send message: "Test 1"
2. Send: `/undo`
3. **Expected:** Stack: 1
4. Send: `/new`
5. Send: `/redo`
6. **Expected:** Bot says "❌ Nothing to redo"

### Test 7: Invalid Steps Parameter
1. Send: `/undo abc`
2. **Expected:** Bot says "❌ Invalid number of steps. Usage: /undo [steps]"

### Test 8: Cross-Channel Consistency
1. Test `/undo` in Web UI
2. Test `/undo` in Telegram
3. Test `/undo` in WhatsApp (if available)
4. **Expected:** Same behavior in all channels

### Test 9: Help Command
1. Send: `/help`
2. **Expected:** Help text includes:
   - `/undo [steps] - Undo conversation steps (default: 1)`
   - `/redo [steps] - Redo conversation steps (default: 1)`

### Test 10: Undo More Than Available
1. Send 2 messages
2. Send: `/undo 5`
3. **Expected:** Bot says "❌ Not enough messages to undo"

## Automated Testing (Future)

```typescript
// test/undo-redo.test.ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { undo, redo, clearUndoState } from '../src/commands/undo-manager';

describe('Undo/Redo System', () => {
  const mockSessionId = 'test-session-123';

  beforeEach(() => {
    clearUndoState(mockSessionId);
  });

  it('should undo 1 conversation step', async () => {
    // Mock OpenCode SDK client
    // Send messages
    // Call undo
    // Verify result
  });

  it('should redo 1 conversation step', async () => {
    // Mock OpenCode SDK client
    // Undo first
    // Call redo
    // Verify result
  });

  it('should handle multiple undo steps', async () => {
    // Test /undo 3
  });

  it('should clear undo state on new session', () => {
    // Test clearUndoState
  });

  it('should return error when nothing to undo', async () => {
    // Test empty session
  });

  it('should return error when nothing to redo', async () => {
    // Test without undo first
  });
});
```

## Performance Testing

1. **Large Conversation:**
   - Send 50 messages
   - Time `/undo 25`
   - Should complete in < 2 seconds

2. **Rapid Undo/Redo:**
   - Send 10 messages
   - Rapidly alternate `/undo` and `/redo`
   - Should not crash or lose state

3. **Concurrent Sessions:**
   - Open 3 different chats
   - Use `/undo` in each
   - Verify undo state is isolated per session

## Edge Cases

1. **Session Restart:**
   - Undo some messages
   - Restart EureClaw server
   - Try to redo
   - **Expected:** Undo state is lost (in-memory only)

2. **Invalid Session ID:**
   - Manually call `undo('invalid-session', 1)`
   - **Expected:** Graceful error handling

3. **OpenCode Server Down:**
   - Stop OpenCode server
   - Try `/undo`
   - **Expected:** Error message, no crash

## Success Criteria

- ✅ All manual tests pass
- ✅ No TypeScript errors
- ✅ No runtime crashes
- ✅ Consistent behavior across channels
- ✅ Clear error messages
- ✅ Proper logging
- ✅ Build succeeds (`bun run build`)

## Known Issues

1. `unrevert()` restores ALL messages at once (OpenCode SDK limitation)
2. Undo state lost on server restart (in-memory only)
3. No visual feedback in Web UI (command-line only for now)

## Next Steps After Testing

1. Add visual undo/redo buttons in Web UI
2. Show undo stack depth in UI
3. Persist undo state to database
4. Add keyboard shortcuts (Ctrl+Z, Ctrl+Y)
5. Implement partial redo (custom tracking)
