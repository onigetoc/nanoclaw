---
name: my-workflow
description: A workflow that chains multiple skills together
version: 1.0.0
author: Your Name
keywords: [workflow, automation, pipeline]

prerequisites:
  skills: [setup, build, deploy]
  tools: []
  env_vars: []

capabilities:
  provides: [complete_deployment]
  consumes: [deployment_config]

execution:
  type: workflow
  timeout: 300000
  steps:
    - skill: setup
      description: Install dependencies and prepare environment
      on_failure: abort
      
    - skill: build
      description: Build the application
      params:
        target: production
        optimize: true
      on_failure: retry
      retry_count: 2
      
    - skill: deploy
      description: Deploy to production
      params:
        environment: production
      on_failure: abort
---

# My Workflow

A workflow skill that orchestrates multiple skills to accomplish a complex task.

## What It Does

This workflow automates a multi-step process by:
1. Setting up the environment
2. Building the application
3. Deploying to production

Each step is a separate skill that can be executed independently or as part of this workflow.

## Prerequisites

This workflow requires the following skills to be installed:
- `setup` - Environment setup
- `build` - Application build
- `deploy` - Deployment automation

Check prerequisites:
```typescript
const check = await mcp.check_skill_prerequisites({
  skill_name: 'my-workflow'
});
```

## Usage

### Via MCP Tool

```typescript
const result = await mcp.execute_skill({
  skill_name: 'my-workflow',
  params: {
    environment: 'production',
    version: '1.2.3'
  }
});
```

### Via Code

```typescript
import { SkillManager } from '../skill-manager/manager.js';
import { SkillExecutor } from '../skill-manager/executor.js';

const workflow = SkillManager.get('my-workflow');
const result = await SkillExecutor.execute(workflow, {
  environment: 'production',
  version: '1.2.3'
});
```

## Workflow Steps

### Step 1: Setup
- Installs dependencies
- Configures environment
- Validates prerequisites
- **On Failure:** Abort workflow

### Step 2: Build
- Compiles source code
- Optimizes assets
- Runs tests
- **On Failure:** Retry up to 2 times

### Step 3: Deploy
- Uploads build artifacts
- Updates production servers
- Verifies deployment
- **On Failure:** Abort workflow

## Parameters

Global parameters (passed to all steps):
- `environment` (string) - Target environment
- `version` (string) - Version to deploy

Step-specific parameters are defined in the workflow definition.

## Failure Handling

Each step can specify how to handle failures:

- **abort** - Stop the workflow immediately (default)
- **continue** - Skip the failed step and continue
- **retry** - Retry the step N times before aborting

Example:
```yaml
steps:
  - skill: flaky-task
    on_failure: retry
    retry_count: 3
    
  - skill: optional-task
    on_failure: continue
    
  - skill: critical-task
    on_failure: abort
```

## Output

Returns an array of results from each step:

```json
{
  "success": true,
  "output": [
    {
      "step": "setup",
      "success": true,
      "duration": 5000
    },
    {
      "step": "build",
      "success": true,
      "duration": 30000
    },
    {
      "step": "deploy",
      "success": true,
      "duration": 15000
    }
  ],
  "duration": 50000
}
```

## Examples

### Example 1: Full Deployment

```typescript
const result = await SkillExecutor.execute(workflow, {
  environment: 'production',
  version: '2.0.0',
  notify: true
});
```

### Example 2: Staging Deployment

```typescript
const result = await SkillExecutor.execute(workflow, {
  environment: 'staging',
  version: 'latest',
  skip_tests: false
});
```

### Example 3: Dry Run

```typescript
const dryRun = await SkillExecutor.dryRun(workflow);
console.log('Can execute:', dryRun.canExecute);
console.log('Issues:', dryRun.issues);
```

## Creating Custom Workflows

### 1. Define Steps

List the skills to execute in order:

```yaml
execution:
  type: workflow
  steps:
    - skill: step1
    - skill: step2
    - skill: step3
```

### 2. Add Descriptions

Help users understand what each step does:

```yaml
steps:
  - skill: validate
    description: Validate input data and configuration
```

### 3. Configure Failure Handling

Decide how to handle failures:

```yaml
steps:
  - skill: critical-step
    on_failure: abort
    
  - skill: flaky-step
    on_failure: retry
    retry_count: 3
    
  - skill: optional-step
    on_failure: continue
```

### 4. Pass Parameters

Pass step-specific parameters:

```yaml
steps:
  - skill: build
    params:
      target: production
      optimize: true
      
  - skill: deploy
    params:
      environment: production
      replicas: 3
```

## Advanced Features

### Conditional Execution

Use parameters to control which steps run:

```typescript
// In your workflow logic
if (params.skip_tests) {
  // Skip test step
}
```

### Parallel Execution

Currently, steps run sequentially. For parallel execution, create separate workflows and run them concurrently.

### Dynamic Steps

Generate steps dynamically based on input:

```typescript
const steps = params.environments.map(env => ({
  skill: 'deploy',
  params: { environment: env }
}));
```

## Monitoring

Track workflow progress:

```typescript
const result = await SkillExecutor.execute(workflow, params);

// Check logs
console.log(result.logs);

// Check individual step results
result.output.forEach((stepResult, i) => {
  console.log(`Step ${i + 1}:`, stepResult.success ? '✅' : '❌');
});
```

## Troubleshooting

### Workflow Aborted

Check which step failed:
```typescript
const failedStep = result.output.find(s => !s.success);
console.log('Failed at:', failedStep);
```

### Step Timeout

Increase workflow timeout:
```yaml
execution:
  timeout: 600000  # 10 minutes
```

### Missing Skill

Ensure all required skills are installed:
```bash
bun run list-skills
```

## Best Practices

1. **Keep steps focused** - Each step should do one thing well
2. **Handle failures gracefully** - Use appropriate failure strategies
3. **Add descriptions** - Help users understand the workflow
4. **Test individually** - Test each skill before adding to workflow
5. **Set reasonable timeouts** - Account for all steps
6. **Log progress** - Use send_message to report progress
7. **Make it idempotent** - Safe to run multiple times
