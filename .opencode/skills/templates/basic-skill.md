---
name: my-basic-skill
description: A simple script-based skill that performs a specific task
version: 1.0.0
author: Your Name
keywords: [example, template, basic]

prerequisites:
  tools: [node]
  env_vars: []
  files: []
  min_node_version: "18.0.0"

capabilities:
  provides: [my_action]
  consumes: [input_data]

execution:
  type: script
  entry_point: ./scripts/main.ts
  timeout: 60000
---

# My Basic Skill

A simple skill that demonstrates the basic structure and execution model.

## What It Does

This skill performs a specific task by executing a TypeScript script. It's useful for:
- Standalone operations
- File processing
- Data transformation
- System automation

## Installation

No additional installation required. The skill uses standard Node.js.

## Usage

### Via MCP Tool

```typescript
const result = await mcp.execute_skill({
  skill_name: 'my-basic-skill',
  params: {
    input: 'some data',
    option: true
  }
});
```

### Via Code

```typescript
import { SkillManager } from '../skill-manager/manager.js';
import { SkillExecutor } from '../skill-manager/executor.js';

const skill = SkillManager.get('my-basic-skill');
const result = await SkillExecutor.execute(skill, {
  input: 'some data',
  option: true
});
```

## Parameters

- `input` (string, required) - The input data to process
- `option` (boolean, optional) - Enable optional feature

## Output

Returns a JSON object with:
```json
{
  "success": true,
  "result": "processed data",
  "metadata": {
    "timestamp": "2026-02-24T12:00:00Z"
  }
}
```

## Examples

### Example 1: Basic Usage

```bash
# Via skill executor
execute_skill my-basic-skill --input "hello world"
```

### Example 2: With Options

```typescript
const result = await SkillExecutor.execute(skill, {
  input: 'data',
  option: true,
  verbose: true
});
```

## Implementation

The script receives parameters via:
1. Environment variable `SKILL_PARAMS` (JSON string)
2. stdin (JSON object)

Example script structure:

```typescript
// scripts/main.ts
const params = JSON.parse(process.env.SKILL_PARAMS || '{}');

async function main() {
  console.log('Processing:', params.input);
  
  // Your logic here
  const result = processData(params.input);
  
  // Output result
  console.log(JSON.stringify({
    success: true,
    result
  }));
}

main().catch(error => {
  console.error(JSON.stringify({
    success: false,
    error: error.message
  }));
  process.exit(1);
});
```

## Error Handling

The script should:
- Exit with code 0 on success
- Exit with non-zero code on failure
- Output errors to stderr
- Output results to stdout as JSON

## Testing

```bash
# Test the script directly
cd .opencode/skills/my-basic-skill
SKILL_PARAMS='{"input":"test"}' node scripts/main.ts

# Test via skill manager
bun run test-skill my-basic-skill
```

## Troubleshooting

### Script Not Found

Ensure `scripts/main.ts` exists and is executable.

### Timeout

Increase the timeout in SKILL.md:
```yaml
execution:
  timeout: 120000  # 2 minutes
```

### Missing Dependencies

Install required packages:
```bash
cd .opencode/skills/my-basic-skill
bun install
```
