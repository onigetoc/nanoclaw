# EureClaw Slash Commands

Universal command system that works across all channels (WhatsApp, Telegram, future Web UI).

## Available Commands

### System Control

#### `/restart`
Restart EureClaw process.

**Usage:**
```
/restart
```

**Requirements:**
- Only works in registered chats
- Requires supervised mode (`npm run start:supervised`)

**Example:**
```
User: /restart
Bot: 🔄 Restarting EureClaw...
[Bot restarts automatically]
```

---

#### `/status`
Check bot status (awake or sleeping).

**Usage:**
```
/status
```

**Example (awake):**
```
User: /status
Bot: ✅ EureClaw is awake and ready!

Use /sleep to pause the bot.
```

**Example (sleeping):**
```
User: /status
Bot: 😴 EureClaw is sleeping

Started: 2/22/2026, 10:30:00 PM
Duration: 2h 15m
Wake time: 2/23/2026, 12:45:00 AM
Remaining: 45m
Requested by: Gino
```

---

### Sleep Mode

Sleep mode pauses ALL bot activity:
- Messages are ignored (except `/awake`)
- Scheduled tasks (crons) are paused
- Only slash commands work

#### `/sleep [duration]`
Put bot to sleep.

**Usage:**
```
/sleep              # Sleep indefinitely (until /awake)
/sleep 4h           # Sleep for 4 hours
/sleep 30m          # Sleep for 30 minutes
/sleep 2d           # Sleep for 2 days
/sleep 1h30m        # Sleep for 1 hour 30 minutes
```

**Duration format:**
- `d` = days
- `h` = hours
- `m` = minutes
- `s` = seconds
- Can combine: `1h30m`, `2d12h`, etc.

**Examples:**
```
User: /sleep 4h
Bot: 😴 EureClaw is going to sleep for 4h.

• All messages will be ignored
• Scheduled tasks will be paused
• Use /awake to wake up early
```

```
User: /sleep
Bot: 😴 EureClaw is going to sleep indefinitely (use /awake to wake up).

• All messages will be ignored
• Scheduled tasks will be paused
• Use /awake to wake up early
```

---

#### `/awake`
Wake bot from sleep mode.

**Usage:**
```
/awake
```

**Example:**
```
User: /awake
Bot: ☀️ EureClaw is now awake!

Slept for: 2h 15m
Awakened by: Gino
```

---

### Information

#### `/help`
Show available commands.

**Usage:**
```
/help
```

**Example:**
```
User: /help
Bot: 🤖 EureClaw Commands

**System Control:**
/restart - Restart the bot
/status - Check bot status

**Sleep Mode:**
/sleep [duration] - Pause all activity
  Examples: /sleep 4h, /sleep 30m, /sleep 2d
/awake - Wake from sleep mode

**Info:**
/help - Show this help message
/chatid - Get chat registration ID (Telegram only)
```

---

#### `/chatid` (Telegram only)
Get chat ID for registration.

**Usage:**
```
/chatid
```

**Example:**
```
User: /chatid
Bot: Chat ID: `tg:123456789`
Name: Gino
Type: private
```

---

## Implementation Details

### Architecture

Commands are handled by a universal system in `src/commands/`:

```
src/commands/
├── index.ts              # Command registry and executor
├── sleep-manager.ts      # Sleep state management
└── builtin-commands.ts   # Built-in command handlers
```

### Command Flow

1. Message arrives from any channel (WhatsApp, Telegram, etc.)
2. `src/index.ts` checks if message starts with `/`
3. If yes, `executeCommand()` is called
4. Command handler executes and returns response
5. Response is sent back through the same channel
6. Message is NOT stored in DB or processed further

### Adding New Commands

```typescript
// src/commands/my-commands.ts
import { registerCommand } from './index.js';

registerCommand('mycommand', async (ctx) => {
  // ctx.chatJid - Chat identifier
  // ctx.senderName - Sender's name
  // ctx.senderId - Sender's ID
  // ctx.group - RegisteredGroup (if registered)
  // ctx.args - Command arguments
  // ctx.rawMessage - Full message text

  return {
    reply: 'Command executed!',
    action: 'none', // or 'restart', 'sleep', 'awake'
    data: { /* optional data */ }
  };
});
```

Then import in `src/index.ts`:
```typescript
import './commands/my-commands.js';
```

### Sleep State Persistence

Sleep state is stored in `data/sleep-state.json`:

```json
{
  "isSleeping": true,
  "sleepStartTime": "2026-02-22T22:30:00.000Z",
  "sleepDuration": 14400000,
  "sleepUntil": "2026-02-23T02:30:00.000Z",
  "sleepRequestedBy": "Gino",
  "sleepRequestedFrom": "tg:123456789"
}
```

This ensures sleep mode persists across restarts.

---

## Use Cases

### Night Mode
```
# Before bed
/sleep 8h

# Bot ignores all messages and crons for 8 hours
# Auto-wakes in the morning
```

### Maintenance Window
```
# Before deploying updates
/sleep

# Do maintenance work
# When done:
/awake
```

### Vacation Mode
```
# Going away for a week
/sleep 7d

# Bot pauses all activity
# Auto-wakes when you're back
```

### Emergency Pause
```
# Something's wrong, pause everything
/sleep

# Fix the issue
# Resume when ready:
/awake
```

---

## Security

- Commands only work in registered chats
- Sleep state is tamper-proof (stored outside container)
- Only `/awake` and `/status` work during sleep mode
- All command executions are logged

---

## Future Commands

Planned commands for future releases:

- `/model [name]` - Switch AI model
- `/logs [count]` - Show recent logs
- `/tasks` - List scheduled tasks
- `/groups` - List registered groups
- `/stats` - Show usage statistics
