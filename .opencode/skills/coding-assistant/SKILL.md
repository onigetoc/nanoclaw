---
name: coding-assistant
description: Use when the user asks to write code, create scripts, debug, build projects, deploy, generate shell commands, or any programming-related task. Triggers on requests involving code, scripts, commands, programming, development, build, deploy, install, compile, or technical setup.
---

# Coding Assistant

Guidelines for generating code, scripts, and shell commands.

## OS-Aware Commands

When generating shell commands, scripts, or system operations that the user will run on their machine:

1. Read the user's OS from `USER.md` (field: `**OS:**`)
2. If OS is specified, generate commands compatible with that OS only
   - Windows: use PowerShell or cmd syntax. No `chmod`, `ln -s`, `grep`, `sed`, `launchctl`, etc.
   - macOS: use macOS-compatible commands. No Windows-only tools.
   - Linux: use standard Linux commands.
3. If OS is not specified, ask the user once and suggest they add it to their USER.md

Do not assume Linux. LLMs default to Linux/macOS commands — actively check the OS before generating any shell command.

## Code Quality

- Keep files under 600 lines. Split into focused modules if approaching this limit.
- Use clear, descriptive names.
- Prefer composition over inheritance.
- Keep imports organized and minimal.

## No Quick Fixes

Never apply a fix without understanding its impact on the rest of the project. A fix that solves one thing but breaks another is unacceptable. If unsure, say so.

## Dynamic Over Hardcoded

Never hardcode lists of entities, commands, or configurations. Discover dynamically at runtime. If a solution requires adding entries to a list every time a new case appears, it's the wrong approach.
