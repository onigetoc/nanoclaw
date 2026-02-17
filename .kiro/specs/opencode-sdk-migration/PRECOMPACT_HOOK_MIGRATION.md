# PreCompact Hook Migration - OpenCode SDK

## Summary

Task 7.1 has been completed. The PreCompact hook functionality for conversation archiving has been migrated from Claude SDK to OpenCode SDK.

## Key Finding

**OpenCode SDK does not support hooks** like Claude SDK did. After thorough research of the OpenCode SDK v1.2.6 API:
- No hook system in the Config type
- No PreCompact, PreToolUse, or similar hook mechanisms
- No event-based archiving triggers

## Solution Implemented

Since OpenCode SDK lacks hooks, conversation archiving is now implemented using a **periodic archiving approach**:

### 1. New Function: `archiveSessionConversation()`

Located in `container/agent-runner/src/index.ts`, this function:
- Uses `client.session.messages()` to fetch all messages from a session
- Converts OpenCode message format to our internal `ParsedMessage` format
- Extracts text content from message parts
- Generates archive filename from session summary or timestamp
- Saves formatted markdown to `conversations/` directory

### 2. Periodic Archiving

The archiving function is called every 10 queries in the main query loop:
```typescript
const ARCHIVE_INTERVAL = 10; // Archive every 10 queries

if (sessionId && queryCount % ARCHIVE_INTERVAL === 0 && opencodeInstance?.client) {
  log(`Archiving conversation (query count: ${queryCount})`);
  await archiveSessionConversation(opencodeInstance.client, sessionId, groupDir);
}
```

### 3. Archive Format Maintained

The existing archive format is preserved:
- Markdown files in `conversations/` directory
- Filename format: `YYYY-MM-DD-{summary}.md`
- Content format: Title, timestamp, user/assistant messages
- Message truncation at 2000 characters

## Changes Made

### Modified Files

1. **container/agent-runner/src/index.ts**
   - Added `archiveSessionConversation()` function
   - Marked `createPreCompactHook()` as deprecated (kept for reference)
   - Added periodic archiving in query loop
   - Added documentation comments explaining OpenCode SDK limitations

### Preserved Functions

All helper functions remain unchanged:
- `sanitizeFilename()` - Converts summary to safe filename
- `generateFallbackName()` - Creates timestamp-based filename
- `formatTranscriptMarkdown()` - Formats messages as markdown
- `ParsedMessage` interface - Message structure

## Requirements Satisfied

✅ **Requirement 5.3**: PreCompact hooks trigger conversation archiving
- Archiving functionality maintained
- Archive format and location unchanged
- Adapted to OpenCode SDK's API model

## Technical Details

### OpenCode SDK Message API

```typescript
// Fetch messages from session
const response = await client.session.messages({
  path: { id: sessionId }
});

// Response structure:
// response.data: Array<{
//   info: Message (UserMessage | AssistantMessage)
//   parts: Array<Part> (TextPart | ReasoningPart | FilePart | etc.)
// }>
```

### Message Extraction

```typescript
// User messages
if (message.role === 'user') {
  const textParts = parts
    .filter((p: any) => p.type === 'text')
    .map((p: any) => p.text)
    .join('');
  messages.push({ role: 'user', content: textParts });
}

// Assistant messages
if (message.role === 'assistant') {
  const textParts = parts
    .filter((p: any) => p.type === 'text')
    .map((p: any) => p.text)
    .join('');
  messages.push({ role: 'assistant', content: textParts });
}
```

## Advantages of Periodic Archiving

1. **Proactive**: Archives conversations regularly, not just before compaction
2. **Predictable**: Runs every N queries, easy to reason about
3. **Resilient**: Doesn't depend on SDK-specific events
4. **Configurable**: `ARCHIVE_INTERVAL` can be adjusted based on needs

## Potential Improvements

Future enhancements could include:
1. **Message count threshold**: Archive when session exceeds X messages
2. **Time-based archiving**: Archive after X minutes of inactivity
3. **Manual archiving**: MCP tool to trigger archiving on demand
4. **Incremental archiving**: Only archive new messages since last archive

## Testing Recommendations

1. **Unit Tests**:
   - Test `archiveSessionConversation()` with mock OpenCode client
   - Test message extraction from various part types
   - Test filename generation with/without summary

2. **Integration Tests**:
   - Create session with multiple messages
   - Run 10+ queries to trigger archiving
   - Verify archive file created in conversations/
   - Verify archive content matches session messages

3. **Edge Cases**:
   - Empty session (no messages)
   - Session with only user messages
   - Session with only assistant messages
   - Very long messages (truncation)
   - Special characters in summary (filename sanitization)

## Migration Notes

The old `createPreCompactHook()` function is marked as deprecated but kept in the codebase for reference during the migration period. It can be removed once the migration is fully validated.

## Compilation Status

✅ TypeScript compilation successful
✅ No type errors
✅ All dependencies resolved

## Next Steps

1. Test the archiving functionality with a real session
2. Verify archive files are created correctly
3. Adjust `ARCHIVE_INTERVAL` if needed based on usage patterns
4. Consider implementing additional archiving triggers (message count, time-based)
5. Update documentation to reflect the new archiving approach
