---
name: youtube-transcript
description: Fetch YouTube video transcripts/subtitles as plain text. Use when the user provides a YouTube URL or video ID and wants the transcript, subtitles, or captions extracted. Also use when the agent needs to retrieve video content for summarization, translation, or analysis tasks.
allowed-tools: Bash(node:*)
---

# YouTube Transcript

Fetch transcripts from any YouTube video via CLI.

## Command

```bash
node .opencode/skills/youtube-transcript/scripts/transcript.js <url|videoId> [options]
```

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `--lang fr,en` | Preferred languages (comma-separated, tries in order) | Auto (usually English) |
| `--timestamps` | Include `[MM:SS]` timestamps per line | No timestamps |
| `--max 8000` | Max characters per chunk (splits long transcripts) | No splitting |

## Examples

```bash
# Basic transcript
node .opencode/skills/youtube-transcript/scripts/transcript.js https://www.youtube.com/watch?v=dQw4w9WgXcQ

# French preferred, fallback English, with timestamps
node .opencode/skills/youtube-transcript/scripts/transcript.js VIDEO_ID --lang fr,en --timestamps

# Chunked output for long videos
node .opencode/skills/youtube-transcript/scripts/transcript.js VIDEO_ID --max 6000

# Video ID directly
node .opencode/skills/youtube-transcript/scripts/transcript.js dQw4w9WgXcQ --timestamps
```

## Agent Workflow

1. Extract the YouTube URL or video ID from the user's message
2. Decide flags: `--lang` if user specifies a language, `--timestamps` if timing matters, `--max` for very long videos
3. Run the command and capture stdout
4. Use the transcript for the requested task (summarize, translate, analyze, save to file, etc.)

## Notes

- Accepts full URLs (youtube.com, youtu.be, embed) or bare 11-char video IDs
- No language specified = YouTube returns default track (usually English)
- HTML entities and encoding glitches are auto-cleaned
- Exit codes: 0=success, 1=invalid input, 2=empty transcript, 3=fetch error
- Dependency: `youtube-transcript-plus` (in `.opencode/package.json`)
