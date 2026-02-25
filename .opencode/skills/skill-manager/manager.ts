/**
 * Skill Manager
 * Main interface for discovering, validating, and managing skills
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SkillParser } from './parser.js';
import { SkillValidator } from './validator.js';
import type { SkillDefinition, SkillSearchOptions, SkillInstallOptions } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class SkillManager {
  private static cache: Map<string, SkillDefinition> = new Map();
  private static lastScan: number = 0;
  private static readonly CACHE_TTL = 60000; // 1 minute
  private static readonly SKILLS_DIR = path.join(__dirname, '..');

  /**
   * Discover all available skills
   */
  static discover(forceRefresh = false): SkillDefinition[] {
    const now = Date.now();

    // Use cache if valid
    if (!forceRefresh && this.cache.size > 0 && now - this.lastScan < this.CACHE_TTL) {
      return Array.from(this.cache.values());
    }

    // Clear cache and rescan
    this.cache.clear();
    this.lastScan = now;

    const skills: SkillDefinition[] = [];

    try {
      const entries = fs.readdirSync(this.SKILLS_DIR, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name === 'skill-manager' || entry.name === 'templates') continue;

        const skillPath = path.join(this.SKILLS_DIR, entry.name, 'SKILL.md');
        if (!fs.existsSync(skillPath)) continue;

        const skill = SkillParser.parse(skillPath);
        if (skill) {
          this.cache.set(skill.metadata.name, skill);
          skills.push(skill);
        }
      }
    } catch (error) {
      console.error('Failed to discover skills:', error);
    }

    return skills;
  }

  /**
   * Get a specific skill by name
   */
  static get(name: string): SkillDefinition | null {
    // Check cache first
    if (this.cache.has(name)) {
      return this.cache.get(name)!;
    }

    // Try to load directly
    const skillPath = path.join(this.SKILLS_DIR, name, 'SKILL.md');
    if (!fs.existsSync(skillPath)) {
      return null;
    }

    const skill = SkillParser.parse(skillPath);
    if (skill) {
      this.cache.set(name, skill);
    }

    return skill;
  }

  /**
   * Search for skills matching criteria
   */
  static search(options: SkillSearchOptions): SkillDefinition[] {
    const allSkills = this.discover();
    let results = allSkills;

    // Filter by query (name or description)
    if (options.query) {
      const query = options.query.toLowerCase();
      results = results.filter(
        (skill) =>
          skill.metadata.name.toLowerCase().includes(query) ||
          skill.metadata.description.toLowerCase().includes(query)
      );
    }

    // Filter by keywords
    if (options.keywords && options.keywords.length > 0) {
      results = results.filter((skill) =>
        options.keywords!.some((keyword) =>
          skill.metadata.keywords?.includes(keyword)
        )
      );
    }

    // Filter by type
    if (options.type) {
      results = results.filter((skill) => skill.execution.type === options.type);
    }

    // Filter by author
    if (options.author) {
      results = results.filter((skill) => skill.metadata.author === options.author);
    }

    return results;
  }

  /**
   * Validate a skill
   */
  static validate(skill: SkillDefinition) {
    return SkillValidator.validate(skill);
  }

  /**
   * Check prerequisites for a skill
   */
  static async checkPrerequisites(skill: SkillDefinition) {
    return await SkillValidator.checkPrerequisites(skill);
  }

  /**
   * Install a skill from a path
   */
  static async install(options: SkillInstallOptions): Promise<{ success: boolean; error?: string }> {
    try {
      const sourcePath = options.path;
      const skillMdPath = path.join(sourcePath, 'SKILL.md');

      if (!fs.existsSync(skillMdPath)) {
        return { success: false, error: 'SKILL.md not found in source path' };
      }

      // Parse and validate
      const skill = SkillParser.parse(skillMdPath);
      if (!skill) {
        return { success: false, error: 'Failed to parse SKILL.md' };
      }

      if (options.validate !== false) {
        const validation = this.validate(skill);
        if (!validation.valid) {
          return { success: false, error: `Validation failed: ${validation.errors.join(', ')}` };
        }
      }

      // Check if skill already exists
      const targetPath = path.join(this.SKILLS_DIR, skill.metadata.name);
      if (fs.existsSync(targetPath) && !options.force) {
        return { success: false, error: `Skill ${skill.metadata.name} already exists. Use force=true to overwrite.` };
      }

      // Copy skill directory
      if (fs.existsSync(targetPath)) {
        fs.rmSync(targetPath, { recursive: true, force: true });
      }
      this.copyDirectory(sourcePath, targetPath);

      // Invalidate cache
      this.cache.delete(skill.metadata.name);
      this.lastScan = 0;

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Uninstall a skill
   */
  static async uninstall(name: string): Promise<{ success: boolean; error?: string }> {
    try {
      const skillPath = path.join(this.SKILLS_DIR, name);

      if (!fs.existsSync(skillPath)) {
        return { success: false, error: `Skill ${name} not found` };
      }

      // Check if other skills depend on this one
      const allSkills = this.discover();
      const dependents = allSkills.filter((skill) =>
        skill.prerequisites.skills?.includes(name)
      );

      if (dependents.length > 0) {
        const dependentNames = dependents.map((s) => s.metadata.name).join(', ');
        return {
          success: false,
          error: `Cannot uninstall ${name}: required by ${dependentNames}`,
        };
      }

      // Remove skill directory
      fs.rmSync(skillPath, { recursive: true, force: true });

      // Invalidate cache
      this.cache.delete(name);
      this.lastScan = 0;

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * List all skills with their status
   */
  static async list(): Promise<Array<{
    name: string;
    description: string;
    version: string;
    type: string;
    prerequisites_satisfied: boolean;
  }>> {
    const skills = this.discover();
    const results = [];

    for (const skill of skills) {
      const prereqCheck = await this.checkPrerequisites(skill);
      results.push({
        name: skill.metadata.name,
        description: skill.metadata.description,
        version: skill.metadata.version,
        type: skill.execution.type,
        prerequisites_satisfied: prereqCheck.satisfied,
      });
    }

    return results;
  }

  /**
   * Get skill dependencies (recursive)
   */
  static getDependencies(skillName: string): string[] {
    const skill = this.get(skillName);
    if (!skill || !skill.prerequisites.skills) {
      return [];
    }

    const deps = new Set<string>();
    const queue = [...skill.prerequisites.skills];

    while (queue.length > 0) {
      const depName = queue.shift()!;
      if (deps.has(depName)) continue;

      deps.add(depName);

      const depSkill = this.get(depName);
      if (depSkill?.prerequisites.skills) {
        queue.push(...depSkill.prerequisites.skills);
      }
    }

    return Array.from(deps);
  }

  /**
   * Copy directory recursively
   */
  private static copyDirectory(src: string, dest: string): void {
    fs.mkdirSync(dest, { recursive: true });

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        this.copyDirectory(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  /**
   * Clear the skill cache
   */
  static clearCache(): void {
    this.cache.clear();
    this.lastScan = 0;
  }
}
