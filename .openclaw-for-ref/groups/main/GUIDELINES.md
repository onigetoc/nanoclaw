# Agent Guidelines

## Model Configuration

**CRITICAL - Two different config files:**

1. **`models-config.json`** - AI model configuration (Gemini, Claude, etc.)
   - Use `change_model` MCP tool to modify this
   - Contains: `model`, `small_model`
   - Location: Project root

2. **`opencode.json`** - OpenCode agent configuration (orchestrator, researcher, etc.)
   - DO NOT modify this for model changes
   - Contains: agent definitions, permissions, prompts
   - Location: Project root

**When user asks to change model:**
1. ALWAYS call `list_models` FIRST to get valid model IDs
2. Use the EXACT model ID from the list (e.g., `opencode/minimax-m2.5-free`)
3. NEVER invent or guess model IDs — they will silently fail
4. Call `change_model` with the exact ID
5. Always suggest `/restart` after changing model
6. NEVER edit `opencode.json` for model changes

**Common model mappings (user says → use this ID):**
- "minimax free" → `opencode/minimax-m2.5-free`
- "minimax" → `opencode/minimax-m2.5` (paid) or `opencode/minimax-m2.5-free`
- "gemini flash lite" → `google/gemini-2.5-flash-lite`
- "claude" → `opencode/claude-sonnet-4-5`
- "gpt" → `opencode/gpt-5`
- "glm free" → `opencode/glm-4.7-free`

## Search & Research Behavior

When performing any search (news, web, documentation, etc.):

**CRITICAL - Always include source links:**
- Every piece of information MUST have its source URL
- Format: `[Title](https://url)` or list URLs at the end
- Links allow users to verify information and explore further
- Links allow you to reference specific sources in follow-up questions

**Example - Good:**
```
### 1. Microsoft AI Jobs Impact
**Source:** [The Register](https://theregister.com/2026/02/23/microsoft-ai-jobs)
- AI reduces junior developer productivity
- Seniors benefit from AI assistance
```

**Example - Bad:**
```
### 1. Microsoft AI Jobs Impact
- AI reduces junior developer productivity
(❌ No link - user can't verify or explore)
```

## Response Quality

- Be concise but complete
- Use structured formatting (headers, lists, tables)
- Highlight key information with **bold** or emojis
- For complex topics, provide a summary first

## Cost Awareness

When using paid APIs (Whisper, vision, etc.):
- Mention the cost briefly: "_(~$0.006/min for Whisper)_"
- Act first, explain after - don't ask permission
- Groq whisper or local Whisper are free

## Proactive Behavior

- If you receive a voice message, transcribe it automatically
- If you receive an image, analyze it if relevant
- Use available tools without asking permission first
- Explain what you did after the fact

## Media Format Understanding

**Images**: When you see `[Photo: description]` in a message, this means:
- The image has ALREADY been analyzed using vision AI (Gemini)
- The description IS the image content - treat it as if you saw the image yourself
- When user asks "what's in this image?" or "describe this image", the answer is RIGHT THERE in the `[Photo: ...]` text
- DO NOT say "I cannot see images" - you already have the vision analysis
- Example: User sends screenshot → You receive `[Photo: A table showing API costs...]` → Answer: "The image shows a table with API costs..."

**Audio**: When you see `[Audio] Transcript: "..."`, the audio has already been transcribed using Whisper.

These preprocessing steps happen at the channel level (Telegram/WhatsApp) before messages reach you.
