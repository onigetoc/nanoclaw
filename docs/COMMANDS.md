# EureClaw Commands

EureClaw supports slash commands for controlling the bot and managing sessions.

## System Commands

### `/restart`
Restart the EureClaw service.

**Usage:**
```
/restart
```

**Response:**
```
🔄 Restarting EureClaw...
```

---

### `/status`
Check if the bot is awake or sleeping.

**Usage:**
```
/status
```

**Response (when awake):**
```
✅ Andy is awake and ready!

Use /sleep to pause the bot.
```

**Response (when sleeping):**
```
😴💤 Andy is sleeping

Started: Mar 2, 2026, 10:30 AM
Duration: 2 hours 15 minutes
Wake time: Mar 2, 2026, 12:45 PM
Remaining: 30 minutes
Requested by: Gino
```

---

## Sleep Mode Commands

### `/sleep [duration]`
Put the bot to sleep. All messages will be ignored until awakened.

**Usage:**
```
/sleep              # Sleep indefinitely (until /awake)
/sleep 4h           # Sleep for 4 hours
/sleep 30m          # Sleep for 30 minutes
/sleep 2d           # Sleep for 2 days
/sleep 1h30m        # Sleep for 1 hour 30 minutes
```

**Duration Format:**
- `m` = minutes
- `h` = hours
- `d` = days
- Can combine: `1h30m`, `2d12h`, etc.

**Response:**
```
😴💤 Andy is going to sleep for 4 hours.

• All messages will be ignored
• Scheduled tasks will be paused
• Use /awake to wake up early
```

---

### `/awake`
Wake the bot from sleep mode.

**Usage:**
```
/awake
```

**Response:**
```
☀️ Andy is now awake!

Slept for: 2 hours 15 minutes
Awakened by: Gino
```

---

## Session Commands

### `/new`
Create a new OpenCode session. This clears the conversation history and starts fresh.

**Usage:**
```
/new
```

**Response:**
```
🆕 Starting a new session...
```

**What happens:**
1. Current session ID is cleared
2. Bot sends confirmation message
3. Next message creates a fresh OpenCode session
4. Conversation history is reset

**Use cases:**
- Starting a completely new topic
- Clearing context after a long conversation
- Resetting when the bot seems confused
- Testing with a clean slate

---

## Help Command

### `/help`
Show available commands.

**Usage:**
```
/help
```

**Response:**
```
🤖 Andy Commands

**System Control:**
/restart - Restart the bot
/status - Check bot status

**Sleep Mode:**
/sleep [duration] - Pause all activity
  Examples: /sleep 4h, /sleep 30m, /sleep 2d
/awake - Wake from sleep mode

**Session:**
/new - Start a new conversation session

**Info:**
/help - Show this help message
/chatid - Get chat registration ID (Telegram only)
```

---

## Command Behavior

### EureClaw Commands
These commands are handled directly by EureClaw:
- `/restart`
- `/sleep`
- `/awake`
- `/status`
- `/help`
- `/chatid`

They execute immediately and don't interact with OpenCode.

### OpenCode Commands
These commands interact with the OpenCode SDK:
- `/new` - Creates a new session

They set flags and continue processing, allowing the agent to handle them.

### Unknown Commands
Commands that don't match any registered command are ignored. The message is treated as regular text and sent to the agent.

---

## Technical Details

### Command Format
- Commands must start with `/`
- Command name is case-insensitive
- Arguments are space-separated
- Example: `/sleep 4h` → command: `sleep`, args: `['4h']`

### Command Registration
Commands are registered in:
- `src/commands/builtin-commands.ts` - System and sleep commands
- `src/commands/opencode-commands.ts` - OpenCode session commands

### Adding New Commands
See `dev-notes/decisions.md` for implementation details.

---

## Examples

### Typical Workflow

```
User: /status
Bot: ✅ Andy is awake and ready!

User: /new
Bot: 🆕 Starting a new session...

User: Hello! Can you help me with a project?
Bot: [Fresh conversation starts]

User: /sleep 2h
Bot: 😴💤 Andy is going to sleep for 2 hours...

[2 hours later]

User: /awake
Bot: ☀️ Andy is now awake!
     Slept for: 2 hours 0 minutes
     Awakened by: Gino
```

### Error Handling

```
User: /sleep invalid
Bot: ❌ Invalid duration format.

     Examples:
       /sleep 4h       - Sleep for 4 hours
       /sleep 30m      - Sleep for 30 minutes
       /sleep 2d       - Sleep for 2 days
       /sleep 1h30m    - Sleep for 1 hour 30 minutes
       /sleep          - Sleep indefinitely
```
