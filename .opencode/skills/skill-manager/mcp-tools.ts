/**
 * MCP Tools for Skill Manager
 * Provides skill management capabilities to the agent
 */

import { z } from 'zod';
import { SkillManager } from './manager.js';
import { SkillExecutor } from './executor.js';

export function createSkillTools() {
  return [
    {
      name: 'list_skills',
      description: 'List all available skills with their status and capabilities',
      inputSchema: z.object({
        category: z.enum(['script', 'mcp', 'workflow', 'all']).optional().default('all').describe('Filter by skill type'),
        show_details: z.boolean().optional().default(false).describe('Include detailed information'),
      }),
      handler: async (args: any) => {
        try {
          const skills = SkillManager.discover();
          let filtered = skills;

          if (args.category !== 'all') {
            filtered = skills.filter(s => s.execution.type === args.category);
          }

          if (args.show_details) {
            const detailed = [];
            for (const skill of filtered) {
              const prereqCheck = await SkillManager.checkPrerequisites(skill);
              detailed.push({
                name: skill.metadata.name,
                description: skill.metadata.description,
                version: skill.metadata.version,
                type: skill.execution.type,
                keywords: skill.metadata.keywords,
                prerequisites_satisfied: prereqCheck.satisfied,
                provides: skill.capabilities.provides,
                mcp_tools: skill.capabilities.mcp_tools,
              });
            }
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify(detailed, null, 2),
              }],
            };
          }

          const formatted = filtered.map(s => 
            `• ${s.metadata.name} (${s.execution.type}) - ${s.metadata.description}`
          ).join('\n');

          return {
            content: [{
              type: 'text' as const,
              text: `Found ${filtered.length} skills:\n\n${formatted}\n\nUse skill_info to get details about a specific skill.`,
            }],
          };
        } catch (error) {
          return {
            content: [{
              type: 'text' as const,
              text: `Error listing skills: ${error instanceof Error ? error.message : String(error)}`,
            }],
            isError: true,
          };
        }
      },
    },

    {
      name: 'skill_info',
      description: 'Get detailed information about a specific skill',
      inputSchema: z.object({
        skill_name: z.string().describe('Name of the skill to get info about'),
      }),
      handler: async (args: any) => {
        try {
          const skill = SkillManager.get(args.skill_name);
          
          if (!skill) {
            return {
              content: [{
                type: 'text' as const,
                text: `Skill not found: ${args.skill_name}`,
              }],
              isError: true,
            };
          }

          const prereqCheck = await SkillManager.checkPrerequisites(skill);
          const validation = SkillManager.validate(skill);

          let info = `# ${skill.metadata.name} v${skill.metadata.version}\n\n`;
          info += `${skill.metadata.description}\n\n`;
          
          if (skill.metadata.author) {
            info += `**Author:** ${skill.metadata.author}\n`;
          }
          if (skill.metadata.keywords && skill.metadata.keywords.length > 0) {
            info += `**Keywords:** ${skill.metadata.keywords.join(', ')}\n`;
          }
          info += `**Type:** ${skill.execution.type}\n\n`;

          // Prerequisites
          if (skill.prerequisites.skills?.length || skill.prerequisites.tools?.length || 
              skill.prerequisites.env_vars?.length || skill.prerequisites.files?.length) {
            info += `## Prerequisites\n\n`;
            if (skill.prerequisites.skills?.length) {
              info += `**Required Skills:** ${skill.prerequisites.skills.join(', ')}\n`;
            }
            if (skill.prerequisites.tools?.length) {
              info += `**Required Tools:** ${skill.prerequisites.tools.join(', ')}\n`;
            }
            if (skill.prerequisites.env_vars?.length) {
              info += `**Environment Variables:** ${skill.prerequisites.env_vars.join(', ')}\n`;
            }
            if (skill.prerequisites.files?.length) {
              info += `**Required Files:** ${skill.prerequisites.files.join(', ')}\n`;
            }
            info += `\n**Status:** ${prereqCheck.satisfied ? '✅ All satisfied' : '❌ Missing prerequisites'}\n`;
            if (!prereqCheck.satisfied) {
              info += `\nMissing:\n${prereqCheck.details.map(d => `- ${d}`).join('\n')}\n`;
            }
            info += '\n';
          }

          // Capabilities
          if (skill.capabilities.provides?.length || skill.capabilities.mcp_tools?.length) {
            info += `## Capabilities\n\n`;
            if (skill.capabilities.provides?.length) {
              info += `**Provides:** ${skill.capabilities.provides.join(', ')}\n`;
            }
            if (skill.capabilities.consumes?.length) {
              info += `**Consumes:** ${skill.capabilities.consumes.join(', ')}\n`;
            }
            if (skill.capabilities.mcp_tools?.length) {
              info += `**MCP Tools:** ${skill.capabilities.mcp_tools.join(', ')}\n`;
            }
            info += '\n';
          }

          // Execution
          info += `## Execution\n\n`;
          info += `**Type:** ${skill.execution.type}\n`;
          if (skill.execution.entry_point) {
            info += `**Entry Point:** ${skill.execution.entry_point}\n`;
          }
          if (skill.execution.timeout) {
            info += `**Timeout:** ${skill.execution.timeout}ms\n`;
          }
          if (skill.execution.type === 'workflow' && skill.execution.steps?.length) {
            info += `**Steps:** ${skill.execution.steps.length}\n`;
            skill.execution.steps.forEach((step, i) => {
              info += `  ${i + 1}. ${step.skill}${step.description ? ` - ${step.description}` : ''}\n`;
            });
          }

          // Validation
          if (!validation.valid || validation.warnings.length > 0) {
            info += `\n## Validation\n\n`;
            if (!validation.valid) {
              info += `**Errors:**\n${validation.errors.map(e => `- ${e}`).join('\n')}\n`;
            }
            if (validation.warnings.length > 0) {
              info += `**Warnings:**\n${validation.warnings.map(w => `- ${w}`).join('\n')}\n`;
            }
          }

          return {
            content: [{
              type: 'text' as const,
              text: info,
            }],
          };
        } catch (error) {
          return {
            content: [{
              type: 'text' as const,
              text: `Error getting skill info: ${error instanceof Error ? error.message : String(error)}`,
            }],
            isError: true,
          };
        }
      },
    },

    {
      name: 'check_skill_prerequisites',
      description: 'Check if all prerequisites for a skill are satisfied',
      inputSchema: z.object({
        skill_name: z.string().describe('Name of the skill to check'),
      }),
      handler: async (args: any) => {
        try {
          const skill = SkillManager.get(args.skill_name);
          
          if (!skill) {
            return {
              content: [{
                type: 'text' as const,
                text: `Skill not found: ${args.skill_name}`,
              }],
              isError: true,
            };
          }

          const check = await SkillManager.checkPrerequisites(skill);

          if (check.satisfied) {
            return {
              content: [{
                type: 'text' as const,
                text: `✅ All prerequisites satisfied for ${args.skill_name}`,
              }],
            };
          }

          let message = `❌ Prerequisites not satisfied for ${args.skill_name}:\n\n`;
          message += check.details.map(d => `- ${d}`).join('\n');

          return {
            content: [{
              type: 'text' as const,
              text: message,
            }],
          };
        } catch (error) {
          return {
            content: [{
              type: 'text' as const,
              text: `Error checking prerequisites: ${error instanceof Error ? error.message : String(error)}`,
            }],
            isError: true,
          };
        }
      },
    },

    {
      name: 'execute_skill',
      description: 'Execute a skill with given parameters. Only works for script and workflow type skills. MCP skills provide tools and cannot be executed directly.',
      inputSchema: z.object({
        skill_name: z.string().describe('Name of the skill to execute'),
        params: z.record(z.any()).optional().describe('Parameters to pass to the skill'),
        dry_run: z.boolean().optional().default(false).describe('Validate without executing'),
      }),
      handler: async (args: any) => {
        try {
          const skill = SkillManager.get(args.skill_name);
          
          if (!skill) {
            return {
              content: [{
                type: 'text' as const,
                text: `Skill not found: ${args.skill_name}`,
              }],
              isError: true,
            };
          }

          // Dry run
          if (args.dry_run) {
            const dryRunResult = await SkillExecutor.dryRun(skill);
            
            let message = `# Dry Run: ${args.skill_name}\n\n`;
            message += `**Can Execute:** ${dryRunResult.canExecute ? '✅ Yes' : '❌ No'}\n\n`;
            
            if (dryRunResult.issues.length > 0) {
              message += `**Issues:**\n${dryRunResult.issues.map(i => `- ${i}`).join('\n')}\n\n`;
            }
            
            if (dryRunResult.warnings.length > 0) {
              message += `**Warnings:**\n${dryRunResult.warnings.map(w => `- ${w}`).join('\n')}\n`;
            }

            return {
              content: [{
                type: 'text' as const,
                text: message,
              }],
            };
          }

          // Execute
          const result = await SkillExecutor.execute(skill, args.params || {});

          if (result.success) {
            let message = `✅ Skill ${args.skill_name} executed successfully\n\n`;
            message += `**Duration:** ${result.duration}ms\n\n`;
            
            if (result.output) {
              message += `**Output:**\n\`\`\`\n${typeof result.output === 'string' ? result.output : JSON.stringify(result.output, null, 2)}\n\`\`\`\n`;
            }

            return {
              content: [{
                type: 'text' as const,
                text: message,
              }],
            };
          } else {
            let message = `❌ Skill ${args.skill_name} failed\n\n`;
            message += `**Error:** ${result.error}\n`;
            message += `**Duration:** ${result.duration}ms\n\n`;
            
            if (result.logs && result.logs.length > 0) {
              message += `**Logs:**\n\`\`\`\n${result.logs.join('\n')}\n\`\`\`\n`;
            }

            return {
              content: [{
                type: 'text' as const,
                text: message,
              }],
              isError: true,
            };
          }
        } catch (error) {
          return {
            content: [{
              type: 'text' as const,
              text: `Error executing skill: ${error instanceof Error ? error.message : String(error)}`,
            }],
            isError: true,
          };
        }
      },
    },

    {
      name: 'search_skills',
      description: 'Search for skills by name, keywords, or capabilities',
      inputSchema: z.object({
        query: z.string().optional().describe('Search query (matches name or description)'),
        keywords: z.array(z.string()).optional().describe('Filter by keywords'),
        type: z.enum(['script', 'mcp', 'workflow']).optional().describe('Filter by skill type'),
      }),
      handler: async (args: any) => {
        try {
          const results = SkillManager.search({
            query: args.query,
            keywords: args.keywords,
            type: args.type,
          });

          if (results.length === 0) {
            return {
              content: [{
                type: 'text' as const,
                text: 'No skills found matching your criteria.',
              }],
            };
          }

          const formatted = results.map(s => 
            `• **${s.metadata.name}** (${s.execution.type}) - ${s.metadata.description}\n  Keywords: ${s.metadata.keywords?.join(', ') || 'none'}`
          ).join('\n\n');

          return {
            content: [{
              type: 'text' as const,
              text: `Found ${results.length} skills:\n\n${formatted}`,
            }],
          };
        } catch (error) {
          return {
            content: [{
              type: 'text' as const,
              text: `Error searching skills: ${error instanceof Error ? error.message : String(error)}`,
            }],
            isError: true,
          };
        }
      },
    },
  ];
}
