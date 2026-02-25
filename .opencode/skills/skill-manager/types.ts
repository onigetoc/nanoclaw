/**
 * Types for the OpenCode Skill Management System
 */

export interface SkillMetadata {
  name: string;
  description: string;
  version: string;
  author?: string;
  keywords?: string[];
}

export interface SkillPrerequisites {
  skills?: string[];           // Other skills required
  tools?: string[];            // System tools required (node, npm, docker, etc.)
  env_vars?: string[];         // Environment variables required
  files?: string[];            // Files that must exist
  min_node_version?: string;   // Minimum Node.js version
}

export interface SkillCapabilities {
  provides?: string[];         // Actions/features this skill provides
  consumes?: string[];         // Inputs this skill requires
  mcp_tools?: string[];        // MCP tools this skill registers
}

export interface SkillExecution {
  type: 'script' | 'mcp' | 'workflow';
  entry_point?: string;        // For script type
  tools_file?: string;         // For mcp type
  host_handler?: string;       // For mcp type
  steps?: WorkflowStep[];      // For workflow type
  timeout?: number;            // Execution timeout in ms
}

export interface WorkflowStep {
  skill: string;
  description?: string;
  params?: Record<string, any>;
  on_failure?: 'abort' | 'continue' | 'retry';
  retry_count?: number;
}

export interface SkillDefinition {
  metadata: SkillMetadata;
  prerequisites: SkillPrerequisites;
  capabilities: SkillCapabilities;
  execution: SkillExecution;
  content: string;             // Full markdown content
  path: string;                // Path to SKILL.md file
  directory: string;           // Skill directory path
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface PrerequisiteCheckResult {
  satisfied: boolean;
  missing: {
    skills?: string[];
    tools?: string[];
    env_vars?: string[];
    files?: string[];
  };
  details: string[];
}

export interface ExecutionResult {
  success: boolean;
  output?: any;
  error?: string;
  duration: number;
  logs?: string[];
}

export interface SkillSearchOptions {
  query?: string;
  keywords?: string[];
  type?: 'script' | 'mcp' | 'workflow';
  author?: string;
}

export interface SkillInstallOptions {
  path: string;
  force?: boolean;             // Overwrite if exists
  validate?: boolean;          // Validate before install
}
