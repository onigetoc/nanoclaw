# Auto-Registration Feature Requirements

## Overview
Simplify NanoClaw's initial setup by automatically registering the first chat as the 'main' group when a user sends their first message. This eliminates the need for manual JID entry and hardcoded configuration scripts.

## Problem Statement
Currently, users must:
1. Get their chat ID via `/chatid` command
2. Manually copy the JID (e.g., `tg:1382389542`)
3. Edit `register-chat.js` with hardcoded values
4. Run the registration script

This creates friction and is error-prone. The user wants a setup experience like OpenClaw: just provide the bot token in `.env` and everything else happens automatically.

## User Stories

### 1. First-Time User Setup
**As a** new NanoClaw user  
**I want to** just provide my bot token and send a message  
**So that** I can start using the bot immediately without manual configuration

**Acceptance Criteria:**
- 1.1: User adds `TELEGRAM_BOT_TOKEN` (or other channel token) to `.env`
- 1.2: User starts NanoClaw with `npm start`
- 1.3: User sends their first message to the bot on any channel
- 1.4: The bot automatically registers that chat as the 'main' group
- 1.5: The bot responds to the message immediately (no manual registration needed)
- 1.6: Group folder structure is created automatically (`groups/main/`, `AGENTS.md`, etc.)

### 2. Channel-Agnostic Registration
**As a** NanoClaw developer  
**I want** auto-registration to work for any messaging channel  
**So that** future channels (Slack, Discord, etc.) work without code changes

**Acceptance Criteria:**
- 2.1: Auto-registration logic is channel-agnostic (works for Telegram, WhatsApp, future channels)
- 2.2: JID format is preserved (e.g., `tg:123456`, `120363@g.us`)
- 2.3: Registration happens in the main orchestrator (`src/index.ts`), not in channel-specific code
- 2.4: Channel implementations only need to call `onMessage` and `onChatMetadata` callbacks

### 3. Prevent Duplicate Registration
**As a** NanoClaw user  
**I want** only the first chat to be auto-registered as 'main'  
**So that** subsequent chats don't overwrite my main group

**Acceptance Criteria:**
- 3.1: Auto-registration only happens if no 'main' group exists in the database
- 3.2: Once a 'main' group is registered, subsequent unregistered chats are ignored
- 3.3: Unregistered chats still have their metadata stored for discovery (via `storeChatMetadata`)
- 3.4: Users can manually register additional groups later (existing functionality preserved)

### 4. Private Chat Detection
**As a** NanoClaw user  
**I want** auto-registration to work for private chats  
**So that** I can use the bot in 1-on-1 conversations

**Acceptance Criteria:**
- 4.1: Private chats (Telegram DM, WhatsApp DM) are auto-registered as 'main'
- 4.2: Group chats can also be auto-registered if they're the first chat
- 4.3: Chat name is set appropriately (user's name for private, group name for groups)
- 4.4: `requiresTrigger` is set to `false` for the main group (no @mention needed)

### 5. Database and Folder Initialization
**As a** NanoClaw system  
**I want** all necessary database tables and folders to exist before auto-registration  
**So that** registration doesn't fail due to missing infrastructure

**Acceptance Criteria:**
- 5.1: `scripts/auto-setup.js` runs before `npm start` (already implemented)
- 5.2: Database schema is created if it doesn't exist
- 5.3: `groups/main/` folder structure is created
- 5.4: `groups/main/AGENTS.md` is created with default content
- 5.5: `groups/global/AGENTS.md` is created with default content

## Non-Functional Requirements

### Security
- Auto-registration only happens for the first chat (prevents unauthorized access)
- Existing manual registration and group management features remain unchanged
- No security regression from current implementation

### Performance
- Auto-registration check adds minimal overhead to message processing
- Database query for checking 'main' group existence is fast (indexed lookup)

### Maintainability
- Auto-registration logic is centralized in one place
- Channel implementations remain simple and focused
- Code is well-documented and testable

## Out of Scope

### Pairing System (Future Consideration)
- OpenClaw's pairing code system for additional security
- User explicitly mentioned: "pour le pairing on regardera cela plus tard"
- This spec focuses on basic auto-registration only

### Multi-User Support
- Preventing other users from taking over WhatsApp/Telegram
- User mentioned: "faut faire attention auto setup de quoi, ça veut pas dire qu'un autre usagé ne prendra pas whatsapp"
- This is a security concern for future consideration, not part of this spec

### Manual Registration Deprecation
- `register-chat.js` script will remain for now (can be deprecated later)
- Manual registration via IPC commands remains available

## Technical Constraints

- Must work on Windows, macOS, and Linux
- Must support both container mode (macOS) and direct mode (Windows/Linux)
- Must not break existing registered groups or message processing
- Must preserve all existing channel functionality

## Success Metrics

- New users can start using NanoClaw in < 2 minutes (token + first message)
- Zero manual JID entry required for initial setup
- Auto-registration works for 100% of supported channels
- No increase in message processing latency
