---
name: add-voice-transcription
description: Add voice message transcription to NanoClaw using Groq Whisper (FREE) or OpenAI Whisper (paid). Automatically transcribes voice messages so the agent can read and respond to them.
---

# Add Voice Message Transcription

This skill enables automatic voice message transcription for Telegram and WhatsApp. The transcription system is already built into NanoClaw core - this skill just helps you configure it.

**Note:** NanoClaw's media system (`src/media/`) is part of the core and supports multiple providers. This skill only configures which provider to use.

## Choose Your Provider

**Use the AskUserQuestion tool** to present options:

> NanoClaw supports 3 transcription providers:
>
> 1. **Groq Whisper (Recommended - FREE)**
>    - 2000 requests/day, 8 hours audio/day
>    - Very fast (LPU infrastructure)
>    - No credit card required
>    - Get API key: https://console.groq.com
>
> 2. **OpenAI Whisper (Paid)**
>    - $0.006 per minute (~$0.003 per 30s voice note)
>    - Very reliable
>    - Get API key: https://platform.openai.com/api-keys
>
> 3. **Local Whisper (Advanced - FREE)**
>    - Requires whisper.cpp or faster-whisper installed
>    - No API calls, fully offline
>    - Slower than cloud options
>
> Which provider do you want to use?

Wait for user choice before continuing.
---

## Configuration

### Option 1: Groq Whisper (Recommended)

**Step 1: Get API Key**

Tell the user:
> Go to https://console.groq.com
> Sign up (no credit card required)
> Create an API key
> Copy the key (starts with `gsk_`)

**Step 2: Configure .env**

Add to `.env` file:

```bash
# Audio Transcription - Groq Whisper (FREE)
AUDIO_ENABLED=true
AUDIO_PROVIDER=groq
GROQ_API_KEY=gsk_your_key_here
GROQ_WHISPER_MODEL=whisper-large-v3-turbo
```

**That's it!** No code changes needed.

---

### Option 2: OpenAI Whisper

**Step 1: Get API Key**

Tell the user:
> Go to https://platform.openai.com/api-keys
> Create an API key
> Copy the key (starts with `sk-`)

**Step 2: Configure .env**

Add to `.env` file:

```bash
# Audio Transcription - OpenAI Whisper (Paid)
AUDIO_ENABLED=true
AUDIO_PROVIDER=openai
OPENAI_API_KEY=sk_your_key_here
OPENAI_WHISPER_MODEL=whisper-1
```

**That's it!** No code changes needed.

---

### Option 3: Local Whisper (Advanced)

**Step 1: Install whisper.cpp or faster-whisper**

For whisper.cpp:
```bash
# macOS
brew install whisper-cpp

# Linux
git clone https://github.com/ggerganov/whisper.cpp
cd whisper.cpp
make
# Add to PATH
```

For faster-whisper (Python):
```bash
pip install faster-whisper
```

**Step 2: Configure .env**

Add to `.env` file:

```bash
# Audio Transcription - Local Whisper
AUDIO_ENABLED=true
AUDIO_PROVIDER=local
LOCAL_WHISPER_COMMAND=whisper
LOCAL_WHISPER_ARGS=--model base --language auto
```

**That's it!** No code changes needed.

---

## Restart Service

After configuring `.env`, restart NanoClaw:

```bash
npm run build
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

Or on Linux:
```bash
npm run build
systemctl --user restart nanoclaw
```

---

## Test Voice Transcription

Tell the user:

> Voice transcription is ready! Test it by:
>
> 1. Open Telegram or WhatsApp
> 2. Go to your registered chat
> 3. Send a voice note using the microphone button
> 4. The agent should receive the transcribed text and respond
>
> In the database and agent context, voice messages appear as:
> `[Audio] Transcript: "<transcribed text here>"`

Watch for transcription in the logs:

```bash
tail -f logs/nanoclaw.log | grep -i "voice\|transcri"
```

---

## Configuration Options

### Disable Transcription Temporarily

Edit `.env`:
```bash
AUDIO_ENABLED=false
```

### Change Provider

Just change `AUDIO_PROVIDER` in `.env`:
```bash
AUDIO_PROVIDER=groq    # or openai, or local
```

### Adjust Timeout

For slow connections or large files:
```bash
AUDIO_TIMEOUT=60000    # 60 seconds
```

### Adjust Max File Size

```bash
AUDIO_MAX_FILE_SIZE=26214400    # 25MB (Whisper limit)
```

---

## Troubleshooting

### "Transcription unavailable" or "Transcription failed"

Check logs:
```bash
tail -100 logs/nanoclaw.log | grep -i transcription
```

Common causes:
- API key not configured or invalid
- No API credits remaining (OpenAI)
- Rate limit hit (Groq: 2000/day)
- Network connectivity issues
- Audio format not supported

### Voice messages not being detected

- Ensure you're sending voice notes (microphone button), not audio file attachments
- Check that the message has `audioMessage.ptt = true`

### Groq rate limit

Groq free tier: 2000 requests/day, 8 hours audio/day

If you hit the limit:
1. Wait for reset (daily)
2. Switch to OpenAI temporarily
3. Use local whisper for unlimited usage

---

## Removing Voice Transcription

To disable:

```bash
# Edit .env
AUDIO_ENABLED=false

# Restart
npm run build
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

The code stays in place (it's part of core), but transcription is disabled.

---

## Architecture Notes

**Why is this in core?**

The media system (`src/media/`) is part of NanoClaw core because:
- MIME detection is essential for all media types
- Prevents binary injection bugs (like OpenClaw had)
- Reusable for images, videos, documents
- Providers are optional and configurable

**No code modifications needed** - Just configure `.env` to enable/disable features.

---

## Future Enhancements

Potential additions:
- **Automatic fallback**: Groq → OpenAI if rate limit
- **Language detection**: Auto-detect and transcribe non-English
- **Cost tracking**: Log transcription costs per message
- **Speaker diarization**: Identify different speakers

---

*This skill configures NanoClaw's built-in media system. No core files are modified.*
