# Session Context (Auto-generated)

**Generated:** 2026-02-25T06:13:37.744Z

This context is automatically injected at the start of each OpenCode session.
It provides the orchestrator with up-to-date information about available capabilities.

## Available Agents

- **@planner** (subagent): ---
- **@researcher** (subagent): ---
- **@summarizer** (subagent): ---
- **@task-executor** (subagent): Executes task plans from groups/{group}/tasks/
- **@task-planner** (subagent): Creates task plans in groups/{group}/tasks/

## Available Skills

- **add-gmail**: ---
- **add-parallel**: Adds Parallel AI MCP integration to EureClaw for advanced web research capabilities.
- **add-telegram**: ---
- **add-telegram-swarm**: ---
- **add-voice-transcription**: ---
- **browser-playwright**: ---
- **change-model**: Change the AI model used by OpenCode/EureClaw. Use when user requests to switch models, change to a different AI provider, or asks what model is currently being used. Triggers on "change model", "switch model", "use model", "set model".
- **convert-to-docker**: ---
- **customize**: ---
- **debug**: ---
- **setup**: ---
- **setup-browser**: ---
- **skill-creator**: ---
- **skill-manager**: ---
- **web-search**: ---
- **x-integration**: ---

## Usage Guidelines

**For the Orchestrator:**
- Choose agents based on semantic understanding of user intent, not keyword matching
- Support multilingual requests (English, French, Chinese, etc.)
- Understand variations in phrasing ("create task", "make a plan", "créer une tâche", etc.)
- Use @task-planner for structured task planning, regardless of how the user phrases it
- Automatically chain @task-planner → @task-executor when you see PLAN_CREATED output

**Agent Selection Strategy:**
1. Understand what the user wants to accomplish
2. Choose the most appropriate agent for that goal
3. Don't rely on exact keyword matches
4. Consider the context and intent, not just the words used
