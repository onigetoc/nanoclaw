---
name: change-model
description: Change the AI model used by OpenCode/NanoClaw. Use when user requests to switch models, change to a different AI provider, or asks what model is currently being used. Triggers on "change model", "switch model", "use model", "set model".
---

# Change Model

Allows changing the AI model via chat commands.

## Usage

User can say:

- "change model to gemini-2.5-flash-lite"
- "switch to claude-sonnet-4-5"
- "use gpt-4o"
- "what model am I using?"

## Popular Models

### Free Models

- `opencode/glm-5-free` - GLM-5 Free (current default for free tier)
- `google/gemini-2.5-flash-lite` - Gemini Flash Lite (free with limits)
- `google/gemini-2.5-flash` - Gemini Flash (free tier available)

### Premium Models (require API key)

- `anthropic/claude-sonnet-4-5` - Claude Sonnet 4.5 (balanced)
- `anthropic/claude-opus-4-5` - Claude Opus 4.5 (best reasoning)
- `openai/gpt-5.1` - GPT-5.1
- `openai/gpt-4o` - GPT-4 Omni
- `google/gemini-3-pro` - Gemini 3 Pro
- `deepseek/deepseek-chat` - DeepSeek Chat (cheap)

## Implementation

When user requests model change:

1. **Parse the requested model** from user message
2. **Validate the model name** against Models.dev database
3. **Update the config file** with new model
4. **Inform user** that restart is needed

### Config File Location

OpenCode config is at:

- Windows: `C:\Users\{username}\.opencode\opencode.jsonc`
- macOS/Linux: `~/.opencode/opencode.jsonc`

### Code Example

```javascript
const fs = require('fs');
const path = require('path');
const os = require('os');

const configPath = path.join(os.homedir(), '.opencode', 'opencode.jsonc');

function changeModel(newModel) {
  let config = {};

  if (fs.existsSync(configPath)) {
    const content = fs.readFileSync(configPath, 'utf-8');
    const jsonContent = content.replace(/\/\/.*$/gm, '');
    config = JSON.parse(jsonContent);
  }

  config.model = newModel;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  return `Model changed to: ${newModel}\nPlease restart OpenCode for changes to take effect.`;
}

changeModel('google/gemini-2.5-flash-lite');
```

## Example Responses

**Model specified:**

```
User: "change model to gemini-2.5-flash-lite"

Andy: ✓ Model changed to google/gemini-2.5-flash-lite
Restart OpenCode (Ctrl+C then run again) for changes to take effect.
```

**No model specified:**

```
User: "change model"

Andy: Which model would you like to use?

Free:
• glm-5-free
• gemini-2.5-flash-lite

Premium:
• claude-sonnet-4-5
• claude-opus-4-5
• gemini-3-pro
• gpt-5.1
```

**Ambiguous model:**

```
User: "switch to gemini"

Andy: Multiple Gemini models available:
• google/gemini-2.5-flash (free tier)
• google/gemini-2.5-flash-lite (lite version)
• google/gemini-3-pro (premium)

Which one?
```

## Current Model Detection

To check current model, look for the `model` key in config, or check the Runtime Environment section of the system prompt.

## Notes

- Model change requires OpenCode restart to take effect
- Invalid model names will be rejected
- Use Models.dev API to validate model IDs: https://models.dev/api.json
