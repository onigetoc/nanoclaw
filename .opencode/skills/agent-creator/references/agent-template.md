# Agent Definition Template

Use this template to generate an Opencode-compatible agent definition.

---
name: <agent-name-kebab-case>
description: Use this agent when <clear invoke conditions>. Must include at least two <example> and <commentary> XML tags to illustrate typical user contexts and invocation logic.
mode: <all|primary|subagent>
tools: <comma-separated Opencode tools from bash, read, write, edit, list, glob, grep, webfetch, task, todowrite, todoread>
color: <blue|red|green|yellow|purple|orange|pink|cyan>
model: <optional model id, e.g. opencode/big-pickle>
temperature: <optional decimal, e.g. 0.1>
permission: <optional object, e.g. { skill: allow, question: deny }>
delegationPolicy: <optional object, e.g. { callableBy: ["orchestrator"], requiredTaskPermissions: ["orchestrator.permission.task.<agent-name>=allow"] }>
---

## Role
You are an expert in <domain>. Your job is to <single responsibility>.

## Invocation Criteria
- Trigger on: <intent/signal 1>
- Trigger on: <intent/signal 2>
- Do not trigger for: <out-of-scope cases>

## Systematic Process
1. Validate inputs against the expected schema
2. Execute only allowed tools
3. Produce output matching the output contract
4. Return explicit errors when constraints are violated

## Runtime Permissions
- If needed, require `opencode.json` `permission.skill: allow`
- If needed, require `opencode.json` `permission.question: allow`
- Do not require extra permissions unless strictly necessary

## Delegation
- If this agent is meant to be called by another agent (e.g. `@orchestrator`), specify the exact patch to add in `opencode.json`:
  - `permission.task.<agent-name>: "allow"`
- List all parent agents that must be updated.
- Add a negative test: "delegation should fail before permission update"
- Add a positive test: "delegation succeeds after permission update"
- If delegation is not required, state this explicitly.

## Model Selection
- `model` is optional in frontmatter
- If omitted, resolve defaults from `opencode.json` first, then `eureclaw.json`
- `temperature` is optional and should default to deterministic settings for generator-like agents

## Constraints
- Keep scope narrow and deterministic
- Do not perform actions outside allowed tools
- Prefer explicit assumptions over hidden inference

## Output Contract
Return exactly:
```json
{
  "status": "ok|error",
  "result": "string",
  "errors": ["string"]
}
```

## Examples
<example>
Context: User asks for <example request>
assistant: I will use <agent-name> for this task.
<commentary>Reason this agent is appropriate.</commentary>
</example>
<example>
Context: User requests <another example>
assistant: <agent-name> is triggered due to <reason>.
<commentary>Why this agent is the best fit for this scenario.</commentary>
</example>

## Checklist
- [ ] Agent has one clear responsibility
- [ ] Name is unique and kebab-case
- [ ] Tool allowlist is explicit and minimal
- [ ] Mode is explicitly set
- [ ] Model/temperature resolved or explicit
- [ ] Output contract is strict and testable
- [ ] Delegation permissions are documented and tested

## Notes
- Keep descriptions concrete and trigger-oriented
- Keep tools minimal
- Set `mode` explicitly; default to `all` only when scope truly spans both primary and subagent contexts
- Set `model` and `temperature` explicitly when reproducibility matters
- Keep the process executable by another orchestrator
