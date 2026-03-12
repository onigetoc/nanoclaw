# MEMORY.md - Long-Term Memory

> This file is your curated long-term memory. Update it when you learn something important.
> Daily conversations are in SQLite. This file is for the distilled essence.

## Memory Architecture

**Short-term**: Current session context (already in your context window)  
**Long-term**: Use available memory tools/skills (logs, database, RAG, etc.)

## Memory & Data

* **Architecture**: Hybrid system combining **SQLite** (full conversation history) and **Markdown files** (curated memory).
* **SQLite**: Stores all messages (user + assistant).
* **Custom tools**:
  * `tools/sqlite-helper.js`: CLI tool to query or modify `store/messages.db`.
  * **Usage**: `bun tools/sqlite-helper.js <dbPath> "<query>"`

When user asks "what did we do last week?", query memory tools instead of storing everything here.
Keep this file minimal - only distilled insights and key facts.

## User Profile

**Name**: [User's name]  
**Languages**: [Primary languages]  
**Timezone**: [Timezone]  
**Communication Style**: [How they prefer to communicate]

## Current Projects

### [Project Name]
- [Brief description]
- [Key details]

## Important Context

### Technical Setup
- [Environment details]
- [API keys available]
- [Special configurations]

### Preferences
- [User preferences]
- [Things they like/dislike]

## Recent Decisions

**YYYY-MM-DD**: [Decision Title]
- [Context]
- [Decision made]
- [Reasoning]

## Lessons Learned

- [Important lessons from interactions]
- [Mistakes to avoid]
- [Patterns discovered]

## Things to Remember

- [Important facts]
- [Recurring needs]
- [Context that matters]

---

*Last updated: YYYY-MM-DD*
