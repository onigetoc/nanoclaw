---
name: change-model
description: Change the AI model used by OpenCode/NanoClaw. Use when user requests to switch models, change to a different AI provider, or asks what model is currently being used. Triggers on "change model", "switch model", "use model", "set model".
---

# Change Model

Allows changing the AI model via chat commands using MCP tools.

## Usage

User can say:

- "change model to gemini-2.5-flash-lite"
- "switch to claude-sonnet-4-5"
- "use gpt-4o"
- "what model am I using?"
- "list available models"
- "set a lightweight model for simple tasks"

## Popular Models

### Free Models

- `opencode/minimax-m2.5-free` - Minimax M2.5 Free (fast, efficient, recommended - default)
- `opencode/glm-5-free` - GLM-5 Free (good for Chinese language)
- `opencode/kimi-k2.5-free` - Kimi K2.5 Free (alternative free option)
- `opencode/big-pickle` - Big Pickle (another free option)
- `opencode/gpt-5-nano` - GPT-5 Nano (lightweight free model)
- `google/gemini-2.5-flash-lite` - Gemini Flash Lite (free with limits)
- `google/gemini-2.5-flash` - Gemini Flash (free tier available)

### Premium Models (require API key)

- `anthropic/claude-sonnet-4-5` - Claude Sonnet 4.5 (balanced)
- `anthropic/claude-opus-4-5` - Claude Opus 4.5 (best reasoning)
- `openai/gpt-5.1` - GPT-5.1
- `openai/gpt-4o` - GPT-4 Omni
- `google/gemini-3-pro` - Gemini 3 Pro
- `deepseek/deepseek-chat` - DeepSeek Chat (cheap)

## MCP Tools Available

NanoClaw provides MCP tools for model management:

### get_current_model
Get the current model configuration.

```typescript
// No parameters needed
const result = await mcp__nanoclaw__get_current_model();
// Returns: { primary_model, small_model, fallback_model, note }
```

### change_model
Change the primary model (for complex reasoning).

```typescript
await mcp__nanoclaw__change_model({
  model: "anthropic/claude-3-5-sonnet"
});
```

### set_small_model
Set the lightweight model (for simple tasks like searches).

```typescript
await mcp__nanoclaw__set_small_model({
  model: "google/gemini-2.0-flash-lite"
});
```

### list_models
List available models by category.

```typescript
await mcp__nanoclaw__list_models({
  category: "free" // or "premium" or "all"
});
```

## Implementation

When user requests model change:

1. **Check current model** using `get_current_model`
2. **List available models** if user is unsure
3. **Change the model** using appropriate tool
4. **Inform user** that restart is needed

### Example Flow

```
User: "what model am I using?"

Andy: [calls get_current_model]
You're currently using:
• Primary: opencode/minimax-m2.5-free
• Small: opencode/minimax-m2.5-free
• Fallback: none

User: "change to claude sonnet"

Andy: [calls change_model with "anthropic/claude-3-5-sonnet"]
✓ Primary model changed to: anthropic/claude-3-5-sonnet

⚠️  OpenCode server restart required for changes to take effect.
Please restart NanoClaw to use the new model.
```

## Example Responses

**Check current model:**

```
User: "what model am I using?"

Andy: [calls get_current_model]
You're currently using:
• Primary: opencode/minimax-m2.5-free (for complex reasoning)
• Small: opencode/minimax-m2.5-free (for lightweight tasks)
• Fallback: none
```

**Change model:**

```
User: "change model to gemini-2.5-flash-lite"

Andy: [calls change_model]
✓ Model changed to google/gemini-2.5-flash-lite
Restart NanoClaw for changes to take effect.
```

**List models:**

```
User: "what models are available?"

Andy: [calls list_models with category="all"]
## Free Models
• opencode/minimax-m2.5-free - MiniMax M2.5 Free (current default)
• google/gemini-2.0-flash-lite - Gemini 2.0 Flash Lite (fast, lightweight)

## Premium Models (require API key)
• anthropic/claude-3-5-sonnet - Claude 3.5 Sonnet (excellent for code)
• openai/gpt-4o - GPT-4 Omni (multimodal)
...
```

**Set small model:**

```
User: "use gemini flash lite for simple tasks"

Andy: [calls set_small_model]
✓ Small model changed to: google/gemini-2.0-flash-lite
This model will be used for lightweight tasks like searches and summaries.
Restart required.
```

## Configuration File

Model configuration is stored in `opencode.json` at the project root:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "anthropic/claude-3-5-sonnet",
  "small_model": "google/gemini-2.0-flash-lite",
  "fallback_model": "openai/gpt-4o",
  "provider": {
    "anthropic": {
      "options": { "timeout": 600000 }
    },
    "google": {
      "options": { "timeout": 600000 }
    }
  }
}
```

This file is read by NanoClaw at startup and passed to the OpenCode server.

## Model Hierarchy

NanoClaw supports a three-tier model system:

1. **Primary Model** (`model`) - Used for complex reasoning, code generation, deep analysis
2. **Small Model** (`small_model`) - Used for lightweight tasks, searches, summaries
3. **Fallback Model** (`fallback_model`) - Used if primary model fails or is unavailable

This allows cost optimization while maintaining quality for important tasks.

## Notes

- Model changes require NanoClaw restart to take effect
- The OpenCode server must be restarted (happens automatically on NanoClaw restart)
- Invalid model names will be rejected by OpenCode
- API keys for premium models must be configured in `.env` or provider config
