# Memory System Guide

## Overview

EureClaw uses a hybrid memory system combining SQLite and markdown files for optimal performance and simplicity.

## Architecture

```
┌─────────────────────────────────────────┐
│ MEMORY.md                               │
│ Long-term curated memory                │
│ - User profile & preferences            │
│ - Project decisions                     │
│ - Important lessons                     │
│ Auto-loaded at session start            │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│ SQLite Database                         │
│ Recent conversation history             │
│ - Last 50 messages                      │
│ - Searchable with SQL                   │
│ Auto-loaded at session start            │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│ conversations/                          │
│ Archived conversation snapshots         │
│ - Full conversation history             │
│ - For reference when needed             │
│ Not loaded automatically                │
└─────────────────────────────────────────┘
```

## Files

### Per-Workspace Files

Each workspace has its own memory:

- `workspaces/{name}/dna/MEMORY.md` - Long-term memory for this workspace
- `workspaces/{name}/conversations/` - Archived conversations
- SQLite database (shared) - Recent messages for all workspaces

### Global Files

Shared across all workspaces:

- `workspaces/templates/MEMORY.tpl.md` - Template for new workspaces
- `workspaces/global/dna/AGENTS.md` - Global instructions

## How It Works

### Session Start

1. Agent loads `MEMORY.md` (if exists)
2. Agent queries SQLite for last 50 messages
3. Both are injected into system context
4. Agent has full memory of user and recent conversations

### During Conversation

- New messages stored in SQLite immediately
- Agent can query SQLite for older messages if needed
- Agent updates MEMORY.md when learning important facts

### Periodic Archiving

- Every 10 queries, conversation is archived to `conversations/`
- Archives are markdown files with timestamps
- Not loaded automatically (for reference only)

## Usage

### For Users

**No action needed!** The system works automatically.

You can:
- Edit `MEMORY.md` manually to add/remove information
- Check `conversations/` to review past discussions
- Query SQLite directly for advanced searches

### For the Agent

**Automatic**:
- MEMORY.md and recent messages are auto-loaded
- You have full context at session start

**Manual**:
- Update MEMORY.md when learning important facts
- Use SQL queries for searching older messages
- Archive conversations are available if needed

## Configuration

### Adjust Number of Recent Messages

Edit `container/agent-runner/src/index.ts`:

```typescript
// Default: 10 messages (optimized for OpenCode sessions)
// OpenCode sessions maintain full conversation memory automatically
// These messages serve only as initial context for new sessions
LIMIT 10

// If you need more context for new sessions:
LIMIT 20  // or 30
```

**Note**: Increasing this number won't improve context for existing sessions, as OpenCode already remembers everything. It only affects new sessions after crashes or restarts.

### Disable MEMORY.md Loading

Edit `container/agent-runner/src/index.ts`:

```typescript
// Comment out this section
if (containerInput.isMain) {
  const memoryPath = path.join(groupDir, 'MEMORY.md');
  // ...
}
```

## Troubleshooting

### Agent doesn't remember conversations

1. Check if MEMORY.md exists: `workspaces/main/dna/MEMORY.md`
2. Check SQLite has messages: `sqlite3 store/messages.db "SELECT COUNT(*) FROM messages;"`
3. Check agent logs for "Loaded MEMORY.md" and "Loaded X recent messages"

### MEMORY.md is too large

1. Review and remove outdated information
2. Move detailed info to separate files
3. Keep MEMORY.md under 500 lines

### Need to search old conversations

Use SQL:

```sql
sqlite3 store/messages.db "
  SELECT sender_name, content, timestamp 
  FROM messages 
  WHERE content LIKE '%search term%' 
  ORDER BY timestamp DESC 
  LIMIT 20;
"
```

Or check archived conversations in `workspaces/main/conversations/`.

## Folder Structure

Each workspace follows this structure:

```
workspaces/{name}/
├── dna/           ← Personality files (AGENTS.md, IDENTITY.md, MEMORY.md, SOUL.md, TOOLS.md, USER.md, GUIDELINES.md)
├── workspace/     ← Agent-generated content
│   ├── screenshots/
│   ├── reports/
│   ├── tasks/
│   └── downloads/
├── uploads/       ← User-uploaded files
├── logs/          ← Execution logs
└── conversations/ ← Conversation archives
```

## Future Enhancements

### When to Add RAG/Vector DB

Consider when:
- You have 1000+ archived conversations
- Need semantic search ("that time we discussed X")
- MEMORY.md becomes unmanageable (>1000 lines)

### When to Add FTS5

Consider when:
- Need fast keyword search across all messages
- Want to search by date ranges
- Need to find specific technical terms

## Technical Details

### Database Schema

```sql
CREATE TABLE messages (
  id TEXT,
  chat_jid TEXT,
  sender TEXT,
  sender_name TEXT,
  content TEXT,
  timestamp TEXT,
  is_from_me INTEGER,
  is_bot_message INTEGER DEFAULT 0,
  PRIMARY KEY (id, chat_jid)
);
```

### Context Injection

System context includes:
1. Global AGENTS.md (if not main group)
2. MEMORY.md (if exists)
3. Recent messages from SQLite
4. Runtime environment info

Total context size: ~5-10K tokens

## References

- Implementation: `container/agent-runner/src/index.ts`
- Database functions: `src/db.ts`
- Documentation: `workspaces/main/dna/AGENTS.md`
- Architecture decision: `workspaces/main/workspace/decisions.md`

---

*Last updated: 2026-02-18*
