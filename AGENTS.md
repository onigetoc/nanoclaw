# EureClaw

Personal AI assistant. See [README.md](README.md) for philosophy and setup. See [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) for architecture decisions.

## Quick Context

EureClaw is a personal Opencode assistant that runs securely in containers. Single Node.js process connecting to messaging platforms (WhatsApp, Telegram), routing messages to Opencode SDK in isolated containers.

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Orchestrator: state, message loop, agent invocation |
| `src/channels/whatsapp.ts` | WhatsApp channel implementation |
| `src/channels/telegram.ts` | Telegram channel implementation |
| `src/ipc.ts` | IPC watcher and task processing |
| `src/router.ts` | Message formatting and outbound routing |
| `src/config.ts` | Configuration and environment variables |
| `src/container-runner.ts` | Spawns agent containers with mounts |
| `src/task-scheduler.ts` | Runs scheduled tasks |
| `src/db.ts` | SQLite operations |
| `groups/{name}/AGENTS.md` | Per-group memory (isolated) |

## Development Commands

```bash
./container/build.sh # Rebuild agent container
```

Service management (macOS):
```bash
launchctl load ~/Library/LaunchAgents/com.eureclaw.plist
launchctl unload ~/Library/LaunchAgents/com.eureclaw.plist
launchctl kickstart -k gui/$(id -u)/com.eureclaw
```

### Channel Abstraction
All messaging platforms implement the `Channel` interface defined in `src/types.ts`:
- `connect()` - Establish connection
- `sendMessage(jid, text)` - Send messages
- `ownsJid(jid)` - Check if JID belongs to this channel
- `disconnect()` - Clean shutdown
- `setTyping(jid, isTyping)` - Optional typing indicators

### JID Format
- WhatsApp groups: `120363336345536173@g.us`
- WhatsApp DM: `1234567890@s.whatsapp.net`
- Telegram: `tg:123456789` (private) or `tg:-1001234567890` (groups)

## Configuration Files

- `.env` - Environment variables (not committed)
- `.kiroignore` - Files to ignore (like .gitignore)
- `.kiro/steering/` - Coding standards and guidelines
- `.kiro/structure.md` - Architecture overview

## Container Build Cache

Apple Container's buildkit caches aggressively. To force clean rebuild:

```bash
container builder stop && container builder rm && container builder start
./container/build.sh
```

Verify: `container run -i --rm --entrypoint wc eureclaw-agent:latest -l /app/src/index.ts`
