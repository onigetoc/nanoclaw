/**
 * SKILL.md Parser
 * Parses skill definition files and extracts metadata, prerequisites, and execution info
 */

import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import type { SkillDefinition, SkillMetadata, SkillPrerequisites, SkillCapabilities, SkillExecution } from './types.js';

export class SkillParser {
  /**
   * Parse a SKILL.md file and extract all information
   */
  static parse(filePath: string): SkillDefinition | null {
    try {
      if (!fs.existsSync(filePath)) {
        console.error(`SKILL.md not found: ${filePath}`);
        return null;
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const directory = path.dirname(filePath);

      // Extract frontmatter (YAML between --- markers)
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!frontmatterMatch) {
        console.error(`No frontmatter found in ${filePath}`);
        return null;
      }

      const frontmatter = yaml.parse(frontmatterMatch[1]);

      // Parse metadata
      const metadata: SkillMetadata = {
        name: frontmatter.name || path.basename(directory),
        description: frontmatter.description || '',
        version: frontmatter.version || '1.0.0',
        author: frontmatter.author,
        keywords: frontmatter.keywords || [],
      };

      // Parse prerequisites
      const prerequisites: SkillPrerequisites = {
        skills: frontmatter.prerequisites?.skills || [],
        tools: frontmatter.prerequisites?.tools || [],
        env_vars: frontmatter.prerequisites?.env_vars || [],
        files: frontmatter.prerequisites?.files || [],
        min_node_version: frontmatter.prerequisites?.min_node_version,
      };

      // Parse capabilities
      const capabilities: SkillCapabilities = {
        provides: frontmatter.capabilities?.provides || [],
        consumes: frontmatter.capabilities?.consumes || [],
        mcp_tools: frontmatter.capabilities?.mcp_tools || [],
      };

      // Parse execution
      const execution: SkillExecution = {
        type: frontmatter.execution?.type || 'script',
        entry_point: frontmatter.execution?.entry_point,
        tools_file: frontmatter.execution?.tools_file,
        host_handler: frontmatter.execution?.host_handler,
        steps: frontmatter.execution?.steps || [],
        timeout: frontmatter.execution?.timeout || 60000,
      };

      return {
        metadata,
        prerequisites,
        capabilities,
        execution,
        content,
        path: filePath,
        directory,
      };
    } catch (error) {
      console.error(`Failed to parse ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Validate skill definition structure
   */
  static validate(skill: SkillDefinition): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Required fields
    if (!skill.metadata.name) {
      errors.push('Skill name is required');
    }
    if (!skill.metadata.description) {
      errors.push('Skill description is required');
    }
    if (!skill.execution.type) {
      errors.push('Execution type is required');
    }

    // Execution type validation
    if (skill.execution.type === 'script' && !skill.execution.entry_point) {
      errors.push('Script type requires entry_point');
    }
    if (skill.execution.type === 'mcp' && !skill.execution.tools_file) {
      errors.push('MCP type requires tools_file');
    }
    if (skill.execution.type === 'workflow' && (!skill.execution.steps || skill.execution.steps.length === 0)) {
      errors.push('Workflow type requires at least one step');
    }

    // File existence checks
    if (skill.execution.entry_point) {
      const entryPath = path.join(skill.directory, skill.execution.entry_point);
      if (!fs.existsSync(entryPath)) {
        errors.push(`Entry point not found: ${skill.execution.entry_point}`);
      }
    }
    if (skill.execution.tools_file) {
      const toolsPath = path.join(skill.directory, skill.execution.tools_file);
      if (!fs.existsSync(toolsPath)) {
        errors.push(`Tools file not found: ${skill.execution.tools_file}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Extract examples from skill content
   */
  static extractExamples(content: string): string[] {
    const examples: string[] = [];
    const exampleRegex = /```(?:bash|typescript|javascript|sh)?\n([\s\S]*?)```/g;
    let match;

    while ((match = exampleRegex.exec(content)) !== null) {
      examples.push(match[1].trim());
    }

    return examples;
  }

  /**
   * Extract usage instructions from skill content
   */
  static extractUsage(content: string): string {
    const usageMatch = content.match(/## Usage\n\n([\s\S]*?)(?=\n##|$)/);
    return usageMatch ? usageMatch[1].trim() : '';
  }
}
