#!/usr/bin/env node

/**
 * Generate context files from templates
 * Replaces {{ASSISTANT_NAME}} with the value from .env
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = path.join(__dirname, '..');

// Load .env file
function loadEnv() {
  const envPath = path.join(rootDir, '.env');
  if (!fs.existsSync(envPath)) {
    console.error('Error: .env file not found');
    process.exit(1);
  }

  const envContent = fs.readFileSync(envPath, 'utf-8');
  const env = {};

  envContent.split('\n').forEach(line => {
    line = line.trim();
    if (line && !line.startsWith('#')) {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        env[key.trim()] = valueParts.join('=').trim();
      }
    }
  });

  return env;
}

// Find all .template.md files recursively
function findTemplateFiles(dir) {
  const templates = [];
  
  function scan(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      
      if (entry.isDirectory()) {
        // Skip node_modules, .git, etc.
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          scan(fullPath);
        }
      } else if (entry.name.endsWith('.template.md')) {
        templates.push(fullPath);
      }
    }
  }
  
  scan(dir);
  return templates;
}

// Process a template file
function processTemplate(templatePath, variables) {
  const content = fs.readFileSync(templatePath, 'utf-8');
  
  // Replace all {{VARIABLE}} patterns
  let processed = content;
  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    processed = processed.replace(pattern, value);
  }
  
  // Generate output path (remove .template)
  const outputPath = templatePath.replace('.template.md', '.md');
  
  // Write the processed file
  fs.writeFileSync(outputPath, processed, 'utf-8');
  
  return outputPath;
}

// Main
function main() {
  console.log('🔧 Generating context files from templates...\n');
  
  // Load environment variables
  const env = loadEnv();
  const assistantName = env.ASSISTANT_NAME || 'Andy';
  
  console.log(`📝 Assistant name: ${assistantName}\n`);
  
  // Find all template files
  const groupsDir = path.join(rootDir, 'groups');
  const templates = findTemplateFiles(groupsDir);
  
  if (templates.length === 0) {
    console.log('⚠️  No template files found');
    return;
  }
  
  console.log(`Found ${templates.length} template file(s):\n`);
  
  // Process each template
  const variables = {
    ASSISTANT_NAME: assistantName
  };
  
  for (const templatePath of templates) {
    const relativePath = path.relative(rootDir, templatePath);
    const outputPath = processTemplate(templatePath, variables);
    const relativeOutput = path.relative(rootDir, outputPath);
    
    console.log(`  ✓ ${relativePath} → ${relativeOutput}`);
  }
  
  console.log('\n✅ Done! Context files generated successfully.');
  console.log(`\n💡 To change the assistant name, edit ASSISTANT_NAME in .env and run this script again.`);
}

main();
