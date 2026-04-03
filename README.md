<center>
  <img src="assets/eureclaw-logo.png" alt="EureClaw" width="340">
</center>

<p align="center">
  My personal OpenCode assistant that runs securely in containers. Lightweight and built to be understood and customized for your own needs.
</p>
<p align="center">
  <a href="README_zh.md"> </a>
  <a href="https://discord.gg/VGWXrf8x"><img src="https://img.shields.io/discord/1470188214710046894?label=Discord&logo=discord&v=2" alt="Discord" valign="middle"></a>&nbsp; • &nbsp;
  <a href="repo-tokens"><img src="repo-tokens/badge.svg" alt="34.9k tokens, 17% of context window" valign="middle"></a>
</p>

## How It Works

EureClaw is a partnership between two components:

**OpenCode** handles the AI heavy lifting:
- LLM inference and reasoning
- Web search and content fetching
- File operations and code execution
- Agent orchestration and swarms
- Audio transcription (via Groq Whisper)

**EureClaw** handles everything else:
- **Security** - Container isolation, filesystem sandboxing
- **Process management** - Message queues, task scheduling
- **Channel connectivity** - WhatsApp, Telegram integration
- **State persistence** - SQLite database, workspace memory
- **User registration** - Auto-discovery of new chats

Think of EureClaw as the secure shell that lets OpenCode safely interact with your digital life.

## Powered By

EureClaw is built on top of:
- **[OpenCode](https://opencode.ai)** - AI coding agent with unified model gateway
- **[OpenCode SDK](https://github.com/anomalyco/opencode-sdk-js)** - TypeScript SDK for programmatic agent control
- **OpenCode Model Gateway** - Unified access to multiple AI providers through a single API

OpenCode provides the AI infrastructure (LLM routing, web search, file operations) while EureClaw adds security, multi-channel support, and state management.

## 100% Free Option

EureClaw can run completely free with the default configuration if you choose to do so. 

OpenCode offers several free models that rotate regularly. Run `opencode auth login` to see the current free options.

**Free features:**
- **Web search and fetch** - Built-in, no API key needed
- **Audio-to-text** - Free with a Groq Whisper API key (also free)

### Real-World Usage Example

Here's a actual usage an pricing from a EureClaw user over 5 days:

```
User: "what's my OpenCode usage?"

EureClaw: "So cool! Here is your OpenCode usage:

| Stats | Value |
|-------|-------|
| Sessions | 35 |
| Messages | 1,313 |
| Days | 5 |
| Total cost | $0.02 |
| Input tokens | 7.1M |
| Output tokens | 108K |

Tool usage:
- bash: 127 (39%)
- read: 86 (27%)
- websearch: 23 (7%)
- edit: 20 (6%)
- glob: 20 (6%)

That's cheap — only 2 cents for 5 days! 🎉"
```

**35 sessions, 1,313 messages, 7.1M tokens processed — for $0.02.** OpenCode's caching system makes this incredibly cost-effective.

To check your own usage, just ask your assistant: "what's my OpenCode usage?"

## Adding a Multimodal Model (Optional)

OpenCode free models are typically text-only. If you want to send images, videos, or documents to your bot, you'll need to add a multimodal model (like Google Gemini or similar).

**Setup:**
1. Configure an API key via `opencode auth login` or as a system environment variable
2. Update `models-config.json` with your chosen multimodal model as `small_model`
3. Restart EureClaw

**Note:** API keys are managed by OpenCode (via `opencode auth login` or system environment variables), not in EureClaw's `.env` file. The `.env` file is only for EureClaw-specific settings like `TELEGRAM_BOT_TOKEN` and `ASSISTANT_NAME`.

**Setup guides:**
- [API Keys Configuration](docs/API-KEYS-SETUP.md) - How to configure API keys (all providers)
- [Model Configuration](docs/MODEL-CONFIGURATION.md) - All available models

## Why I Built This

  <img src="assets/eureclaw-GIF.gif" alt="Eureclaw">
  
[OpenClaw](https://github.com/openclaw/openclaw) is an impressive project with a great vision. But I can't sleep well running software I don't understand with access to my life. OpenClaw has 52+ modules, 8 config management files, 45+ dependencies, and abstractions for 15 channel providers. Security is application-level (allowlists, pairing codes) rather than OS isolation. Everything runs in one Node process with shared memory.

EureClaw gives you the same core functionality in a codebase you can understand in 8 minutes. One process. A handful of files. Agents run in actual Linux containers with filesystem isolation, not behind permission checks.

## Quick Start

```bash
git clone https://github.com/gavrielc/eureclaw.git
cd eureclaw
opencode
```

Then run `/setup`. OpenCode handles everything: dependencies, authentication, container setup, service configuration.

**Windows Users:** See the [Windows Setup Guide](docs/WINDOWS-SETUP.md) for platform-specific instructions. You'll need to install OpenCode manually: `npm install -g opencode-ai`

**Auto-Registration**: After setup, just send your first message to the bot on any channel (WhatsApp, Telegram). That chat will automatically be registered as your 'main' workspace—no manual JID entry or configuration scripts needed. The bot responds immediately.

## Philosophy

**Small enough to understand.** One process, a few source files. No microservices, no message queues, no abstraction layers. Have OpenCode walk you through it.

**Secure by isolation.** Agents run in Linux containers (Apple Container on macOS, or Docker). They can only see what's explicitly mounted. Bash access is safe because commands run inside the container, not on your host.

**Built for one user.** This isn't a framework. It's working software that fits my exact needs. You fork it and have OpenCode make it match your exact needs.

**Customization = code changes.** No configuration sprawl. Want different behavior? Modify the code. The codebase is small enough that this is safe.

**AI-native.** No installation wizard; OpenCode guides setup. No monitoring dashboard; ask OpenCode what's happening. No debugging tools; describe the problem, OpenCode fixes it.

**Skills over features.** Contributors shouldn't add features (e.g. support for Telegram) to the codebase. Instead, they contribute OpenCode skills like `/add-telegram` that transform your fork. You end up with clean code that does exactly what you need.

**Best harness, best model.** This runs on OpenCode SDK, which provides a powerful agent execution environment. The harness matters. A bad harness makes even smart models seem dumb, a good harness gives them superpowers. OpenCode SDK is designed to give agents the tools and context they need to be effective.

## What It Supports

- **WhatsApp I/O** - Message OpenCode from your phone
- **Isolated workspace context** - Each workspace has its own `AGENTS.md` memory, isolated filesystem, and runs in its own container sandbox with only that filesystem mounted
- **Main channel** - Your private channel (self-chat) for admin control; every other workspace is completely isolated
- **Scheduled tasks** - Recurring jobs that run OpenCode and can message you back
- **Web access** - Search and fetch content
- **Container isolation** - Agents sandboxed in Apple Container (macOS) or Docker (macOS/Linux)
- **Agent Swarms** - Spin up teams of specialized agents that collaborate on complex tasks
- **Optional integrations** - Add Gmail (`/add-gmail`) and more via skills

## Setup and Registration

### First-Time Setup

1. Run `/setup` in OpenCode to configure dependencies, authentication, and containers
2. Add your channel credentials to `.env`:
   - For WhatsApp: Authentication happens automatically on first run
   - For Telegram: Add `TELEGRAM_BOT_TOKEN` from @BotFather
3. Start EureClaw: `npm start` (automatically checks and installs OpenCode if needed)
4. Send your first message to the bot on any channel

**That's it.** Your first message automatically registers that chat as your 'main' workspace. No manual JID entry, no configuration scripts. The bot responds immediately and you're ready to go.

**Note:** The `npm start` command now automatically:
- Checks if npm is installed
- Checks if OpenCode is installed (installs via npm if missing)
- Checks if OpenCode server is running (starts it if not)
- Runs the auto-setup script
- Starts EureClaw

If you prefer to manage OpenCode manually, use `npm run start:simple` instead.

### How Auto-Registration Works

- The first chat to send a message becomes your 'main' workspace
- Works with private chats (DMs) or group chats
- Creates the necessary folder structure (`workspaces/main/`) automatically
- Sets up memory files (`AGENTS.md`) for context persistence
- Main workspace doesn't require trigger words (messages are processed directly)

### Manual Registration (Optional)

For advanced users who want to register additional workspaces or have specific setup needs, manual registration is still available:

- Use the `register-chat.js` script with a specific JID
- Send IPC commands for programmatic registration
- See existing documentation for manual registration workflows

The auto-registration feature is designed for simplicity, but all manual controls remain available for power users.

## Usage

Talk to your assistant with the trigger word (default: `@Andy`):

```
@Andy send an overview of the sales pipeline every weekday morning at 9am (has access to my Obsidian vault folder)
@Andy review the git history for the past week each Friday and update the README if there's drift
@Andy every Monday at 8am, compile news on AI developments from Hacker News and TechCrunch and message me a briefing
```

From the main channel (your self-chat), you can manage workspaces and tasks:
```
@Andy list all scheduled tasks across workspaces
@Andy pause the Monday briefing task
@Andy join the Family Chat workspace
```

### Slash Commands

EureClaw supports universal slash commands that work across all channels (WhatsApp, Telegram, future Web UI):

**System Control:**
- `/restart` - Restart EureClaw (auto-restarts with `bun start`)
- `/status` - Check if bot is awake or sleeping
- `/help` - Show all available commands

**Sleep Mode** (pause all activity):
- `/sleep` - Sleep indefinitely (until `/awake`)
- `/sleep 4h` - Sleep for 4 hours (auto-wake)
- `/sleep 30m` - Sleep for 30 minutes
- `/sleep 2d` - Sleep for 2 days
- `/awake` - Wake from sleep mode

**Examples:**
```
/sleep 8h          # Night mode - bot sleeps for 8 hours
/status            # Check if sleeping or awake
/awake             # Wake up early
/restart           # Restart the bot
```

**Sleep mode pauses:**
- All message processing (bot ignores messages)
- Scheduled tasks and crons
- Only slash commands work during sleep

**Use cases:**
- Night mode: `/sleep 8h` before bed
- Vacation: `/sleep 7d` when away
- Maintenance: `/sleep` while fixing issues

See [docs/COMMANDS.md](docs/COMMANDS.md) for complete documentation.

## Customizing

There are no configuration files to learn. Just tell OpenCode what you want:

- "Change the trigger word to @Bob"
- "Remember in the future to make responses shorter and more direct"
- "Add a custom greeting when I say good morning"
- "Store conversation summaries weekly"

Or run `/customize` for guided changes.

The codebase is small enough that OpenCode can safely modify it.

## Contributing

**Don't add features. Add skills.**

If you want to add Telegram support, don't create a PR that adds Telegram alongside WhatsApp. Instead, contribute a skill file (`.opencode/skills/add-telegram/SKILL.md`) that teaches OpenCode how to transform a EureClaw installation to use Telegram.

Users then run `/add-telegram` on their fork and get clean code that does exactly what they need, not a bloated system trying to support every use case.

### Adding a New Channel

EureClaw uses a self-registration pattern for channels. Each channel module registers itself at import time, and the startup loop connects all available channels automatically. To add a new channel (e.g. Discord, Slack):

1. Create `src/channels/discord.ts` implementing the `Channel` interface
2. Call `registerChannel('discord', factory)` at the top level — the factory returns `null` when credentials are missing
3. Add `import './discord.js'` to `src/channels/index.ts`

That's it. No changes to `startup.ts` or any other file. The registry handles the rest.

### RFS (Request for Skills)

Skills we'd love to see:

**Communication Channels**
- `/add-telegram` - Add Telegram as channel. Should give the user option to replace WhatsApp or add as additional channel. Also should be possible to add it as a control channel (where it can trigger actions) or just a channel that can be used in actions triggered elsewhere
- `/add-slack` - Add Slack
- `/add-discord` - Add Discord

**Platform Support**
- `/setup-windows` - Windows via WSL2 + Docker

**Session Management**
- `/add-clear` - Add a `/clear` command that compacts the conversation (summarizes context while preserving critical information in the same session). Requires figuring out how to trigger compaction programmatically via the OpenCode SDK.

## Requirements

- macOS or Linux
- Node.js 20+
- [OpenCode](https://opencode.ai/download)
- [Apple Container](https://github.com/apple/container) (macOS) or [Docker](https://docker.com/products/docker-desktop) (macOS/Linux)

**Note on OpenCode:** EureClaw uses the OpenCode SDK for agent execution. The `npm start` command automatically installs and starts OpenCode if it's not already running. You can also install it manually:

```bash
# Via npm (recommended)
npm install -g opencode-ai

# Via curl
curl -fsSL https://opencode.ai/install | bash

# Via Homebrew (macOS/Linux)
brew install anomalyco/tap/opencode
```

After installation, configure your AI provider credentials:
```bash
opencode auth login
```

## Architecture

```
WhatsApp/Telegram --> SQLite --> Polling loop --> Container (OpenCode SDK) --> Response
```

Single Node.js process. Agents execute in isolated Linux containers with mounted directories. Per-group message queue with concurrency control. IPC via filesystem for task scheduling and inter-agent communication.

Key files:
- `src/index.ts` - Main orchestrator: state management, message loop, agent invocation
- `src/channels/registry.ts` - Channel registry (self-registration at startup)
- `src/channels/whatsapp.ts` - WhatsApp channel implementation
- `src/channels/telegram.ts` - Telegram channel implementation (optional)
- `src/ipc.ts` - IPC watcher and task processing
- `src/router.ts` - Message formatting and outbound routing
- `src/workspace-queue.ts` - Per-workspace queue with global concurrency limit
- `src/container-runner.ts` - Spawns streaming agent containers with OpenCode SDK
- `src/task-scheduler.ts` - Runs scheduled tasks
- `src/db.ts` - SQLite operations (messages, workspaces, sessions, state)
- `workspaces/*/memory/AGENTS.md` - Per-workspace memory and context
- `workspaces/*/workspace/` - Agent-generated content (screenshots, reports, downloads)

## Environment Variables

EureClaw supports the following environment variables:

- `ASSISTANT_NAME` - Name of your assistant (default: Andy)
- `TELEGRAM_ONLY` - Set to `true` to use Telegram only (disable WhatsApp)
- `TELEGRAM_BOT_TOKEN` - Telegram bot token (get from @BotFather)
- `OPENCODE_BASE_URL` - Optional: Custom OpenCode API endpoint (defaults to local instance)
- `LOG_LEVEL` - Logging verbosity: `debug`, `info`, `warn`, `error` (default: info)

**Note on AI Provider API Keys:**
EureClaw uses OpenCode SDK which reads AI provider credentials from your system configuration. You must have OpenCode configured before running EureClaw:

```bash
# Configure AI providers (one-time setup)
opencode auth login

# This will prompt you to add API keys for providers like:
# - Anthropic (Claude/OpenAI/etc)
# - Google (Gemini)
# - OpenAI (GPT)
# - Groq (Llama)
```

**Note on Chat Registration:**
After configuring your environment and starting EureClaw, simply send your first message to the bot. That chat will automatically be registered as your 'main' workspace—no manual JID entry required.

See `.env.example` for a template configuration file.

## FAQ

**Why WhatsApp and not Telegram/Signal/etc?**

Because I use WhatsApp. Fork it and run a skill to change it. That's the whole point.

**Why Apple Container instead of Docker?**

On macOS, Apple Container is lightweight, fast, and optimized for Apple silicon. But Docker is also fully supported—during `/setup`, you can choose which runtime to use. On Linux, Docker is used automatically.

**Can I run this on Linux?**

Yes. Run `/setup` and it will automatically configure Docker as the container runtime. Thanks to [@dotsetgreg](https://github.com/dotsetgreg) for contributing the `/convert-to-docker` skill.

**Is this secure?**

Agents run in containers, not behind application-level permission checks. They can only access explicitly mounted directories. You should still review what you're running, but the codebase is small enough that you actually can. See [docs/SECURITY.md](docs/SECURITY.md) for the full security model.

**Why no configuration files?**

We don't want configuration sprawl. Every user should customize it to so that the code matches exactly what they want rather than configuring a generic system. If you like having config files, tell OpenCode to add them.

**How do I debug issues?**

Ask OpenCode. "Why isn't the scheduler running?" "What's in the recent logs?" "Why did this message not get a response?" That's the AI-native approach.

**Why isn't the setup working for me?**

I don't know. Run `opencode`, then run `/debug`. If OpenCode finds an issue that is likely affecting other users, open a PR to modify the setup SKILL.md.

**What changes will be accepted into the codebase?**

Security fixes, bug fixes, and clear improvements to the base configuration. That's it.

Everything else (new capabilities, OS compatibility, hardware support, enhancements) should be contributed as skills.

This keeps the base system minimal and lets every user customize their installation without inheriting features they don't want.

## Community

Questions? Ideas? [Join the Discord](https://discord.gg/VGWXrf8x).

## License

MIT
