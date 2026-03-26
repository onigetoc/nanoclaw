# Agent Contract

Use this JSON contract when creating agents.

```json
{
  "requestId": "string-uuid",
  "agentName": "string-kebab-case",
  "version": "1.0.0",
  "mode": "all|primary|subagent",
  "model": "optional model id, e.g. opencode/big-pickle",
  "temperature": "optional number, e.g. 0.1",
  "purpose": "single clear responsibility",
  "triggerContext": {
    "userIntents": ["string"],
    "signals": ["string"],
    "priority": "low|normal|high"
  },
  "allowedTools": ["read", "edit"],
  "permission": {
    "skill": "allow|deny",
    "question": "allow|deny"
  },
  "delegationPolicy": {
    "callableBy": ["orchestrator"],
    "requiredTaskPermissions": ["orchestrator.permission.task.<agentName>=allow"]
  },
  "riskLevel": "low|medium|high",
  "inputSchema": {
    "type": "object",
    "required": ["task"],
    "properties": {
      "task": { "type": "string" }
    }
  },
  "outputContract": {
    "format": "json|markdown",
    "schema": {
      "type": "object",
      "required": ["status", "result"],
      "properties": {
        "status": { "type": "string", "enum": ["ok", "error"] },
        "result": { "type": "string" },
        "errors": {
          "type": "array",
          "items": { "type": "string" }
        }
      }
    }
  },
  "failurePolicy": {
    "mode": "retry|fallback|abort",
    "maxRetries": 1,
    "fallbackAgent": "optional-agent-name"
  },
  "activation": {
    "registration": "dynamic|pending-reload",
    "scope": "local|global"
  }
}
```

## Rules

- `agentName` must be unique and kebab-case
- `mode` must be one of `all`, `primary`, `subagent`
- `model` is optional
- `temperature` is optional
- `allowedTools` must be minimum necessary
- `allowedTools` values must be canonical Opencode names:
  - `bash`, `read`, `write`, `edit`, `list`, `glob`, `grep`, `webfetch`, `task`, `todowrite`, `todoread`
- Enable `permission.skill=allow` only if agent must load a skill dynamically
- Enable `permission.question=allow` only if agent must ask runtime questions
- If the agent must be called by another agent, require explicit `permission.task.<agentName>=allow` on each caller
- `outputContract` must be machine-testable
- `failurePolicy` must always be explicit
- `activation.registration` should default to `dynamic`

## Model And Temperature Resolution

When `model` or `temperature` are omitted, resolve with this priority:

1. `opencode.json` (preferred)
2. `eureclaw.json` (project fallback)
3. hard default (only if both config files do not provide a value)

Suggested mapping by mode:

- `primary`:
  - model -> `opencode.json.model` -> `eureclaw.json.models.primary`
- `subagent`:
  - model -> `opencode.json.small_model` -> `eureclaw.json.models.small`
- `all`:
  - model -> primary chain unless caller explicitly requests small-model preference

Temperature:

- explicit agent `temperature` wins
- else use existing agent-level conventions from `opencode.json` when available
- else use deterministic default `0.1` for strict generators, otherwise `0.2`
