A file must never exceed 600 lines of code. If this is the case, make a refactor and split the file.

## Operating System

**IMPORTANT: This project runs on Windows 11**

- Platform: Windows (win32)
- Shell: bash (Git Bash or similar)
- User: Gino (LENOVO)
- Container: Apple Container (not Docker)

### Windows-Specific Commands

When suggesting commands or scripts:
- Use PowerShell or bash (Git Bash) syntax
- DO NOT use macOS-specific commands like `launchctl`
- DO NOT use Linux-specific commands that don't work on Windows
- Use Windows paths: `C:\Users\LENOVO\...` or relative paths
- For process management, use Task Manager or PowerShell commands

### Service Management on Windows

EureClaw runs as a manual process on Windows (not a system service):
- Start: `bun start` in the project directory
- Stop: Ctrl+C in the terminal or close the terminal window
- Restart: Stop the process and run `bun start` again

### Container Commands

Apple Container is used (not Docker):
- Build: `./container/build.sh`
- Run: `container run ...` (not `docker run`)
- List: `container ps` (not `docker ps`)

## Package Manager

Always use `bun` instead of `npm` for all commands:
- `bun install` (not `npm install`)
- `bun run dev` (not `npm run dev`)
- `bun run build` (not `npm run build`)
- `bun add <package>` (not `npm install <package>`)

- Alway do the build `bun run build` for me, do not ask me to do it. this way you can see yourself if there's an error.
- Let me do the `bun run dev` or `bun start` because you have the tendency to do multiple of these and you open to many server or process.

• Always use Context Master MCP when I need
Library/API documentation, code generation,
setup or configuration steps without me having
to explicitly ask.

## Web Search When Uncertain

When you don't know something or are uncertain about information:
- Use web search tools proactively to find accurate, current information
- Don't guess or make assumptions when you can verify
- Search for documentation, specifications, or authoritative sources
- Example: If asked "what is X?" and you're not certain, search the web first

## EureClaw Documentation Reference

**Complete Project Documentation:** `workspaces/global/dna/DOCUMENTATION.md`

**SDK & Tools Reference:** `Project-Docs-Ressources-Helps/`
This folder contains important reference documentation:
- `opencode-sdk.md` - OpenCode TypeScript SDK API reference
- `eureclaw-complete-documentation.md` - Full EureClaw documentation
- `Project-tools&links.md` - Tools and useful links
- `some-command-line.md` - Command line references

Consult these files when working with OpenCode SDK, project tooling, or EureClaw internals.

## EureClaw MCP Server

**IMPORTANT:** EureClaw already has a built-in MCP server at `container/agent-runner/src/ipc-mcp-stdio.ts`

When adding new tools for EureClaw:
1. **DO NOT create a new MCP server** - add tools to the existing `ipc-mcp-stdio.ts`
2. Add the tool using `server.tool()` in that file
3. Run `bun run build` to compile
4. Update `workspaces/global/dna/TOOLS.md` with usage documentation

See `docs/MCP-ARCHITECTURE.md` for detailed guide on adding tools.

Existing tools include:
- `send_message` - Send messages to users
- `schedule_task`, `list_tasks`, `pause_task`, `resume_task`, `cancel_task` - Task scheduling
- `register_workspace` - Register new WhatsApp/Telegram workspaces
- `show_opencode_stats` - Usage statistics
- `send_image` - Send images/files
- `list_logs`, `read_log` - Read execution logs (for debugging)
- `create_downloadable_file`, `list_downloadable_files` - File downloads

When users ask questions about EureClaw architecture, features, or how things work:
- Consult `workspaces/global/dna/DOCUMENTATION.md` first
- This file contains comprehensive documentation covering:
  - Architecture and data flows
  - All components and their responsibilities
  - Memory systems and workspace management
  - Security and isolation model
  - Configuration and customization
  - Development and debugging guides
  - Comparison with OpenClaw (Le dossier .openclaw est juste comme référence de agent OpenCLaw (Competiteur de mon projet) et ne fait pas partie de ce projet Eureclaw)

Use this as your primary reference for answering EureClaw-related questions.

## Workspace Folder Structure

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

- **dna/**: Core personality and memory files (never mix with generated content)
- **workspace/**: All agent-generated files go here
- **uploads/**: Files uploaded by users
- **logs/**: Execution logs for debugging
- **conversations/**: Archived conversation history

## Project Organization & Note-Taking

### Where to Put Ideas and Notes

When the user asks you to "take note" or "remember this for later", use the appropriate location:

**IMPORTANT: `workspaces/` is for EureClaw (Andy via Telegram), NOT for development notes!**

**For development notes (Gino + Kiro):**
- Location: `dev-notes/` folder
- Files:
  - `ideas.md` - Feature ideas, improvements, future enhancements
  - `bugs.md` - Known bugs, issues to investigate, workarounds
  - `decisions.md` - Technical decisions, why we chose X over Y
  - `todo.md` - Actionable tasks, things to do
  - `preferences.md` - User preferences and personal info
- These files are ignored by EureClaw (not in workspaces/)
- Format: Markdown with clear sections and dates

### Note-Taking Best Practices

1. **Always add a date** - Use format: (YYYY-MM-DD) or (Month DD, YYYY)
2. **Use clear section headers** - Makes it easy to find later
3. **Be specific** - Include context, not just "fix the thing"
4. **Link related items** - Reference other files or sections when relevant
5. **Keep it organized** - Group related ideas together

### Example Note Structure

```markdown
## Feature Name (2026-02-18)

### Problem
Clear description of the problem or need

### Proposed Solution
How to solve it

### Implementation Details
- Step 1
- Step 2
- Step 3

### Benefits
Why this is valuable

### Considerations
Potential issues or things to think about

### Next Steps
What to do next
```

### When User Says...

- "Remember this" → Add to appropriate file with context
- "Take note" → Add to ideas.md or relevant file
- "TODO" → Add to todo.md with checkbox
- "Bug" → Add to bugs.md with details
- "We decided to..." → Add to decisions.md

### Avoid

- Scattered notes in random files
- Notes without dates
- Vague descriptions ("fix the bug")
- Duplicate information across files
- Notes in code comments that should be in docs


## Git & GitHub

**RÈGLE ABSOLUE:**
- Ne JAMAIS faire `git checkout` vers une autre branche sans que Gino le demande explicitement
- Pour un backup GitHub: commit + push depuis la branche courante, point final. Ne pas switcher de branche.
- `git checkout` change les fichiers sur le disque — ça casse le travail en cours
- Gino préfère travailler sur main et commit quand il est prêt
- Si on crée une branche backup, rester dessus après le push
