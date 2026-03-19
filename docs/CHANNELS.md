# Channels

EureClaw supports multiple messaging channels to communicate with the assistant. Each channel implements the `Channel` interface defined in `src/types.ts`.

## What are Channels?

Channels are messaging platforms where you interact with your EureClaw assistant. Each channel can have multiple workspaces (or chats), and each workspace has its own isolated memory and context.

## What are Workspaces?

In EureClaw, a "workspace" is any chat or conversation where the bot is present:

- **Private chats** (DMs) - One-on-one conversations with the bot
- **Group chats** - Multi-user conversations (WhatsApp groups, Telegram groups, Discord servers, etc.)
- **Main workspace** - Your primary control channel (usually your self-chat or DM with the bot)

Each workspace has:
- Its own memory files in `workspaces/{name}/dna/` (AGENTS.md, SOUL.md, IDENTITY.md, etc.)
- Its own workspace folder in `workspaces/{name}/workspace/` for generated content
- Isolated context (what happens in one workspace doesn't affect others)
- Its own scheduled tasks
- Separate conversation history

**Terminology across platforms:**
- WhatsApp/Telegram: "Groups" or "Chats"
- Discord: "Servers" and "Channels"
- Slack: "Workspaces" and "Channels"
- Matrix: "Rooms"
- Teams: "Teams" and "Channels"

All of these are treated as "workspaces" in EureClaw.

## Supported Channels

- **WhatsApp** - Via Baileys (implementation in `src/channels/whatsapp.ts`)
- **Telegram** - Via Grammy (implementation in `src/channels/telegram.ts`)

## Potential Future Channels

Most popular messaging platforms support bots with group/channel functionality:

| Platform | Group Support | Bot API | Notes |
|----------|---------------|---------|-------|
| Discord | ✅ Servers & Channels | ✅ Official API | Very popular for communities |
| Slack | ✅ Workspaces & Channels | ✅ Official API | Business-focused |
| Microsoft Teams | ✅ Teams & Channels | ✅ Official API | Enterprise integration |
| Matrix | ✅ Rooms | ✅ Open Protocol | Decentralized, bridges to other platforms |
| Signal | ✅ Groups | ⚠️ Unofficial | Privacy-focused, limited bot support |
| iMessage | ✅ Groups | ❌ No official API | Apple ecosystem only |

See the "Adding a New Channel" section below for implementation guidance.

## Main Channel vs Other Workspaces

### Main Channel
Your "main" channel is your primary control interface:
- Usually your self-chat or private DM with the bot
- Has full privileges (can manage other workspaces, view all tasks, access global memory)
- Doesn't require trigger words (bot responds to all messages)
- Auto-registered on first message

### Other Workspaces
Additional workspaces you register:
- Isolated memory and context
- Require trigger word by default (e.g., `@Andy`)
- Can only manage their own tasks
- Cannot access other workspaces' data

## Telegram

### Initial Setup

1. **Create a Telegram bot:**
   - Open a conversation with [@BotFather](https://t.me/botfather)
   - Send `/newbot`
   - Follow the instructions to choose a name and username
   - Copy the provided API token

2. **Configure the token in EureClaw:**
   - Add the token to your `.env` file:
     ```
     TELEGRAM_BOT_TOKEN=your_bot_token_here
     ```

3. **Disable Privacy Mode (IMPORTANT):**
   - By default, Telegram bots in "privacy mode" only receive messages that explicitly mention them
   - To make the bot receive all group messages:
     - Send `/setprivacy` to @BotFather
     - Select your bot
     - Click **Disable**
   - If the bot was already in groups, remove it and add it back to apply the change
   - Alternative: Making the bot a group administrator automatically disables privacy mode

4. **Get the Chat ID:**
   - Add the bot to a group or start a private conversation
   - Send `/chatid` to the bot
   - The bot will respond with the chat ID in format `tg:123456789`

5. **Register the group:**
   - Use the MCP tool `register_group` with the obtained Chat ID
   - Or send a message to the bot which will guide you through automatic registration

### JID Format

- **Telegram groups:** `tg:-1001234567890`
- **Private conversations:** `tg:123456789`

### Supported Features

- Text messages
- Photos (with vision analysis if configured)
- Audio/Voice (with Groq Whisper transcription if configured)
- Documents
- Stickers
- Typing indicators

### Limitations

- Messages limited to 4096 characters (EureClaw automatically splits long messages)
- Files must be accessible via Telegram API

### Troubleshooting

**Bot doesn't respond in groups:**
- Verify that privacy mode is disabled (`/setprivacy` → Disable)
- Remove and re-add the bot to the group after changing privacy mode
- Or make the bot a group administrator

**Bot doesn't connect:**
- Verify the token is correct in `.env`
- Check logs: `bun run logs`
- Restart EureClaw: `launchctl kickstart -k gui/$(id -u)/com.eureclaw`

## WhatsApp

Documentation coming soon.

## Adding a New Channel

To add a new messaging channel:

1. Create a class that implements the `Channel` interface in `src/types.ts`
2. Implement the required methods:
   - `connect()` - Establish connection
   - `sendMessage(jid, text)` - Send messages
   - `ownsJid(jid)` - Check if a JID belongs to this channel
   - `disconnect()` - Clean shutdown
   - `setTyping(jid, isTyping)` - Typing indicators (optional)
3. Add the channel in `src/index.ts`
4. Define a unique JID format for this channel
