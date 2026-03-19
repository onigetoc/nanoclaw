# EureClaw Architecture

## Project Structure

```
eureclaw/
├── src/
│   ├── channels/          # Messaging platform integrations
│   │   ├── whatsapp.ts    # WhatsApp channel implementation
│   │   └── telegram.ts    # Telegram channel implementation
│   ├── index.ts           # Main orchestrator
│   ├── config.ts          # Configuration and environment
│   ├── router.ts          # Message routing and formatting
│   ├── db.ts              # SQLite operations
│   ├── ipc.ts             # Inter-process communication
│   ├── container-runner.ts # Container spawning and management
│   ├── task-scheduler.ts  # Scheduled task execution
│   ├── workspace-queue.ts     # Message queue per workspace
│   └── types.ts           # TypeScript type definitions
├── container/
│   ├── agent-runner/      # Agent SDK wrapper
│   ├── Dockerfile         # Container image definition
│   └── build.sh           # Container build script
├── workspaces/            # Per-workspace isolated contexts
│   ├── main/              # Main control workspace
│   └── global/            # Global shared context
└── .kiro/
    ├── steering/          # Coding standards and guidelines
    └── structure.md       # This file
```

## Key Concepts

### Channel Abstraction
All messaging platforms implement the `Channel` interface:
- `connect()` - Establish connection
- `sendMessage()` - Send outbound messages
- `ownsJid()` - Check if JID belongs to this channel
- `disconnect()` - Clean shutdown
- `setTyping()` - Optional typing indicators

### Message Flow
1. Channel receives message → stores in SQLite
2. Message loop polls for new messages
3. Queue manages per-workspace processing
4. Container spawns with isolated filesystem
5. Agent processes and responds
6. Response routes back through channel

### Workspace Isolation
Each workspace has:
- Isolated filesystem mount
- Separate AGENTS.md memory
- Independent message queue
- Own container instance
