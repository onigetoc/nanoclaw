---
inclusion: auto
---

# Coding Standards

## File Size Limit

Files should NEVER exceed 600 lines of code. If a file approaches this limit:
- Refactor into smaller, focused modules
- Extract related functions into separate files
- Use clear, single-responsibility principles

## Package Manager

Always use `bun` instead of `npm` for all commands:
- `bun install` (not `npm install`)
- `bun run dev` (not `npm run dev`)
- `bun run build` (not `npm run build`)
- `bun add <package>` (not `npm install <package>`)

- Alway do the build `bun run build` for me, do not ask me to do it. this way you can see yourself if there's an error.
- Let me do the `bun run dev` or `bun start` because you have the tendency to do multiple of these and you open to many server or process.


## Code Organization

- Keep imports organized and minimal
- Group related functionality into modules
- Use clear, descriptive names
- Prefer composition over inheritance

## No Quick Fixes — Understand Before Changing

NEVER apply a quick fix to solve an immediate problem without understanding the impact on the rest of the project. A fix that solves one thing but breaks or complicates something else — now or in the future — is counter-productive and unacceptable.

Before making ANY code change:
- Understand the full context: what does this code interact with? What depends on it?
- Consider side effects: will this change break existing behavior, complicate future work, or create technical debt?
- If unsure about the impact, say so honestly instead of shipping a risky patch
- A problem left unfixed is better than a fix that creates two new problems

## Dynamic Over Hardcoded — CRITICAL RULE

NEVER hardcode lists of agents, workspaces, commands, or any user-configurable entities. EureClaw is designed so users can add their own agents, workspaces, channels, etc. Everything must be discovered dynamically at runtime.

NEVER solve a general problem with hardcoded keywords, word lists, or case-by-case string matching. If a solution requires adding entries to a list every time a new case appears, it's the wrong approach.

Examples of what NOT to do:
- Hardcoding agent names like `/plan`, `/build`, `/talk` as individual command handlers
- Hardcoding workspace names like `main`, `work` in dropdown options
- Hardcoding channel types instead of scanning registered channels
- Writing `if (agent === 'plan') ...` instead of a generic handler
- Classifying prompt complexity by checking `text.includes('weather')` or `text.includes('task')`
- Adding topic-specific instructions in prompts to fix one use case (e.g. weather-specific rules)
- Any keyword-based branching that doesn't scale without manual additions

Instead, ALWAYS:
- Scan directories (e.g., `.opencode/agents/*.md`) to discover entities
- Read config files (e.g., `opencode.json`) to discover entries
- Use generic handlers that work for any entity name
- Build UI options (dropdowns, lists) from runtime data, not static arrays
- Use Maps/registries with dynamic registration patterns
- Solve problems with generic mechanisms, configurable parameters, or model-level solutions

This applies to ALL features: agents, workspaces, commands, cron jobs, UI selectors, prompt classification, error handling, etc.
If a user adds a new agent file or workspace folder, it should work automatically without code changes.

## TypeScript

- Use strict type checking
- Avoid `any` types when possible
- Define interfaces for complex data structures
- Use type inference where appropriate
