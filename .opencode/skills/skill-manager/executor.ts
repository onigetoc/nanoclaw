/**
 * Skill Executor
 * Executes skills based on their type (script, mcp, workflow)
 */

import { spawn } from 'child_process';
import path from 'path';
import type { SkillDefinition, ExecutionResult, WorkflowStep } from './types.js';
import { SkillManager } from './manager.js';
import { SkillValidator } from './validator.js';

export class SkillExecutor {
  /**
   * Execute a skill with given parameters
   */
  static async execute(
    skill: SkillDefinition,
    params: Record<string, any> = {}
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const logs: string[] = [];

    try {
      // Check prerequisites first
      const prereqCheck = await SkillValidator.checkPrerequisites(skill);
      if (!prereqCheck.satisfied) {
        return {
          success: false,
          error: `Prerequisites not satisfied: ${prereqCheck.details.join(', ')}`,
          duration: Date.now() - startTime,
          logs,
        };
      }

      // Execute based on type
      let result: ExecutionResult;

      switch (skill.execution.type) {
        case 'script':
          result = await this.executeScript(skill, params, logs);
          break;

        case 'mcp':
          result = {
            success: false,
            error: 'MCP skills cannot be executed directly. They provide tools to the agent.',
            duration: Date.now() - startTime,
            logs,
          };
          break;

        case 'workflow':
          result = await this.executeWorkflow(skill, params, logs);
          break;

        default:
          result = {
            success: false,
            error: `Unknown execution type: ${skill.execution.type}`,
            duration: Date.now() - startTime,
            logs,
          };
      }

      result.duration = Date.now() - startTime;
      result.logs = logs;

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        logs,
      };
    }
  }

  /**
   * Execute a script-type skill
   */
  private static async executeScript(
    skill: SkillDefinition,
    params: Record<string, any>,
    logs: string[]
  ): Promise<ExecutionResult> {
    return new Promise((resolve) => {
      const entryPoint = path.join(skill.directory, skill.execution.entry_point!);
      const timeout = skill.execution.timeout || 60000;

      logs.push(`Executing script: ${entryPoint}`);
      logs.push(`Parameters: ${JSON.stringify(params)}`);

      // Spawn the script process
      const proc = spawn('node', [entryPoint], {
        cwd: skill.directory,
        env: {
          ...process.env,
          SKILL_PARAMS: JSON.stringify(params),
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        const text = data.toString();
        stdout += text;
        logs.push(`[stdout] ${text.trim()}`);
      });

      proc.stderr.on('data', (data) => {
        const text = data.toString();
        stderr += text;
        logs.push(`[stderr] ${text.trim()}`);
      });

      // Timeout handler
      const timer = setTimeout(() => {
        proc.kill('SIGTERM');
        resolve({
          success: false,
          error: `Script timed out after ${timeout}ms`,
          duration: 0,
        });
      }, timeout);

      proc.on('close', (code) => {
        clearTimeout(timer);

        if (code === 0) {
          resolve({
            success: true,
            output: stdout,
            duration: 0,
          });
        } else {
          resolve({
            success: false,
            error: `Script exited with code ${code}`,
            output: { stdout, stderr },
            duration: 0,
          });
        }
      });

      proc.on('error', (error) => {
        clearTimeout(timer);
        resolve({
          success: false,
          error: error.message,
          duration: 0,
        });
      });

      // Send params via stdin
      if (Object.keys(params).length > 0) {
        proc.stdin.write(JSON.stringify(params));
        proc.stdin.end();
      }
    });
  }

  /**
   * Execute a workflow-type skill
   */
  private static async executeWorkflow(
    skill: SkillDefinition,
    params: Record<string, any>,
    logs: string[]
  ): Promise<ExecutionResult> {
    const steps = skill.execution.steps || [];
    const results: any[] = [];

    logs.push(`Starting workflow with ${steps.length} steps`);

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      logs.push(`\n--- Step ${i + 1}/${steps.length}: ${step.skill} ---`);
      if (step.description) {
        logs.push(`Description: ${step.description}`);
      }

      const result = await this.executeWorkflowStep(step, params, logs);
      results.push(result);

      if (!result.success) {
        const onFailure = step.on_failure || 'abort';

        if (onFailure === 'abort') {
          logs.push(`Step failed, aborting workflow`);
          return {
            success: false,
            error: `Workflow aborted at step ${i + 1}: ${result.error}`,
            output: results,
            duration: 0,
          };
        } else if (onFailure === 'retry') {
          const retryCount = step.retry_count || 1;
          logs.push(`Step failed, retrying ${retryCount} times...`);

          let retrySuccess = false;
          for (let retry = 0; retry < retryCount; retry++) {
            logs.push(`Retry ${retry + 1}/${retryCount}`);
            const retryResult = await this.executeWorkflowStep(step, params, logs);

            if (retryResult.success) {
              retrySuccess = true;
              results[results.length - 1] = retryResult;
              break;
            }
          }

          if (!retrySuccess) {
            logs.push(`All retries failed, aborting workflow`);
            return {
              success: false,
              error: `Workflow aborted at step ${i + 1} after ${retryCount} retries`,
              output: results,
              duration: 0,
            };
          }
        } else {
          // continue
          logs.push(`Step failed, continuing to next step`);
        }
      }
    }

    logs.push(`\nWorkflow completed successfully`);

    return {
      success: true,
      output: results,
      duration: 0,
    };
  }

  /**
   * Execute a single workflow step
   */
  private static async executeWorkflowStep(
    step: WorkflowStep,
    globalParams: Record<string, any>,
    logs: string[]
  ): Promise<ExecutionResult> {
    const stepSkill = SkillManager.get(step.skill);

    if (!stepSkill) {
      return {
        success: false,
        error: `Skill not found: ${step.skill}`,
        duration: 0,
      };
    }

    // Merge global params with step-specific params
    const mergedParams = { ...globalParams, ...step.params };

    return await this.execute(stepSkill, mergedParams);
  }

  /**
   * Dry run - validate without executing
   */
  static async dryRun(skill: SkillDefinition): Promise<{
    canExecute: boolean;
    issues: string[];
    warnings: string[];
  }> {
    const issues: string[] = [];
    const warnings: string[] = [];

    // Validate skill structure
    const validation = SkillManager.validate(skill);
    if (!validation.valid) {
      issues.push(...validation.errors);
    }
    warnings.push(...validation.warnings);

    // Check prerequisites
    const prereqCheck = await SkillValidator.checkPrerequisites(skill);
    if (!prereqCheck.satisfied) {
      issues.push(...prereqCheck.details);
    }

    // Check workflow dependencies
    if (skill.execution.type === 'workflow') {
      for (const step of skill.execution.steps || []) {
        const stepSkill = SkillManager.get(step.skill);
        if (!stepSkill) {
          issues.push(`Workflow step references unknown skill: ${step.skill}`);
        }
      }
    }

    return {
      canExecute: issues.length === 0,
      issues,
      warnings,
    };
  }
}
