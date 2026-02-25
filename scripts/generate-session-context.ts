#!/usr/bin/env bun
/**
 * Generate Session Context
 * 
 * Generates dynamic context to inject at the start of each OpenCode session.
 * This includes:
 * - Available agents from .opencode/agents/
 * - Available skills from .opencode/skills/
 * - System capabilities and tools
 * 
 * This context is injected into the orchestrator prompt so it knows what's available
 * without relying on hardcoded lists or keyword matching.
 * 
 * Usage:
 *   bun run scripts/generate-session-context.ts
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

const AGENTS_DIR = path.join(process.cwd(), '.opencode', 'agents');
const SKILLS_DIR = path.join(process.cwd(), '.opencode', 'skills');
const OUTPUT_FILE = path.join(process.cwd(), '.opencode', 'session-context.md');

interface AgentMetadata {
  description?: string;
  mode?: string;
  temperature?: number;
}

interface SkillMetadata {
  name?: string;
  description?: string;
  triggers?: string[];
}

/**
 * Parse frontmatter from markdown
 */
function parseFrontmatter(content: string): any {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
  const match = content.match(frontmatterRegex);
  
  if (!match) return null;
  
  try {
    return yaml.load(match[1]);
  } catch {
    return null;
  }
}

/**
 * Extract description from markdown content
 */
function extractDescription(content: string): string {
  // Remove frontmatter
  const withoutFrontmatter = content.replace(/^---\n[\s\S]*?\n---\n/, '');
  
  // Find first heading and paragraph
  const lines = withoutFrontmatter.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line && !line.startsWith('#')) {
      return line.slice(0, 150);
    }
  }
  
  return 'No description available';
}

/**
 * Scan agents directory
 */
function scanAgents(): string[] {
  const agents: string[] = [];
  
  if (!fs.existsSync(AGENTS_DIR)) {
    return agents;
  }
  
  const files = fs.readdirSync(AGENTS_DIR).filter(f => f.endsWith('.md'));
  
  for (const file of files) {
    const filePath = path.join(AGENTS_DIR, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const metadata = parseFrontmatter(content);
    
    const name = path.basename(file, '.md');
    const description = metadata?.description || extractDescription(content);
    const mode = metadata?.mode || 'subagent';
    
    agents.push(`- **@${name}** (${mode}): ${description}`);
  }
  
  return agents;
}

/**
 * Scan skills directory
 */
function scanSkills(): string[] {
  const skills: string[] = [];
  
  if (!fs.existsSync(SKILLS_DIR)) {
    return skills;
  }
  
  const dirs = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
  
  for (const dir of dirs) {
    const skillFile = path.join(SKILLS_DIR, dir, 'SKILL.md');
    
    if (!fs.existsSync(skillFile)) continue;
    
    const content = fs.readFileSync(skillFile, 'utf-8');
    const metadata = parseFrontmatter(content);
    
    const name = metadata?.name || dir;
    const description = metadata?.description || extractDescription(content);
    
    skills.push(`- **${name}**: ${description}`);
  }
  
  return skills;
}

/**
 * Generate session context markdown
 */
function generateContext(): string {
  const agents = scanAgents();
  const skills = scanSkills();
  
  const context = `# Session Context (Auto-generated)

**Generated:** ${new Date().toISOString()}

This context is automatically injected at the start of each OpenCode session.
It provides the orchestrator with up-to-date information about available capabilities.

## Available Agents

${agents.length > 0 ? agents.join('\n') : 'No agents found'}

## Available Skills

${skills.length > 0 ? skills.join('\n') : 'No skills found'}

## Usage Guidelines

**For the Orchestrator:**
- Choose agents based on semantic understanding of user intent, not keyword matching
- Support multilingual requests (English, French, Chinese, etc.)
- Understand variations in phrasing ("create task", "make a plan", "créer une tâche", etc.)
- Use @task-planner for structured task planning, regardless of how the user phrases it
- Automatically chain @task-planner → @task-executor when you see PLAN_CREATED output

**Agent Selection Strategy:**
1. Understand what the user wants to accomplish
2. Choose the most appropriate agent for that goal
3. Don't rely on exact keyword matches
4. Consider the context and intent, not just the words used
`;
  
  return context;
}

/**
 * Main execution
 */
function main() {
  console.log('🔍 Scanning agents and skills...\n');
  
  const context = generateContext();
  
  fs.writeFileSync(OUTPUT_FILE, context, 'utf-8');
  
  console.log(`✅ Session context generated: ${OUTPUT_FILE}`);
  console.log(`   Size: ${context.length} bytes\n`);
  
  // Show preview
  console.log('Preview:');
  console.log('─'.repeat(60));
  console.log(context.split('\n').slice(0, 20).join('\n'));
  console.log('─'.repeat(60));
}

main();
