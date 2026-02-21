# Gemini Setup Guide

Quick guide to get your free Google Gemini API key and add multimodal support to NanoClaw.

## Why You Need Gemini

**OpenCode free models (Minimax, GLM-5, Kimi, Big Pickle) are text-only.** They cannot:
- ❌ Read images you send
- ❌ Analyze videos
- ❌ Extract text from documents (OCR)
- ❌ Transcribe audio (use Groq for this)

**With Gemini, your bot can:**
- ✅ Understand images - Send photos, screenshots, diagrams
- ✅ Read documents - PDFs, Word docs, etc.
- ✅ Analyze videos - Extract information from video files
- ✅ Transcribe audio - Alternative to Groq (if configured)
- ✅ OCR - Extract text from images
- ✅ Better searches - Faster, more accurate web searches

## Why Gemini?

Gemini 2.5 Flash Lite is the **perfect "small model"** for NanoClaw:

- ✅ **FREE tier** - 500 requests/day (generous for personal use)
- ✅ **Multimodal** - Handles text, images, videos, audio, documents
- ✅ **Fast** - Optimized for speed
- ✅ **Cheap** - Only $0.10-0.40/1M tokens if you exceed free tier
- ✅ **Versatile** - Perfect for searches, OCR, summaries, quick questions

Most users stay within the free tier. If you exceed it, expect ~$1-5/month for typical personal use.

## Step 1: Get Your Free API Key

1. Go to https://aistudio.google.com/apikey
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the key (starts with `AIza...`)

**That's it!** No credit card required for the free tier.

## Step 2: Add to NanoClaw

### Recommended: Via Environment Variable (Secure)

Add to your `.env` file:

```bash
# Google Gemini API Key
GOOGLE_API_KEY=AIzaSy...your_key_here
```

**Why `.env`?**
- ✅ Not committed to git (secure)
- ✅ Easy to change without touching code
- ✅ Follows security best practices
- ✅ Same pattern as other secrets (GROQ_API_KEY, etc.)

### Alternative: Via models-config.json (Not Recommended)

You can also put the key in `models-config.json`, but this is less secure:

```json
{
  "provider": {
    "google": {
      "api_key": "AIzaSy...your_key_here"
    }
  }
}
```

**⚠️ Warning:** If you do this, make sure `models-config.json` is in `.gitignore`!

## Step 3: Update Model Configuration

Edit `models-config.json` (no API key needed here):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "opencode/minimax-m2.5-free",
  "small_model": "google/gemini-2.5-flash-lite",
  "fallback_model": "opencode/glm-5-free",
  "provider": {
    "opencode": {
      "options": { "timeout": 600000 }
    }
  }
}
```

**Note:** The API key comes from `.env`, not from this file!

## Step 4: Restart NanoClaw

```bash
# macOS (if using launchd service)
launchctl kickstart -k gui/$(id -u)/com.nanoclaw

# Or just restart the process
# Ctrl+C then npm start
```

## Step 5: Test It

Send a message to your bot:

```
You: "what model are you using?"
Andy: Primary: opencode/minimax-m2.5-free
      Small: google/gemini-2.5-flash-lite ✓
```

## What You Get

With Gemini configured, your bot can now:

- 📝 **Understand images** - Send photos, screenshots, diagrams
- 🎵 **Transcribe audio** - Alternative to Groq (if configured)
- 📄 **Read documents** - PDFs, Word docs, etc.
- 🎥 **Analyze videos** - Extract information from video files
- 🔍 **Better searches** - Faster, more accurate web searches
- 📊 **OCR** - Extract text from images

All while staying mostly free!

## Free Tier Limits

**Gemini 2.5 Flash Lite Free Tier:**
- 500 requests per day (RPD)
- Shared across all your projects using this API key
- Resets daily

**What happens if you exceed?**
- You'll be charged at $0.10-0.40/1M tokens
- For typical personal use: ~$1-5/month
- You can set billing alerts in Google Cloud Console

## Monitoring Usage

Check your usage at: https://aistudio.google.com/apikey

You'll see:
- Requests made today
- Remaining free quota
- Estimated costs (if any)

## Troubleshooting

### "API key not valid"

- Make sure you copied the full key (starts with `AIza`)
- Check for extra spaces or newlines
- Verify the key is enabled in Google AI Studio

### "Quota exceeded"

- You've hit the 500 RPD limit
- Wait until tomorrow (resets daily)
- Or upgrade to paid tier (very cheap)

### "Model not found"

- Make sure you're using `google/gemini-2.5-flash-lite` (not `gemini-2.5-flash-lite`)
- Check that OpenCode supports this model
- Try `google/gemini-2.0-flash-lite` as alternative

## Advanced: Paid Tier

If you need more than 500 requests/day:

1. Go to https://console.cloud.google.com/
2. Enable billing for your project
3. Set up billing alerts (recommended: $5/month)
4. Your API key automatically switches to paid tier

**Pricing:**
- Text/Image/Video: $0.10/1M input, $0.40/1M output
- Audio: $0.30/1M input, $0.40/1M output
- Very affordable for personal use

## Alternative Models

If Gemini doesn't work for you:

**Free alternatives:**
- Keep using OpenCode free models (no multimodal)
- Use Groq for audio only (free, 8h/day)

**Paid alternatives:**
- `anthropic/claude-3-haiku` - $0.25-1.25/1M tokens
- `openai/gpt-4o-mini` - $0.15-0.60/1M tokens

See [MODEL-CONFIGURATION.md](MODEL-CONFIGURATION.md) for more options.

## Summary

1. Get free API key: https://aistudio.google.com/apikey
2. Add to `.env`: `GOOGLE_API_KEY=your_key`
3. Update `models-config.json`: `"small_model": "google/gemini-2.5-flash-lite"`
4. Restart NanoClaw
5. Enjoy multimodal capabilities!

**Cost:** $0/month for most users, ~$1-5/month if you exceed free tier.

## See Also

- [Model Configuration Guide](MODEL-CONFIGURATION.md) - All model options
- [Gemini Pricing](https://ai.google.dev/gemini-api/docs/pricing) - Official pricing
- [Google AI Studio](https://aistudio.google.com/) - Manage your API keys
