# Model Configuration Guide

EureClaw supports flexible model configuration via `models-config.json` at the project root.

## Quick Start

### Default: 100% Free (Text-Only)

EureClaw works out-of-the-box with OpenCode free models:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "opencode/minimax-m2.5-free",
  "small_model": "opencode/minimax-m2.5-free",
  "fallback_model": "opencode/glm-5-free",
  "provider": {
    "opencode": {
      "options": { "timeout": 600000 }
    }
  }
}
```

**Limitation:** OpenCode free models are text-only. They cannot read images, videos, or documents.

### Recommended: Free + Gemini (Multimodal) ⭐

Add Gemini for multimodal support (images, videos, documents):

**models-config.json:**
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

**.env:**
```bash
# Google Gemini API Key (get free at https://aistudio.google.com/apikey)
GOOGLE_API_KEY=AIzaSy...your_key_here
```

**Why this configuration?**
- ✅ **Primary model is FREE** (OpenCode Minimax - text only)
- ✅ **Small model is multimodal** (Gemini handles images, audio, documents)
- ✅ **Gemini has generous free tier** (500 requests/day)
- ✅ **Very cheap if you exceed free tier** (~$1-5/month typical use)
- ✅ **API keys in `.env`** (secure, not committed to git)

**Get your free Google API key:** https://aistudio.google.com/apikey  
**Full setup guide:** [GEMINI-SETUP.md](GEMINI-SETUP.md)

### Alternative: 100% Free (No API Keys)

If you prefer to stay completely free:

1. Edit `models-config.json` in the project root
2. Set your desired models
3. Restart EureClaw

### Alternative: 100% Free (No API Keys)

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "opencode/minimax-m2.5-free",
  "small_model": "opencode/minimax-m2.5-free",
  "fallback_model": "opencode/glm-5-free",
  "provider": {
    "opencode": {
      "options": { "timeout": 600000 }
    }
  }
}
```

This works great, but you'll miss out on Gemini's multimodal capabilities (images, audio, documents).

## How It Works

EureClaw uses a client-server architecture:

1. **OpenCode Server** - Runs locally (`opencode serve`)
   - Reads model configuration from environment variables
   - Manages API keys and provider connections
   - Routes requests to appropriate AI models

2. **OpenCode SDK Client** - Connects to the server
   - Only needs to know the server URL (baseURL)
   - Does NOT configure models or API keys
   - Just sends messages and receives responses

**Important:** Model configuration happens server-side, not client-side. When you edit `models-config.json`, EureClaw passes the configuration to the OpenCode server via environment variables. The SDK client only connects to the server - it doesn't know or care which models are being used.

## Configuration File

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "anthropic/claude-3-5-sonnet",
  "small_model": "google/gemini-2.0-flash-lite",
  "vision_model": "opencode/minimax-m2.5-free",
  "fallback_model": "openai/gpt-4o",
  "provider": {
    "anthropic": {
      "options": { "timeout": 600000 }
    },
    "google": {
      "options": { "timeout": 600000 }
    },
    "openai": {
      "options": { "timeout": 600000 }
    }
  }
}
```

## Model Hierarchy

EureClaw uses a four-tier model system for cost optimization and specialized tasks:

### 1. Primary Model (`model`)

Used for complex reasoning, code generation, and deep analysis.

**Examples:**
- `anthropic/claude-3-5-sonnet` - Excellent for code, balanced
- `anthropic/claude-3-opus` - Best reasoning, most expensive
- `openai/gpt-4o` - Multimodal, good all-rounder
- `opencode/minimax-m2.5-free` - Free tier (default)

**When used:**
- Complex code generation
- Architecture decisions
- Deep analysis and reasoning
- Multi-step problem solving

### 2. Small Model (`small_model`)

Used for lightweight tasks to save costs.

**Examples:**
- `google/gemini-2.0-flash-lite` - Fast, free tier
- `google/gemini-2.5-flash-lite` - Latest lite version
- `opencode/glm-5-free` - Free, good for Chinese
- `anthropic/claude-3-haiku` - Fast, cheap

**When used:**
- Web searches
- Summaries
- Simple questions
- Quick responses
- Title generation

### 3. Vision Model (`vision_model`) - NEW! 🎨

Used specifically for image analysis and multimodal tasks. This allows you to use a text-only model as your primary (like Kimi) while still being able to read images.

**Examples:**
- `opencode/minimax-m2.5-free` - Free, supports vision (default)
- `google/gemini-2.0-flash-lite` - Free, excellent vision
- `google/gemini-2.5-flash-lite` - Latest, best vision
- `anthropic/claude-3-5-sonnet` - Premium, excellent vision
- `openai/gpt-4o` - Premium, multimodal

**When used:**
- Image analysis and OCR
- Reading screenshots
- Analyzing diagrams
- Processing visual content
- Any task involving images

**Why separate vision model?**
- Use cheaper text-only models for most tasks
- Switch to vision-capable model only when needed
- Example: Kimi (text) + Minimax (vision) = Best of both worlds

### 4. Fallback Model (`fallback_model`)

Used if the primary model fails or is unavailable.

**Examples:**
- `openai/gpt-4o` - Reliable fallback
- `deepseek/deepseek-chat` - Very cheap
- `opencode/minimax-m2.5-free` - Free tier

**When used:**
- Rate limits hit
- API errors
- Provider outages
- Primary model unavailable

## Popular Models

### Free Models

| Model | Provider | Best For |
|-------|----------|----------|
| `opencode/minimax-m2.5-free` | OpenCode | General use (default) |
| `opencode/glm-5-free` | OpenCode | Chinese language |
| `google/gemini-2.0-flash-lite` | Google | Fast, lightweight |
| `google/gemini-2.5-flash-lite` | Google | Latest lite version |

### Premium Models (require API key)

| Model | Provider | Best For | Cost |
|-------|----------|----------|------|
| `anthropic/claude-3-5-sonnet` | Anthropic | Code, balanced | $$ |
| `anthropic/claude-3-opus` | Anthropic | Best reasoning | $$$ |
| `openai/gpt-4o` | OpenAI | Multimodal | $$ |
| `openai/gpt-4-turbo` | OpenAI | Fast GPT-4 | $$ |
| `google/gemini-2.0-pro` | Google | Google's best | $$ |
| `deepseek/deepseek-chat` | DeepSeek | Very cheap | $ |

## Changing Models via Chat

Andy can change models dynamically using MCP tools:

```
User: "what model are you using?"
Andy: [calls get_current_model]
      Primary: opencode/minimax-m2.5-free
      Small: opencode/minimax-m2.5-free
      Fallback: none

User: "change to claude sonnet"
Andy: [calls change_model]
      ✓ Model changed to: anthropic/claude-3-5-sonnet
      ⚠️  Restart EureClaw for changes to take effect.

User: "list available models"
Andy: [calls list_models]
      ## Free Models
      • opencode/minimax-m2.5-free
      • google/gemini-2.0-flash-lite
      ...
```

## API Keys

Premium models require API keys in `.env`:

```bash
# Anthropic (Claude)
ANTHROPIC_API_KEY=sk-ant-...

# OpenAI (GPT)
OPENAI_API_KEY=sk-...

# Google (Gemini)
GOOGLE_API_KEY=...

# Groq (for audio transcription)
GROQ_API_KEY=gsk_...
```

## Cost Optimization Strategies

### Strategy 1: Recommended - Free + Gemini (Best Value) ⭐

```json
{
  "model": "opencode/minimax-m2.5-free",
  "small_model": "google/gemini-2.5-flash-lite",
  "fallback_model": "opencode/glm-5-free"
}
```

**Cost:** $0-5/month (most users stay in free tier)  
**Best for:** Everyone - best balance of features and cost  
**Why:** Gemini's free tier is generous (500 RPD), and it's multimodal (images, audio, documents)

### Strategy 2: 100% Free

```json
{
  "model": "opencode/minimax-m2.5-free",
  "small_model": "opencode/minimax-m2.5-free",
  "fallback_model": "opencode/glm-5-free"
}
```

**Cost:** $0/month  
**Best for:** Testing, minimal use  
**Limitation:** No multimodal support (images, audio, documents)

### Strategy 3: Balanced Professional

```json
{
  "model": "anthropic/claude-3-5-sonnet",
  "small_model": "google/gemini-2.0-flash-lite",
  "fallback_model": "opencode/minimax-m2.5-free"
}
```

**Cost:** ~$10-50/month (depends on usage)  
**Best for:** Professional use, quality matters

### Strategy 3: Balanced Professional

```json
{
  "model": "anthropic/claude-3-5-sonnet",
  "small_model": "google/gemini-2.5-flash-lite",
  "fallback_model": "opencode/minimax-m2.5-free"
}
```

**Cost:** ~$10-50/month (depends on usage)  
**Best for:** Professional use, quality matters  
**Why:** Claude for complex reasoning, Gemini for everything else

### Strategy 4: Premium

```json
{
  "model": "anthropic/claude-3-opus",
  "small_model": "anthropic/claude-3-haiku",
  "fallback_model": "anthropic/claude-3-5-sonnet"
}
```

**Cost:** ~$50-200/month (depends on usage)  
**Best for:** Heavy use, best quality

### Strategy 4: Budget

```json
{
  "model": "deepseek/deepseek-chat",
  "small_model": "google/gemini-2.0-flash-lite",
  "fallback_model": "opencode/minimax-m2.5-free"
}
```

**Cost:** ~$5-20/month  
**Best for:** Cost-conscious, good quality

## Troubleshooting

### Model not found

```
Error: Model "anthropic/claude-3-5-sonnet" not found
```

**Solution:** Check model ID spelling, ensure API key is set in `.env`

### Rate limit exceeded

```
Error: Rate limit exceeded for model
```

**Solution:** 
1. Wait a few minutes
2. Use fallback model
3. Upgrade API plan

### API key invalid

```
Error: Invalid API key for provider
```

**Solution:** Check `.env` file, ensure key is correct and active

## Advanced Configuration

### Provider Options

```json
{
  "provider": {
    "anthropic": {
      "options": {
        "timeout": 600000,
        "max_retries": 3
      }
    }
  }
}
```

### Custom Base URLs

```json
{
  "provider": {
    "openai": {
      "base_url": "https://api.openai.com/v1",
      "options": { "timeout": 600000 }
    }
  }
}
```

## References

- [OpenCode Models](https://opencode.ai/models)
- [Anthropic Pricing](https://www.anthropic.com/pricing)
- [OpenAI Pricing](https://openai.com/pricing)
- [Google AI Pricing](https://ai.google.dev/pricing)
- [DeepSeek Pricing](https://www.deepseek.com/pricing)

## See Also

- `.opencode/skills/change-model/SKILL.md` - Change model skill documentation
- `dev-notes/decisions.md` - Architecture decision record
- `README.md` - Main documentation
