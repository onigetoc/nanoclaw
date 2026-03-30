---
name: checklist-planner
description: Breaks down any user request into an ordered checklist, persists it to the current workspace tasks folder, and tracks execution step by step. Use when the user asks to build, refactor, implement, or execute any multi-step task.
---

# Checklist Planner or Todo List Planner

Can be used as a Checklist or a Todo list generator when asked by the user.

## Step 1 — Detect workspace

Read the workspace name from context:
- Look for `[WORKSPACE: {name}]` in the prompt
- Or check the runtime environment for "Current workspace folder"
- If prompt contains `[CUSTOM_PATH: ...]`, use that path instead
- NEVER assume or default to `main`

## Step 2 — Create the checklist file

- Build the file path: `workspaces/{workspace}/tasks/{filename}.md`
- Filename rules: kebab-case, descriptive, `.md`
- Good examples: `refactor-button-cva.md`, `add-auth-flow.md`, `setup-tailwind-config.md`
- Avoid generic names like `tasks.md`
- Create the `tasks/` directory if it does not exist
- Write the file with this exact format:
```md
## Checklist

- [ ] Task description
- [ ] Task description
- [ ] Task description
```

## Step 3 — Display and execute

- Print the full checklist in terminal before starting
- Execute tasks one by one, in order
- After each completed task, update `- [ ]` to `- [x]` in the file and reprint the list
- Continue until every box is checked

## Adapting complexity

Scale the checklist depth to the request and context provided by the user:
- Simple fix → 3-5 tasks
- Feature implementation → 5-10 tasks
- Full flow or architecture → 10+ tasks with setup and verification steps

For web app projects, always include: dependency installs, file reads before edits, and a verification step at the end.

If the user request is underspecified, infer the most reasonable professional implementation with HIGH quality standards.

## Task writing rules

- One checkbox level only — no nesting
- Each task = one concrete action
- Include dependency/setup steps when required
- Tasks must be in strict execution order

### Avoid vague wording

- "handle if needed"
- "review"
- "improve"
- "etc."
- "summarize" (without specifying length/format)
- "analyze" (without specifying what to look for)

### Task quality bar

Each task must be:

- **atomic** — One clear action, not multiple steps
- **actionable** — Executor knows exactly what to do
- **specific** — Includes filenames, formats, counts (e.g., "500 words", "5 sources")
- **measurable** — Clear success criteria (e.g., "until you have 10 examples")
- **detailed** — Specifies what to include, exclude, format, depth
- **sequential** — In correct execution order with dependencies

### BAD vs GOOD

❌ "Analyze the data to identify trends"
✅ "Analyze temperature data from all 5 sources, calculate year-over-year percentages, identify top 3 trends, create comparison table"

❌ "Search for recent data"
✅ "Search NASA, NOAA, IPCC for 2024-2025 temperature anomaly data. Extract: global avg temps, regional breakdowns, ocean heat content. Save raw data with source URLs."

❌ "Synthesize findings into a report"
✅ "Write 500+ word report with: Executive Summary (3-5 findings), Detailed Analysis (one paragraph per finding with data), Implications, Conclusion. Cite sources inline."

## Format constraints

- Single checkbox level only
- All checkboxes start unchecked
- No commentary inside the file
- No code fences inside the file
- No nested tasks

## Example

Request: "Refactor Button component to use cva"

File: `workspaces/{workspace}/tasks/refactor-button-cva.md`
```md
## Checklist

- [ ] Read src/components/ui/button.tsx
- [ ] Install class-variance-authority with npm
- [ ] Rewrite Button using cva() for variant classes
- [ ] Update Button props types to match new variants
- [ ] Verify visual output matches original
```