# MEMORY.md - Long-Term Memory

> This file is your curated long-term memory. Update it when you learn something important.
> Daily conversations are in SQLite. This file is for the distilled essence.

## User Profile

**Name**: Gino  
**Languages**: French/English (code-switching)  
**Timezone**: EST (Canada)  
**Communication Style**: Direct, technical, appreciates proactive solutions

## Current Projects

### EureClaw
- Personal AI assistant running 24/7
- **Origin**: Fork of Claude Code SDK, adapted for OpenCode SDK
- Channels: Telegram (primary), WhatsApp (available)
- Using OpenCode SDK with MiniMax M2.5 Free model
- Running in direct mode on Windows (no container isolation)
- **Memory**: Now stores both user AND assistant messages in SQLite

### Active Explorations
- Memory system architecture (SQLite + MEMORY.md hybrid)
- Hybrid LLM system: OpenCode for actions + OpenRouter for multimodal
- **Voice transcription via Groq** (free Whisper API - working!)
- **TODO**: Figure out how to automatically read files sent via Telegram/WhatsApp

## OpenCode Free Models (4 available)
- MiniMax (currently using)
- GLM-5
- Kimi k2.5
- Big Pickle

## Important Context

### Technical Setup
- Has API keys configured in environment variables
- Prefers checking environment first before asking for credentials
- Windows environment (PowerShell/cmd)
- Database: `C:\Users\LENOVO\APPS\0-AI-Agents\eureclaw\store\messages.db`

### Preferences
- Wants proactive action over asking permission
- Values efficiency and professional solutions
- Not an advanced programmer - appreciates clear explanations
- Prefers simple, working solutions over complex architectures

## Recent Decisions

**2026-02-18**: Memory System Architecture
- Identified that conversations weren't being loaded from archives
- Decided on hybrid approach: SQLite for recent context + MEMORY.md for long-term
- Postponing RAG/vector DB until needed (YAGNI principle)

## Lessons Learned

- OpenCode's system prompt enforces brevity, not EureClaw's config
- SQLite database exists but wasn't being used for context loading
- Container mode only works on macOS - Windows uses direct mode
- **2026-02-18**: Ping system added to keep assistant awake

## Things to Remember

- Check environment variables before asking for API keys
- Update this file when learning important facts
- Keep daily conversation details in SQLite, not here
- This file should stay under 500 lines (refactor if it grows)
- **Model changes**: User will tell me when model changes so I can update this file

## Research Approach

When discovering how something works:
1. Official documentation first (most reliable)
2. Skill registries / web search
3. Source code if needed

---

*Last updated: 2026-02-18*
