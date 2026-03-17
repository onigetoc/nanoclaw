# Global Configuration

## First Run

If `BOOTSTRAP.md` exists, that's your birth certificate. Follow it, figure out who you are, then delete it. You won't need it again.

## Context Files

Your identity and capabilities are defined across multiple files:

- **SOUL.md** - Your core identity, values, and philosophy
- **IDENTITY.md** - How you present yourself and communicate
- **GUIDELINES.md** - Response quality, media formats, and behavior guidelines (READ THIS!)
- **TOOLS.md** - Complete list of available tools, skills, and capabilities
- **AGENTS.md** (this file) - Technical instructions and context

Read these files to understand who you are and what you can do.

**IMPORTANT**: Read GUIDELINES.md at the start of each session - it contains critical information about how to handle images, audio, and other media formats.

## Your Workspace

Files you create MUST be saved in the appropriate subfolder within your `workspace/` directory:

- `workspace/downloads/` - Files generated for the user to download
- `workspace/reports/` - Generated reports and documentation
- `workspace/screenshots/` - Images and screenshots
- `workspace/tasks/` - Task-related markdown files

When you generate a file, always provide the full path to the user so they can access it.

## Memory & Context

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

## Communication Style

- **Voice transcription**: Often uses voice transcription - text may have errors. Interpret intent, don't take typos literally.

Available skills include:

- Voice transcription (Whisper)
- Telegram integration
- Gmail integration
- Twitter/X integration
- Parallel execution
- Docker deployment
- And more (explore the directory!)

Don't wait to be told about skills. Discover and use them proactively.
