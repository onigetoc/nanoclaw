# Model Configuration Guide

EureClaw supports flexible model configuration via `models-config.json` at the project root.

## Quick Start

### Default: Free Models

EureClaw works out-of-the-box with OpenCode free models. Free models rotate regularly — check `opencode auth login` or [opencode.ai/models](https://opencode.ai/models) for current options.

Configure your models in `models-config.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "your-chosen-model",
  "small_model": "your-chosen-small-model",
  "fallback_model": "your-chosen-fallback",
  "provider": {
    "opencode": {
      "options": { "timeout": 600000 }
    }
  }
}
```

**Limitation:** Most free models are text-only. They cannot read images, videos, or documents.

### Adding Multimodal Support

To handle images, videos, and documents, add a multimodal model as your `small_model`. Several providers offer free tiers with multimodal capabilities.

1. Get an API key from your chosen provider
2. Configure it via `opencode auth login`
3. Update `models-config.json` with the multimodal model as `small_model`

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

Example with premium models:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "anthropic/claude-3-5-sonnet",
  "small_model": "your-small-model",
  "vision_model": "your-vision-model",
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
- Any OpenCode free model (check current options via `opencode auth login`)

**When used:**
- Complex code generation
- Architecture decisions
- Deep analysis and reasoning
- Multi-step problem solving

### 2. Small Model (`small_model`)

Used for lightweight tasks to save costs.

**Examples:**
- Any multimodal model with a free tier
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
- Any multimodal model (check capabilities via models.dev API)
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

### 4. Fallback Model (`fallback_model`)

Used if the primary model fails or is unavailable.

**Examples:**
- `openai/gpt-4o` - Reliable fallback
- `deepseek/deepseek-chat` - Very cheap
- Any OpenCode free model

**When used:**
- Rate limits hit
- API errors
- Provider outages
- Primary model unavailable

## Popular Models

### Free Models

OpenCode free models change regularly. Check [opencode.ai/models](https://opencode.ai/models) or run `opencode auth login` for current free options.

### Premium Models (require API key)

| Model | Provider | Best For | Cost |
|-------|----------|----------|------|
| `anthropic/claude-3-5-sonnet` | Anthropic | Code, balanced | $$ |
| `anthropic/claude-3-opus` | Anthropic | Best reasoning | $$$ |
| `openai/gpt-4o` | OpenAI | Multimodal | $$ |
| `openai/gpt-4-turbo` | OpenAI | Fast GPT-4 | $$ |
| `deepseek/deepseek-chat` | DeepSeek | Very cheap | $ |

## Changing Models via Chat

Andy can change models dynamically using MCP tools:

```
User: "what model are you using?"
Andy: [calls get_current_model]
      Shows current primary, small, and fallback models

User: "change to claude sonnet"
Andy: [calls change_model]
      ✓ Model changed to: anthropic/claude-3-5-sonnet
      ⚠️  Restart EureClaw for changes to take effect.

User: "list available models"
Andy: [calls list_models]
      Shows all available free and premium models
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

### Strategy 1: 100% Free

Use only OpenCode free models. Check current free options via `opencode auth login`.

**Cost:** $0/month
**Best for:** Testing, minimal use
**Limitation:** Usually no multimodal support (images, audio, documents)

### Strategy 2: Free + Multimodal (Best Value) ⭐

Use a free primary model + a multimodal model (with free tier) as small model.

**Cost:** $0-5/month (most users stay in free tier)
**Best for:** Everyone — best balance of features and cost

### Strategy 3: Balanced Professional

Use a premium model for complex tasks + a lightweight model for everything else.

**Cost:** ~$10-50/month (depends on usage)
**Best for:** Professional use, quality matters

### Strategy 4: Premium

All premium models for maximum quality.

**Cost:** ~$50-200/month (depends on usage)
**Best for:** Heavy use, best quality

### Strategy 5: Budget

Use a cheap premium model + free fallback.

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
