# Available Tools & Capabilities

This document lists all tools, skills, and capabilities available to you. When you need to do something, check here first.

## Core MCP Tools

### NanoClaw Tools
- `mcp__nanoclaw__send_message` - Send messages immediately while working (for quick acknowledgments)
- `mcp__nanoclaw__schedule_task` - Schedule tasks to run later or on a recurring basis
- `mcp__nanoclaw__register_group` - Register a new group/chat for the assistant

### File Operations
- Read/write files in your workspace
- Create and manage structured data files
- Search through conversation history in `conversations/`

### Shell Commands
- Run shell commands in your sandbox
- Execute scripts and automation tasks
- System operations (platform-dependent)

### Web Access
- `agent-browser` - Full browser control
  - Open pages, click, fill forms
  - Take screenshots, extract data
  - Run `agent-browser open <url>` to start
  - Run `agent-browser snapshot -i` to see interactive elements
- Search the web for current information
- Fetch content from specific URLs

## Available Skills

Skills are located in `.opencode/skills/`. Each skill has a `SKILL.md` file with detailed instructions.

### Communication & Channels
- **add-telegram** - Add Telegram channel support to NanoClaw
- **add-telegram-swarm** - Multi-agent Telegram coordination
- **add-gmail** - Gmail integration for email management

### Voice & Media
- **add-voice-transcription** - Transcribe voice messages using OpenAI Whisper
  - Automatically handles WhatsApp/Telegram voice notes
  - Requires OpenAI API key
  - Cost: ~$0.006 per minute of audio

### Automation & Integration
- **add-parallel** - Enable parallel agent execution for faster processing
- **x-integration** - Twitter/X integration (post, reply, like, retweet, quote)

### Development & Deployment
- **convert-to-docker** - Containerize NanoClaw for deployment
- **setup** - Complete setup wizard for NanoClaw installation
- **debug** - Debugging tools and troubleshooting guides

### Customization
- **customize** - Customize NanoClaw behavior and appearance
- **skill-creator** - Create new skills for NanoClaw

## How to Use Skills

When you encounter a need that might be covered by a skill:

1. **Check if the skill exists**: Look in `.opencode/skills/` directory
2. **Read the SKILL.md**: Each skill has complete documentation
3. **Assess if it's appropriate**: Consider user needs and context
4. **Propose implementation**: Explain what the skill does and offer to set it up

Example:
```
<internal>User sent a voice message. Checking for voice transcription skill...</internal>

I see you sent a voice message! I have a skill available that can transcribe voice messages using OpenAI Whisper. 

Would you like me to set up voice transcription? It costs about $0.006 per minute of audio and requires an OpenAI API key.
```

## Proactive Behavior

When you encounter something new:
- **Voice message** → Check for `add-voice-transcription` skill
- **Email request** → Check for `add-gmail` skill  
- **Twitter/X mention** → Check for `x-integration` skill
- **Need for speed** → Consider `add-parallel` skill
- **Deployment question** → Check for `convert-to-docker` skill

Don't wait to be told what tools you have. Explore and discover!

## Database Access

You have access to a SQLite database with:
- Chat history and messages
- Registered groups and their settings
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
2. Check MCP tools with `mcp__*` prefix
3. Look in documentation and memory
4. If nothing exists, propose creating a new skill or workflow

Remember: You're not limited to what's explicitly documented here. This is a starting point, not a boundary.
