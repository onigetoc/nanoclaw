---
name: skill-manager
description: Manage, discover, and execute OpenCode skills. Provides tools for listing, validating, and running skills.
version: 1.0.0
author: EureClaw Team
keywords: [skills, management, discovery, execution, workflow]

prerequisites:
  tools: [node]
  min_node_version: "18.0.0"

capabilities:
  provides: [list_skills, execute_skill, validate_skill, check_prerequisites]
  mcp_tools: [list_skills, execute_skill, check_skill_prerequisites, skill_info]

execution:
  type: mcp
  tools_file: ./mcp-tools.ts
---

# Skill Manager

The Skill Manager is the core system for managing OpenCode skills. It provides discovery, validation, and execution capabilities for all skills in the `.opencode/skills/` directory.

## Features

- **Automatic Discovery**: Scans and indexes all available skills
- **Validation**: Checks skill definitions and prerequisites
- **Execution**: Runs script and workflow-type skills
- **Dependency Management**: Tracks skill dependencies
- **Search**: Find skills by name, keywords, or capabilities
- **Caching**: Fast access to skill metadata

## Architecture

### Skill Types

1. **Script Skills**: Execute standalone scripts
2. **MCP Skills**: Provide tools to the agent (cannot be executed directly)
3. **Workflow Skills**: Chain multiple skills together

### Components

- `manager.ts` - Main interface for skill operations
- `parser.ts` - Parses SKILL.md files
- `validator.ts` - Validates prerequisites and structure
- `executor.ts` - Executes skills
- `types.ts` - TypeScript type definitions

## Usage

### Via MCP Tools (in agent)

```typescript
// List all available skills
const skills = await mcp.list_skills();

// Get detailed info about a skill
const info = await mcp.skill_info({ skill_name: 'setup' });

// Check if prerequisites are satisfied
const check = await mcp.check_skill_prerequisites({ skill_name: 'x-integration' });

// Execute a skill
const result = await mcp.execute_skill({
  skill_name: 'setup',
  params: { skipAuth: false }
});
```

### Via Code

```typescript
import { SkillManager } from './.opencode/skills/skill-manager/manager.js';

// Discover all skills
const skills = SkillManager.discover();

// Get a specific skill
const skill = SkillManager.get('setup');

// Search for skills
const results = SkillManager.search({
  query: 'docker',
  type: 'script'
});

// Validate a skill
const validation = SkillManager.validate(skill);

// Check prerequisites
const prereqCheck = await SkillManager.checkPrerequisites(skill);

// Execute a skill
import { SkillExecutor } from './.opencode/skills/skill-manager/executor.js';
const result = await SkillExecutor.execute(skill, { param1: 'value' });
```

## Creating New Skills

### 1. Create Skill Directory

```bash
mkdir .opencode/skills/my-skill
cd .opencode/skills/my-skill
```

### 2. Create SKILL.md

```markdown
---
name: my-skill
description: What this skill does
version: 1.0.0
keywords: [keyword1, keyword2]

prerequisites:
  skills: []
  tools: [node]
  env_vars: []
  files: []

capabilities:
  provides: [action1, action2]
  consumes: [input1]

execution:
  type: script
  entry_point: ./scripts/main.ts
  timeout: 60000
---

# My Skill

Detailed documentation...
```

### 3. Create Implementation

For script skills:
```bash
mkdir scripts
touch scripts/main.ts
```

For MCP skills:
```bash
touch agent.ts
touch host.ts
```

### 4. Test Your Skill

```typescript
import { SkillManager } from '../skill-manager/manager.js';

const skill = SkillManager.get('my-skill');
const validation = SkillManager.validate(skill);
console.log(validation);

const prereqCheck = await SkillManager.checkPrerequisites(skill);
console.log(prereqCheck);
```

## Skill Definition Format

### Metadata

```yaml
name: skill-name              # Required: unique identifier
description: Short description # Required
version: 1.0.0                # Semantic version
author: Your Name             # Optional
keywords: [tag1, tag2]        # For discovery
```

### Prerequisites

```yaml
prerequisites:
  skills: [other-skill]       # Required skills
  tools: [docker, git]        # System tools
  env_vars: [API_KEY]         # Environment variables
  files: [.env, config.json]  # Required files
  min_node_version: "18.0.0"  # Minimum Node version
```

### Capabilities

```yaml
capabilities:
  provides: [action1, action2] # What this skill does
  consumes: [input1, input2]   # What it needs
  mcp_tools: [tool1, tool2]    # MCP tools it registers
```

### Execution

#### Script Type
```yaml
execution:
  type: script
  entry_point: ./scripts/main.ts
  timeout: 60000
```

#### MCP Type
```yaml
execution:
  type: mcp
  tools_file: ./agent.ts
  host_handler: ./host.ts
```

#### Workflow Type
```yaml
execution:
  type: workflow
  steps:
    - skill: step1
      description: First step
      params: { key: value }
      on_failure: abort
    - skill: step2
      description: Second step
      on_failure: continue
```

## Workflow Execution

Workflows chain multiple skills together:

```yaml
execution:
  type: workflow
  steps:
    - skill: setup
      description: Install dependencies
      on_failure: abort
      
    - skill: build
      description: Build the project
      params: { target: production }
      on_failure: retry
      retry_count: 2
      
    - skill: deploy
      description: Deploy to production
      on_failure: abort
```

### Failure Handling

- `abort` - Stop workflow immediately (default)
- `continue` - Skip failed step and continue
- `retry` - Retry the step N times before aborting

## Best Practices

1. **Clear Names**: Use descriptive, lowercase-with-hyphens names
2. **Keywords**: Add relevant keywords for discovery
3. **Prerequisites**: Declare all dependencies explicitly
4. **Validation**: Test your skill with `SkillManager.validate()`
5. **Documentation**: Write clear usage examples
6. **Error Handling**: Handle errors gracefully in scripts
7. **Timeouts**: Set reasonable timeouts for long-running operations
8. **Idempotency**: Make skills safe to run multiple times

## Troubleshooting

### Skill Not Found

```bash
# Clear cache and rescan
SkillManager.clearCache();
const skills = SkillManager.discover(true);
```

### Prerequisites Not Satisfied

```typescript
const check = await SkillManager.checkPrerequisites(skill);
console.log(check.missing);
console.log(check.details);
```

### Validation Errors

```typescript
const validation = SkillManager.validate(skill);
console.log(validation.errors);
console.log(validation.warnings);
```

### Execution Failures

```typescript
const result = await SkillExecutor.execute(skill, params);
if (!result.success) {
  console.log(result.error);
  console.log(result.logs);
}
```

## API Reference

### SkillManager

- `discover(forceRefresh?)` - Scan and return all skills
- `get(name)` - Get a specific skill
- `search(options)` - Search for skills
- `validate(skill)` - Validate skill structure
- `checkPrerequisites(skill)` - Check if prerequisites are met
- `install(options)` - Install a skill from path
- `uninstall(name)` - Remove a skill
- `list()` - List all skills with status
- `getDependencies(name)` - Get skill dependencies
- `clearCache()` - Clear the skill cache

### SkillExecutor

- `execute(skill, params)` - Execute a skill
- `dryRun(skill)` - Validate without executing

### SkillParser

- `parse(filePath)` - Parse a SKILL.md file
- `validate(skill)` - Validate skill structure
- `extractExamples(content)` - Extract code examples
- `extractUsage(content)` - Extract usage section

### SkillValidator

- `checkPrerequisites(skill)` - Check all prerequisites
- `validate(skill)` - Validate skill definition

## Examples

See the `templates/` directory for example skill definitions:

- `basic-skill.md` - Simple script skill
- `mcp-skill.md` - MCP tool provider
- `workflow-skill.md` - Multi-step workflow

## Integration

The Skill Manager integrates with:

- **Agent Runner**: Loads MCP tools from skills
- **IPC System**: Executes skills via IPC messages
- **OpenCode SDK**: Provides skill tools to agents

## Future Enhancements

- Remote skill repositories
- Skill versioning and updates
- Skill marketplace
- Automatic dependency resolution
- Skill templates generator
- Performance metrics
- Skill testing framework
