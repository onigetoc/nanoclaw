## Strict Output Format (Opencode)

When generating an agent definition, always :
- Commence par EXACTEMENT trois tirets `---` en première ligne, sans texte ni ligne vide avant.
- YAML frontmatter avec les champs suivants, dans cet ordre :
   - name, description (avec au moins deux <example> et <commentary> XML), mode, tools (liste canonique), color, model (optionnel), temperature (optionnel), permission (optionnel), delegationPolicy (optionnel)
- Après le YAML, markdown structuré :
   - Rôle, critères d’invocation, process systématique, permissions, délégation (avec patch opencode.json si besoin), sélection modèle/température, contraintes, output contract, exemples XML, checklist, notes
- Toujours inclure au moins deux blocs <example> et un <commentary> par agent
- Si l’agent doit être appelé par un parent, ajouter la section Delegation avec le patch exact à appliquer dans opencode.json (permission.task)
- Utiliser une checklist pour la validation finale

Voir le template dans `references/agent-template.md` pour la structure complète.
---
name: agent-creator
description: Create or update runnable agents for the EureClaw ecosystem. Use when the user asks to create a new agent, bootstrap an agent from a role, add an agent for a specific workflow, or evolve an existing agent safely without full runtime reload.
---

# Agent Creator

Create agents in a deterministic, orchestrator-friendly way.

## Platform Target

This skill targets Opencode agents and Opencode permissions.

Canonical tool names for Opencode:
- `bash`
- `read`
- `write`
- `edit`
- `list`
- `glob`
- `grep`
- `webfetch`
- `task`
- `todowrite`
- `todoread`

Optional permissions (via `opencode.json`):
- `skill`: load a skill file (`SKILL.md`) during execution
- `question`: ask the user questions during execution

Agent mode values:
- `all` (default)
- `primary`
- `subagent`

## Primary Goal

Produce agent definitions and files that can be registered incrementally by the orchestrator, validated quickly, and used immediately.

Use this skill when requests include:
- "create a new agent"
- "generate a specialist agent"
- "bootstrap an agent for <task>"
- "update this agent behavior"
- "make my orchestrator spawn agents on demand"

## Operating Rules

1. Prefer deterministic outputs over free-form prose.
2. Keep output schema-first: generate machine-parseable metadata first, then body.
3. Never require a full process restart as the default path.
4. Design for incremental registration: create -> validate -> register -> activate.
5. Keep agents minimal on first creation (MVP), then iterate.

## Required Inputs

Collect or infer these fields before generating artifacts:
- `agentName` (kebab-case, all lowercase, no spaces, unique)
**WARNING:**
- The agent name MUST be all lowercase (kebab-case) everywhere (opencode.json, .md filename, YAML frontmatter).
- Always generate a corresponding `<agentName>.md` file in `.opencode/agents/` for every agent, even primary ones. Without this file, the agent will not have a prompt/context and may not function.
- `purpose` (single responsibility)
- `triggerContext` (when orchestrator should use it)
- `allowedTools` (explicit allowlist)
- `mode` (`all`, `primary`, `subagent`)
- `model` (optional)
- `temperature` (optional)
- `riskLevel` (`low`, `medium`, `high`)
- `outputContract` (JSON shape or strict markdown schema)
- `permission` (whether `skill` and/or `question` is required)
- `delegationPolicy` (which parent agents can call this agent via `permission.task`)

If `model` and/or `temperature` are not provided, resolve defaults using:
1. `opencode.json` (preferred source)
2. `eureclaw.json` (project-level fallback source)

Model fallback strategy:
- `mode=primary` -> prefer `opencode.json.model`, then `eureclaw.json.models.primary`
- `mode=subagent` -> prefer `opencode.json.small_model`, then `eureclaw.json.models.small`
- `mode=all` -> prefer primary defaults unless a small-model-only policy is explicitly requested

Temperature fallback strategy:
- prefer explicit agent value
- else use existing agent-level temperature policy in `opencode.json` when present
- else default to `0.2` for orchestration-style agents or `0.1` for strict deterministic agents

If one or more fields are missing, ask concise clarification questions.

## Workflow

1. Clarify scope and responsibility
2. Read runtime model defaults from `opencode.json` and project fallbacks from `eureclaw.json`
3. Build agent spec using the contract in `references/agent-contract.md`
4. Generate agent definition using template in `references/agent-template.md`
5. Validate naming, tools, mode, and model/temperature compatibility
6. Return artifacts + integration notes for incremental runtime registration
7. Verify delegation permissions are updated in `opencode.json` for parent agents that must call the new agent

## Validation Checklist

- [ ] Agent has one clear responsibility
- [ ] Name is unique, all lowercase, and kebab-case (no uppercase, no spaces)
- [ ] A file `<agentName>.md` exists in `.opencode/agents/` (required for all agents)
- [ ] Tool allowlist is explicit and minimal
- [ ] Tools only use canonical Opencode names
- [ ] Mode is explicitly set (`all|primary|subagent`)
- [ ] `model` is explicit or resolved from config fallback chain
- [ ] `temperature` is explicit or resolved from config fallback chain
- [ ] Output contract is strict and testable
- [ ] Failure behavior is defined (`retry`, `fallback`, `abort`)
- [ ] Activation path avoids global reload when possible
- [ ] Delegation path is explicit: parent agent `permission.task.<agentName>=allow` is defined where required

## Output Requirements

When creating an agent, always return:
1. `Agent Spec` as structured JSON (from `references/agent-contract.md`)
2. `Agent Definition` (YAML frontmatter + markdown body)
3. `Activation Notes` with:
   - registration mode (`dynamic` preferred)
   - fallback mode (`pending-reload` if dynamic load unavailable)
   - quick verification steps
   - delegation updates required in `opencode.json` (`permission.task` allowlist)

When creating a subagent intended to be callable by `@orchestrator` or other parent agents, always include:
- exact `opencode.json` patch suggestion for `permission.task.<new-agent-name>: "allow"`
- list of parent agents that must be updated (`orchestrator`, `task-executor`, etc.)
- a short negative test: "delegation should fail before permission update"
- a short positive test: "delegation succeeds after permission update"

## Integration Guidance For Orchestrator

Default lifecycle:
- `creating` -> `validating` -> `ready`

Failure lifecycle:
- `creating` -> `validating` -> `failed`

Registration strategy:
- Prefer targeted registry refresh for the new agent only
- Avoid full runtime restart unless no dynamic registration path exists

## References

- Contract: `references/agent-contract.md`
- Template: `references/agent-template.md`
- Config resolution: `references/model-resolution.md`
