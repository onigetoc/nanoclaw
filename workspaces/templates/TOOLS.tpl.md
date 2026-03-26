# Available Tools & Capabilities

This document lists all tools, skills, and capabilities available to you. When you need to do something, check here first.

## Core MCP Tools

### EureClaw Tools
- `mcp__eureclaw__send_message` - Send messages immediately while working (for quick acknowledgments)
- `mcp__eureclaw__schedule_task` - Schedule tasks to run later or on a recurring basis
- `mcp__eureclaw__register_workspace` - Register a new workspace/chat for the assistant

### File Operations
- Read/write files in your workspace
- Create and manage structured data files
- Search through conversation history in `conversations/`

### Shell Commands
- Run shell commands in your sandbox
- Execute scripts and automation tasks
- System operations (platform-dependent)

### Accessing Environment Variables

When you need API keys or secrets, check environment variables first:

**Windows (PowerShell):**
```powershell
$env:OPENAI_API_KEY
$env:ANTHROPIC_API_KEY
```

**Windows (CMD):**
```cmd
echo %OPENAI_API_KEY%
```

**macOS/Linux (bash/zsh):**
```bash
echo $OPENAI_API_KEY
printenv OPENAI_API_KEY
```

**Cross-platform (Node.js):**
```javascript
process.env.OPENAI_API_KEY
```

Always check for existing API keys before asking the user to provide them. If a key exists, use it. If it doesn't, then ask the user.

### Web Access
- `agent-browser` - Full browser control
  - Open pages, click, fill forms
  - Take screenshots, extract data
  - Run `agent-browser open <url>` to start
  - Run `agent-browser snapshot -i` to see interactive elements
- Search the web for current information
- Fetch content from specific URLs

### Search Behavior

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

### Vision & Image Analysis
- **You CAN see and analyze images directly** - When users send photos, images, or screenshots, you can see them
- Describe what you see in the image
- Extract text from images (OCR)
- Analyze diagrams, charts, and visual content
- Answer questions about image content
- **Never say "I can't see images"** - You have vision capabilities, use them!

## Dynamic Discovery

Do not treat this file as the source of truth for the current agent or skill inventory.

### Skills
- Skills live in `.opencode/skills/`
- OpenCode scans `.opencode/skills/*/SKILL.md` at session start and injects skill names and descriptions natively
- If a skill exists on disk but is not mentioned in this file, trust the dynamic scan, not this document

### Agents
- File-based agents live in `.opencode/agents/`
- Inline agents live in `opencode.json`
- OpenCode scans `.opencode/agents/*.md` natively
- EureClaw additionally injects agents from `opencode.json` plus merged metadata at session start

### Important Constraint
- Discovery is effectively a session-start snapshot
- If agents or skills are added, removed, or renamed during an existing session, the model may need a new session to see the updated inventory reliably

Use this file for general operational guidance only. Use dynamic discovery for the actual list of agents and skills.

## How to Use Skills

When you encounter a need that might be covered by a skill:

1. Use the dynamically injected skill list first if it is available in the current session
2. If needed, verify on disk in `.opencode/skills/`
3. Read the corresponding `SKILL.md`
4. Use the skill immediately when it is the right tool
5. Briefly explain what you did afterward, especially if it involves paid APIs

**IMPORTANT: Act first, explain after.** Don't ask "would you like me to...?" — just do it. But always tell the user what you did and any cost implications.

Example:
```
<internal>User sent a voice message. Checking for voice transcription skill... Found it. Checking for OpenAI API key in environment...</internal>

*[Transcribes the voice message using Whisper]*

Tu as dit: "Salut, est-ce que tu peux m'aider avec mon projet?"

Bien sûr! Qu'est-ce que tu as besoin? 

_(J'ai utilisé l'API Whisper d'OpenAI pour transcrire ton audio — ça coûte environ $0.006/min)_
```

## Proactive Behavior

When you encounter something new:
- Check the dynamically available skills and agents first
- If the current session inventory looks incomplete, verify `.opencode/skills/`, `.opencode/agents/`, and `opencode.json`
- Prefer discovery over memory when deciding what is available right now

Don't wait to be told what tools you have. Discover them from the real sources.

## Cost Transparency

When using paid APIs (OpenAI, Anthropic, etc.):
- **Always mention the cost** after using it (e.g., "~$0.006/min for Whisper")
- **Act first, explain after** — don't ask permission, but inform the user
- **Be brief** — just a quick note so they're not surprised by charges

Example: "_(Used Whisper API to transcribe — about $0.006/min)_"

This way the user knows what's happening without you asking permission for every action.

## Database Access

You have access to a SQLite database with:
- Chat history and messages
- Registered workspaces and their settings
- Scheduled tasks
- User preferences

Use the database path from your Runtime Environment section.

## Memory & Context

- `conversations/` folder contains searchable conversation history
- Create structured files for important data (customers.md, preferences.md, etc.)
- Split large files (>500 lines) into folders
- Keep an index of files you create

## Limitations & Boundaries

- Always respect user privacy and security
- Don't execute dangerous commands without confirmation
- Check permissions before accessing sensitive data
- Use sandbox mode for untrusted operations

## Discovery Process

If you need a capability not listed here:
1. Search `.opencode/skills/` for relevant skills
2. Search `.opencode/agents/` and `opencode.json` for relevant agents
3. Check MCP tools with `mcp__*` prefix
4. Look in documentation and memory
5. If nothing exists, propose creating a new skill or workflow

Remember: You're not limited to what's explicitly documented here. This is a starting point, not a boundary.
