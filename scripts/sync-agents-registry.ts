#!/usr/bin/env bun
/**
 * Agent Registry Sync Script
 * 
 * Automatically scans .opencode/agents/*.md files and updates the agents registry.
 * This ensures the orchestrator always knows about available agents.
 * 
 * Usage:
 *   bun run scripts/sync-agents-registry.ts
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

interface AgentMetadata {
  description?: string;
  mode?: string;
  temperature?: number;
  tools?: Record<string, boolean>;
  permission?: Record<string, any>;
}

interface AgentRegistryEntry {
  name: string;
  file: string;
  description: string;
  mode?: string;
  trigger_keywords?: string[];
}

interface AgentRegistry {
  agents: AgentRegistryEntry[];
  orchestrator: {
    auto_discover: boolean;
    registry_file: string;
    fallback_agent: string;
  };
}

const AGENTS_DIR = path.join(process.cwd(), '.opencode', 'agents');
const REGISTRY_FILE = path.join(process.cwd(), '.opencode', 'agents-registry.yaml');

/**
 * Parse frontmatter from a markdown file
 */
function parseFrontmatter(content: string): AgentMetadata | null {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
  const match = content.match(frontmatterRegex);
  
  if (!match) return null;
  
  try {
    return yaml.load(match[1]) as AgentMetadata;
  } catch (err) {
    console.error('Failed to parse frontmatter:', err);
    return null;
  }
}

/**
 * Extract trigger keywords from agent description and content
 */
function extractTriggerKeywords(name: string, description: string, content: string): string[] {
  const keywords: string[] = [];
  
  // Add agent name variations
  keywords.push(name);
  keywords.push(name.replace(/-/g, ' '));
  
  // Extract from description
  const descLower = description.toLowerCase();
  if (descLower.includes('task')) keywords.push('task', 'create task');
  if (descLower.includes('research')) keywords.push('research', 'search', 'find');
  if (descLower.includes('plan')) keywords.push('plan', 'create plan');
  if (descLower.includes('execute')) keywords.push('execute', 'run', 'do');
  if (descLower.includes('summarize')) keywords.push('summarize', 'summary');
  
  // Look for explicit trigger patterns in content
  const triggerSection = content.match(/## Trigger(?:s)?\n([\s\S]*?)(?=\n##|$)/i);
  if (triggerSection) {
    const triggers = triggerSection[1]
      .split('\n')
      .filter(line => line.trim().startsWith('-'))
      .map(line => line.replace(/^-\s*/, '').trim())
      .filter(Boolean);
    keywords.push(...triggers);
  }
  
  return [...new Set(keywords)]; // Remove duplicates
}

/**
 * Scan agents directory and build registry
 */
function scanAgents(): AgentRegistryEntry[] {
  const agents: AgentRegistryEntry[] = [];
  
  if (!fs.existsSync(AGENTS_DIR)) {
    console.error(`Agents directory not found: ${AGENTS_DIR}`);
    return agents;
  }
  
  const files = fs.readdirSync(AGENTS_DIR).filter(f => f.endsWith('.md'));
  
  for (const file of files) {
    const filePath = path.join(AGENTS_DIR, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const metadata = parseFrontmatter(content);
    
    const name = path.basename(file, '.md');
    const description = metadata?.description || `Agent: ${name}`;
    const mode = metadata?.mode || 'subagent';
    
    const triggerKeywords = extractTriggerKeywords(name, description, content);
    
    agents.push({
      name,
      file,
      description,
      mode,
      trigger_keywords: triggerKeywords,
    });
    
    console.log(`✓ Discovered agent: ${name}`);
  }
  
  return agents;
}

/**
 * Update the registry file
 */
function updateRegistry(agents: AgentRegistryEntry[]): void {
  const registry: AgentRegistry = {
    agents,
    orchestrator: {
      auto_discover: true,
      registry_file: '.opencode/agents-registry.yaml',
      fallback_agent: 'general',
    },
  };
  
  const yamlContent = yaml.dump(registry, {
    indent: 2,
    lineWidth: 100,
    noRefs: true,
  });
  
  const header = `# Auto-generated Agent Registry
# Generated: ${new Date().toISOString()}
# This file is automatically scanned by the orchestrator to discover available agents
# Run 'bun run scripts/sync-agents-registry.ts' to regenerate

`;
  
  fs.writeFileSync(REGISTRY_FILE, header + yamlContent, 'utf-8');
  console.log(`\n✓ Registry updated: ${REGISTRY_FILE}`);
  console.log(`  Total agents: ${agents.length}`);
}

/**
 * Main execution
 */
function main() {
  console.log('🔍 Scanning for agents...\n');
  
  const agents = scanAgents();
  
  if (agents.length === 0) {
    console.error('❌ No agents found!');
    process.exit(1);
  }
  
  updateRegistry(agents);
  
  console.log('\n✅ Agent registry sync complete!');
}

main();
