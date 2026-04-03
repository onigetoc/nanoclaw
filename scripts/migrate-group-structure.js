#!/usr/bin/env node
/**
 * Migration script: Move group files to new memory/ and workspace/ structure
 * 
 * Run: bun scripts/migrate-group-structure.js
 */

import fs from 'fs';
import path from 'path';

const GROUPS_DIR = path.join(process.cwd(), 'groups');
const DNA_FILES = ['AGENTS.md', 'GUIDELINES.md', 'IDENTITY.md', 'MEMORY.md', 'SOUL.md', 'TOOLS.md', 'USER.md'];
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
const SKIP_FOLDERS = ['templates', 'global'];

function migrateGroup(groupName) {
  const groupDir = path.join(GROUPS_DIR, groupName);
  
  if (!fs.statSync(groupDir).isDirectory()) return;
  
  console.log(`\n📁 Migrating ${groupName}...`);
  
  // Create new structure
  const memoryDir = path.join(groupDir, 'memory');
  const workspaceDir = path.join(groupDir, 'workspace');
  const screenshotsDir = path.join(workspaceDir, 'screenshots');
  const reportsDir = path.join(workspaceDir, 'reports');
  const tasksDir = path.join(workspaceDir, 'tasks');
  const downloadsDir = path.join(workspaceDir, 'downloads');
  
  fs.mkdirSync(memoryDir, { recursive: true });
  fs.mkdirSync(screenshotsDir, { recursive: true });
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.mkdirSync(tasksDir, { recursive: true });
  fs.mkdirSync(downloadsDir, { recursive: true });
  fs.mkdirSync(path.join(groupDir, 'uploads'), { recursive: true });
  fs.mkdirSync(path.join(groupDir, 'logs'), { recursive: true });
  fs.mkdirSync(path.join(groupDir, 'conversations'), { recursive: true });

  
  // Get all files in root
  const files = fs.readdirSync(groupDir);
  
  for (const file of files) {
    const filePath = path.join(groupDir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) continue; // Skip directories
    
    const ext = path.extname(file).toLowerCase();
    
    // Move memory files to memory/
    if (DNA_FILES.includes(file)) {
      const destPath = path.join(memoryDir, file);
      if (!fs.existsSync(destPath)) {
        fs.renameSync(filePath, destPath);
        console.log(`  ✓ ${file} → memory/`);
      } else {
        console.log(`  ⚠ ${file} already exists in memory/, skipping`);
      }
      continue;
    }
    
    // Move images to workspace/screenshots/
    if (IMAGE_EXTENSIONS.includes(ext)) {
      const destPath = path.join(screenshotsDir, file);
      if (!fs.existsSync(destPath)) {
        fs.renameSync(filePath, destPath);
        console.log(`  ✓ ${file} → workspace/screenshots/`);
      }
      continue;
    }
    
    // Move .template.md files (keep in root for now)
    if (file.endsWith('.template.md')) {
      console.log(`  ⚠ ${file} is a template, keeping in root`);
      continue;
    }
    
    // Move other files (.csv, etc.) to workspace/
    if (ext === '.csv' || ext === '.json' || ext === '.xml') {
      const destPath = path.join(workspaceDir, file);
      if (!fs.existsSync(destPath)) {
        fs.renameSync(filePath, destPath);
        console.log(`  ✓ ${file} → workspace/`);
      }
      continue;
    }
    
    console.log(`  ? ${file} - unknown type, keeping in root`);
  }
  
  // Move existing reports/ content to workspace/reports/
  const oldReportsDir = path.join(groupDir, 'reports');
  if (fs.existsSync(oldReportsDir) && oldReportsDir !== reportsDir) {
    const reportFiles = fs.readdirSync(oldReportsDir);
    for (const file of reportFiles) {
      const src = path.join(oldReportsDir, file);
      const dest = path.join(reportsDir, file);
      if (!fs.existsSync(dest)) {
        fs.renameSync(src, dest);
        console.log(`  ✓ reports/${file} → workspace/reports/`);
      }
    }
    // Remove old reports dir if empty
    if (fs.readdirSync(oldReportsDir).length === 0) {
      fs.rmdirSync(oldReportsDir);
    }
  }
  
  // Move existing tasks/ content to workspace/tasks/
  const oldTasksDir = path.join(groupDir, 'tasks');
  if (fs.existsSync(oldTasksDir) && oldTasksDir !== tasksDir) {
    const taskFiles = fs.readdirSync(oldTasksDir);
    for (const file of taskFiles) {
      const src = path.join(oldTasksDir, file);
      const dest = path.join(tasksDir, file);
      if (!fs.existsSync(dest)) {
        fs.renameSync(src, dest);
        console.log(`  ✓ tasks/${file} → workspace/tasks/`);
      }
    }
    // Remove old tasks dir if empty
    if (fs.readdirSync(oldTasksDir).length === 0) {
      fs.rmdirSync(oldTasksDir);
    }
  }
}

// Main
console.log('🔄 EureClaw Group Structure Migration');
console.log('=====================================');

const groups = fs.readdirSync(GROUPS_DIR).filter(f => {
  const fullPath = path.join(GROUPS_DIR, f);
  return fs.statSync(fullPath).isDirectory() && !SKIP_FOLDERS.includes(f);
});

console.log(`Found ${groups.length} groups to migrate: ${groups.join(', ')}`);

for (const group of groups) {
  migrateGroup(group);
}

console.log('\n✅ Migration complete!');
console.log('\nNew structure:');
console.log('  groups/{name}/memory/        ← Personality files');
console.log('  groups/{name}/workspace/     ← Agent-generated content');
console.log('  groups/{name}/uploads/       ← User uploads');
console.log('  groups/{name}/logs/          ← Execution logs');
console.log('  groups/{name}/conversations/ ← Archives');
