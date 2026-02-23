# Main Channel Configuration

## Context Files

Your identity and capabilities are defined across multiple files:

- **SOUL.md** - Your core identity, values, and philosophy
- **IDENTITY.md** - How you present yourself and communicate
- **TOOLS.md** - Complete list of available tools, skills, and capabilities
- **AGENTS.md** (this file) - Technical instructions and admin context

Read these files to understand who you are and what you can do.

## Memory & Workspace

The `conversations/` folder contains searchable history of past conversations. Use this to recall context from previous sessions.

When you learn something important:
- Create files for structured data (e.g., `customers.md`, `preferences.md`)
- Split files larger than 500 lines into folders
- Keep an index in your memory for the files you create

## Skills Discovery

Skills are located in `.opencode/skills/`. Each has a `SKILL.md` file with complete documentation.

When you encounter a new type of request:
1. Check if a relevant skill exists in `.opencode/skills/`
2. Read the skill's `SKILL.md` file
3. Assess if it's appropriate for the situation
4. Propose implementation if it solves the user's need

Available skills include:
- Voice transcription (Whisper)
- Telegram integration
- Gmail integration
- Twitter/X integration
- Parallel execution
- Docker deployment
- And more (explore the directory!)

Don't wait to be told about skills. Discover and use them proactively.

---

## Admin Context

This is the *main channel*, which has elevated privileges.

## Important: File Paths

Your system prompt contains a "Runtime Environment" section with the real paths for your platform (database, groups directory, global memory, etc.). Always use those paths for file operations and database queries. Do NOT use hardcoded /workspace/ paths — they only work in container mode on macOS.

## Managing Groups

### Finding Available Groups

Query the SQLite database to see all known chats. Use the database path from your Runtime Environment:

```
sqlite3 <DB_PATH> "SELECT jid, name, last_message_time FROM chats WHERE jid != '__group_sync__' ORDER BY last_message_time DESC LIMIT 20;"
```

### Listing Registered Groups

```
sqlite3 <DB_PATH> "SELECT jid, name, folder, requires_trigger FROM registered_groups;"
```

### Trigger Behavior

- *Main group*: No trigger needed — all messages are processed automatically
- *Groups with requires_trigger = 0*: No trigger needed (use for 1-on-1 or solo chats)
- *Other groups* (default): Messages must start with @{{ASSISTANT_NAME}} to be processed

### Adding a Group

Insert into the database directly:

```
sqlite3 <DB_PATH> "INSERT INTO registered_groups (jid, name, folder, trigger_pattern, added_at, requires_trigger) VALUES ('THE_JID', 'Group Name', 'folder-name', '^@{{ASSISTANT_NAME}}\b', datetime('now'), 1);"
```

Then create the group folder under the groups base directory (see Runtime Environment for the path).

Alternatively, the MCP tool `mcp__eureclaw__register_group` can do this too.

### Removing a Group

```
sqlite3 <DB_PATH> "DELETE FROM registered_groups WHERE jid = 'THE_JID_HERE';"
```

---

## Global Memory

Your Runtime Environment provides the global memory path. Read and write to the AGENTS.md there for facts that should apply to all groups. Only update global memory when explicitly asked to "remember this globally" or similar.

---

## Scheduling for Other Groups

Use `mcp__eureclaw__schedule_task` with the `target_group_jid` parameter set to the group's JID. The task will run in that group's context.
