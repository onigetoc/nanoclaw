/**
 * Skill Validator
 * Checks prerequisites and validates skill definitions
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import type { SkillDefinition, PrerequisiteCheckResult, ValidationResult } from './types.js';

export class SkillValidator {
  /**
   * Check if all prerequisites for a skill are satisfied
   */
  static async checkPrerequisites(skill: SkillDefinition): Promise<PrerequisiteCheckResult> {
    const missing: PrerequisiteCheckResult['missing'] = {};
    const details: string[] = [];
    let satisfied = true;

    // Check required skills
    if (skill.prerequisites.skills && skill.prerequisites.skills.length > 0) {
      const missingSkills: string[] = [];
      for (const requiredSkill of skill.prerequisites.skills) {
        const skillPath = path.join(skill.directory, '..', requiredSkill, 'SKILL.md');
        if (!fs.existsSync(skillPath)) {
          missingSkills.push(requiredSkill);
          satisfied = false;
        }
      }
      if (missingSkills.length > 0) {
        missing.skills = missingSkills;
        details.push(`Missing required skills: ${missingSkills.join(', ')}`);
      }
    }

    // Check required tools
    if (skill.prerequisites.tools && skill.prerequisites.tools.length > 0) {
      const missingTools: string[] = [];
      for (const tool of skill.prerequisites.tools) {
        if (!this.isToolAvailable(tool)) {
          missingTools.push(tool);
          satisfied = false;
        }
      }
      if (missingTools.length > 0) {
        missing.tools = missingTools;
        details.push(`Missing required tools: ${missingTools.join(', ')}`);
      }
    }

    // Check environment variables
    if (skill.prerequisites.env_vars && skill.prerequisites.env_vars.length > 0) {
      const missingEnvVars: string[] = [];
      for (const envVar of skill.prerequisites.env_vars) {
        if (!process.env[envVar]) {
          missingEnvVars.push(envVar);
          satisfied = false;
        }
      }
      if (missingEnvVars.length > 0) {
        missing.env_vars = missingEnvVars;
        details.push(`Missing environment variables: ${missingEnvVars.join(', ')}`);
      }
    }

    // Check required files
    if (skill.prerequisites.files && skill.prerequisites.files.length > 0) {
      const missingFiles: string[] = [];
      for (const file of skill.prerequisites.files) {
        const filePath = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
        if (!fs.existsSync(filePath)) {
          missingFiles.push(file);
          satisfied = false;
        }
      }
      if (missingFiles.length > 0) {
        missing.files = missingFiles;
        details.push(`Missing required files: ${missingFiles.join(', ')}`);
      }
    }

    // Check Node.js version
    if (skill.prerequisites.min_node_version) {
      const currentVersion = process.version.slice(1); // Remove 'v' prefix
      if (!this.compareVersions(currentVersion, skill.prerequisites.min_node_version)) {
        satisfied = false;
        details.push(`Node.js version ${skill.prerequisites.min_node_version}+ required (current: ${currentVersion})`);
      }
    }

    return {
      satisfied,
      missing,
      details,
    };
  }

  /**
   * Validate skill definition structure and content
   */
  static validate(skill: SkillDefinition): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required metadata
    if (!skill.metadata.name) {
      errors.push('Skill name is required');
    }
    if (!skill.metadata.description) {
      errors.push('Skill description is required');
    }
    if (!skill.metadata.version) {
      warnings.push('Skill version not specified, defaulting to 1.0.0');
    }

    // Execution validation
    if (!skill.execution.type) {
      errors.push('Execution type is required');
    } else {
      switch (skill.execution.type) {
        case 'script':
          if (!skill.execution.entry_point) {
            errors.push('Script type requires entry_point');
          } else {
            const entryPath = path.join(skill.directory, skill.execution.entry_point);
            if (!fs.existsSync(entryPath)) {
              errors.push(`Entry point not found: ${skill.execution.entry_point}`);
            }
          }
          break;

        case 'mcp':
          if (!skill.execution.tools_file) {
            errors.push('MCP type requires tools_file');
          } else {
            const toolsPath = path.join(skill.directory, skill.execution.tools_file);
            if (!fs.existsSync(toolsPath)) {
              errors.push(`Tools file not found: ${skill.execution.tools_file}`);
            }
          }
          if (skill.execution.host_handler) {
            const hostPath = path.join(skill.directory, skill.execution.host_handler);
            if (!fs.existsSync(hostPath)) {
              warnings.push(`Host handler not found: ${skill.execution.host_handler}`);
            }
          }
          break;

        case 'workflow':
          if (!skill.execution.steps || skill.execution.steps.length === 0) {
            errors.push('Workflow type requires at least one step');
          } else {
            for (const step of skill.execution.steps) {
              if (!step.skill) {
                errors.push('Workflow step missing skill name');
              }
            }
          }
          break;

        default:
          errors.push(`Unknown execution type: ${skill.execution.type}`);
      }
    }

    // Timeout validation
    if (skill.execution.timeout && skill.execution.timeout < 1000) {
      warnings.push('Timeout is very short (< 1 second), this may cause issues');
    }

    // Keywords validation
    if (!skill.metadata.keywords || skill.metadata.keywords.length === 0) {
      warnings.push('No keywords specified, skill may be hard to discover');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Check if a system tool is available
   */
  private static isToolAvailable(tool: string): boolean {
    try {
      const command = process.platform === 'win32' ? 'where' : 'which';
      execSync(`${command} ${tool}`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Compare semantic versions (simple implementation)
   */
  private static compareVersions(current: string, required: string): boolean {
    const currentParts = current.split('.').map(Number);
    const requiredParts = required.split('.').map(Number);

    for (let i = 0; i < Math.max(currentParts.length, requiredParts.length); i++) {
      const curr = currentParts[i] || 0;
      const req = requiredParts[i] || 0;

      if (curr > req) return true;
      if (curr < req) return false;
    }

    return true; // Equal versions
  }
}
