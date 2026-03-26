# Model Resolution

Use this guide when generating agents without explicit `model` or `temperature`.

## Source Priority

1. `opencode.json` (runtime source of truth)
2. `eureclaw.json` (project fallback)
3. hardcoded defaults (last resort)

## Mode Mapping

- `mode: primary`
  - model: `opencode.json.model`
  - fallback: `eureclaw.json.models.primary`

- `mode: subagent`
  - model: `opencode.json.small_model`
  - fallback: `eureclaw.json.models.small`

- `mode: all`
  - default to primary chain
  - use small-model chain only if explicitly requested by policy

## Temperature Defaults

- explicit `temperature` in agent frontmatter wins
- else keep existing policy from runtime config when available
- else recommended defaults:
  - `0.1` for deterministic creator/generator agents
  - `0.2` for orchestration/planning agents

## Stability Note

Free Opencode models can rotate over time.
Prefer config-driven resolution over hardcoding model ids in many agent files.
If you need to pin for reproducibility, set `model` explicitly in the generated agent.
