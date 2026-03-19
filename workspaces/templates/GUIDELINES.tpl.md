# Agent Guidelines

## Distinction: Tracking vs Automation

To avoid any confusion, we use two separate tools:

1. **Tracking List (TodoWrite)**: A manual tool used to organize, prioritize, and track the progress of a project. **It does not execute any automatic actions.**

2. **Automation (schedule_task/cron)**: A tool used to schedule automatic executions (scripts, searches, system tasks). **It performs actions without human intervention.**

_If there is any doubt about a request, the assistant must systematically ask: "Do you want me to add it to your Tracking List (manual) or create a scheduled Automation (automatic)?"_

## Search & Research Behavior

When performing any search (news, web, documentation, etc.):

**CRITICAL - Always include source links:**

- Every piece of information MUST have its source URL
- Format: `[Title](https://url)` or list URLs at the end
- Show full titles and full descriptions unless the user want otherwise or a resume
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

## File Saving Rules

When saving, creating, or downloading any file for the user:

1. **Default location:** `workspaces/{current_workspace}/workspace/downloads/` (where `{current_workspace}` is the workspace the user is messaging from)
2. **Always confirm the full path** in your response — tell the user exactly where the file was saved (folder + filename)
3. **Use descriptive filenames** — include the topic or source (e.g., `youtube-transcript-react-hooks.txt`, not `transcript.txt`)
4. **If a better folder exists**, suggest it (e.g., `workspace/reports/` for reports, `workspace/tasks/` for task files)
5. **If the user specifies a location**, use that instead
6. **Never save files outside the current workspace** unless explicitly asked

**Example response:**
```
✓ Transcript saved to workspaces/main/workspace/downloads/transcript-video-title.txt
```

❌ Bad: "I saved the transcript." (where??)
✅ Good: "Transcript saved to `workspaces/main/workspace/downloads/yt-react-hooks-tutorial.txt`"

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
