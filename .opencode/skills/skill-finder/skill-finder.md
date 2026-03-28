---
name: skill-finder
description: Automatically search Skill Registry for relevant skills before starting tasks. Enhances Eureclaw's capabilities by finding specialized skills that can help with the current task.
---

# Skill Finder

A meta-skill that enhances Eureclaw's capabilities by automatically searching the Skill Registry for relevant skills before tackling tasks.

## Prerequisites

Install the Skill Registry CLI:
```bash
npm install -g @skillregistry/cli
# or
pnpm add -g @skillregistry/cli
```

## When to Use

Activate this skill **proactively** when:
- User asks to build, implement, or create something
- User asks about integrating a specific tool or service
- User mentions a technology, framework, or service by name
- The task involves a specific domain (Slack, Discord, Git, PostHog, etc.)

## Quick Start

Before starting any implementation task:

```bash
# Search for relevant skills
sr search "<keyword>"

# If relevant skill found, install it
sr install <skill-id>
```

## Workflow

### Step 1: Extract Keywords

From the user's request, identify:
- **Services**: Slack, Discord, GitHub, PostHog, Stripe, etc.
- **Frameworks**: Next.js, React, Vue, Express, Django, etc.
- **Tools**: Docker, Kubernetes, Terraform, etc.
- **Domains**: authentication, analytics, testing, deployment

### Step 2: Search the Registry

```bash
# Use the CLI to search
sr search "posthog"
sr search "nextjs auth"
sr search "slack"
```

The CLI will display matching skills in a formatted table.

### Step 3: Install Relevant Skills

If a matching skill is found:

```bash
# Install to default location (.opencode/<skill-id>/SKILL.md)
sr install <skill-id>

# Or install to custom path
sr install <skill-id> --path ./my-skills/SKILL.md
```

### Step 4: Read and Apply

After installing, read the skill and apply its patterns:

```bash
# The skill is now at .opencode/<skill-id>/SKILL.md
cat .opencode/<skill-id>/SKILL.md
```

## Example Workflows

### "Add PostHog analytics to my Next.js app"

```bash
# 1. Search for relevant skills
sr search "posthog"

# Output shows: posthog-nextjs-app-router

# 2. Install the skill
sr install posthog-nextjs-app-router

# 3. Read and follow the skill's instructions
cat .opencode/posthog-nextjs-app-router/SKILL.md
```

### "Set up Slack notifications"

```bash
# 1. Search
sr search "slack"

# 2. Install
sr install slack

# 3. Apply the Slack patterns from the skill
```

### "Create a CLI tool"

```bash
# 1. Search for CLI-related skills
sr search "cli"

# 2. Review and install relevant ones
sr install <relevant-skill-id>
```

## CLI Commands Reference

| Command | Description |
|---------|-------------|
| `sr` | Launch interactive mode |
| `sr search <query>` | Search for skills |
| `sr search <query> --limit 10` | Search with custom limit |
| `sr install <id>` | Install skill to `.opencode/<id>/SKILL.md` |
| `sr install <id> --path <path>` | Install to custom path |
| `sr help` | Show help |

## Interactive Mode

You can also use the CLI interactively:

```bash
sr
# Opens interactive prompt

❯ search posthog
# Shows results

❯ install posthog-nextjs-app-router
# Installs the skill

❯ exit
# Exit the CLI
```

## Search Tips

| Strategy | Command |
|----------|---------|
| Specific service | `sr search "posthog"` |
| Framework | `sr search "nextjs"` |
| Domain | `sr search "auth"` |
| Multiple terms | `sr search "nextjs analytics"` |

## Decision Matrix

| Scenario | Action |
|----------|--------|
| Exact match found | `sr install <skill-id>` and follow it |
| Related skill found | Install and use for best practices |
| No skills found | Proceed with general knowledge |

## Best Practices

1. **Search early**: Run `sr search` before starting implementation
2. **Be specific**: `sr search "posthog nextjs"` > `sr search "analytics"`
3. **Limit searches**: 1-3 targeted searches per task
4. **Combine skills**: Install multiple related skills when needed
5. **Validate**: Cross-reference skill advice with official docs

## Fallback (if CLI not installed)

If the CLI is not available, use curl:

```bash
# Search
curl -s "https://skillregistry.io/api/skills?search=<keyword>"

# Download skill
curl -s "https://skillregistry.io/skills/<skill-id>.md" > SKILL.md
```