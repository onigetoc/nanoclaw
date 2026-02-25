#!/usr/bin/env node
/**
 * EureClaw Monitoring CLI
 * 
 * Real-time dashboard showing what's happening in EureClaw.
 * 
 * Usage:
 *   bun run monitor           # Show dashboard
 *   bun run monitor --stats   # Show statistics
 *   bun run monitor --logs    # Tail execution logs
 */
import fs from 'fs';
import path from 'path';
import { DATA_DIR } from './config.js';
import { getModelInfo } from './opencode-config.js';

const MONITORING_LOG_DIR = path.join(DATA_DIR, 'monitoring');

interface AgentExecution {
  id: string;
  timestamp: string;
  groupName: string;
  groupFolder: string;
  chatJid: string;
  agentType: string;
  status: string;
  model: string;
  sessionId?: string;
  messageCount: number;
  duration?: number;
  error?: string;
  outputSent: boolean;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function readRecentExecutions(limit = 20): AgentExecution[] {
  const executions: AgentExecution[] = [];
  
  try {
    const files = fs.readdirSync(MONITORING_LOG_DIR)
      .filter(f => f.startsWith('executions-') && f.endsWith('.jsonl'))
      .sort()
      .reverse();

    for (const file of files) {
      const content = fs.readFileSync(path.join(MONITORING_LOG_DIR, file), 'utf-8');
      const lines = content.trim().split('\n').reverse();
      
      for (const line of lines) {
        if (executions.length >= limit) break;
        try {
          executions.push(JSON.parse(line));
        } catch {
          // Skip invalid lines
        }
      }
      
      if (executions.length >= limit) break;
    }
  } catch (err) {
    // No logs yet
  }

  return executions;
}

function showDashboard(): void {
  const modelInfo = getModelInfo();
  const executions = readRecentExecutions(20);

  console.clear();
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║              EureClaw Monitoring Dashboard                     ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Model Configuration
  console.log('📊 Model Configuration:');
  console.log(`   Primary:  ${modelInfo.primary}`);
  console.log(`   Small:    ${modelInfo.small}`);
  if (modelInfo.fallback) {
    console.log(`   Fallback: ${modelInfo.fallback}`);
  }
  if (modelInfo.vision) {
    console.log(`   Vision:   ${modelInfo.vision}`);
  }
  console.log('');

  // Recent Executions
  console.log('🚀 Recent Agent Executions:');
  console.log('');
  
  if (executions.length === 0) {
    console.log('   No executions yet.');
  } else {
    console.log('   Time     Group          Agent         Model                Status      Duration');
    console.log('   ──────── ────────────── ───────────── ──────────────────── ─────────── ────────');
    
    for (const exec of executions) {
      const time = formatTimestamp(exec.timestamp);
      const group = exec.groupFolder.padEnd(14).slice(0, 14);
      const agent = exec.agentType.padEnd(13).slice(0, 13);
      const model = exec.model.split('/').pop()?.padEnd(20).slice(0, 20) || exec.model.padEnd(20).slice(0, 20);
      const status = exec.status === 'completed' ? '✅ Success' : 
                     exec.status === 'error' ? '❌ Error  ' : 
                     '⏳ Running';
      const duration = exec.duration ? formatDuration(exec.duration).padStart(8) : '        ';
      
      console.log(`   ${time} ${group} ${agent} ${model} ${status} ${duration}`);
    }
  }

  console.log('');
  console.log('💡 Tip: Use --stats for statistics, --logs to tail logs');
  console.log('');
}

function showStats(): void {
  const executions = readRecentExecutions(100);
  
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║              EureClaw Execution Statistics                     ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  if (executions.length === 0) {
    console.log('No executions yet.');
    return;
  }

  const completed = executions.filter(e => e.status === 'completed');
  const errors = executions.filter(e => e.status === 'error');
  const successRate = (completed.length / executions.length) * 100;

  const totalDuration = executions.reduce((sum, e) => sum + (e.duration || 0), 0);
  const avgDuration = totalDuration / executions.length;

  const byAgent: Record<string, number> = {};
  const byGroup: Record<string, number> = {};
  const byModel: Record<string, number> = {};

  for (const exec of executions) {
    byAgent[exec.agentType] = (byAgent[exec.agentType] || 0) + 1;
    byGroup[exec.groupFolder] = (byGroup[exec.groupFolder] || 0) + 1;
    const modelName = exec.model.split('/').pop() || exec.model;
    byModel[modelName] = (byModel[modelName] || 0) + 1;
  }

  console.log('📈 Overall:');
  console.log(`   Total Executions: ${executions.length}`);
  console.log(`   Success Rate:     ${successRate.toFixed(1)}%`);
  console.log(`   Average Duration: ${formatDuration(avgDuration)}`);
  console.log(`   Errors:           ${errors.length}`);
  console.log('');

  console.log('🤖 By Agent Type:');
  for (const [agent, count] of Object.entries(byAgent).sort((a, b) => b[1] - a[1])) {
    const bar = '█'.repeat(Math.ceil(count / 2));
    console.log(`   ${agent.padEnd(15)} ${count.toString().padStart(3)} ${bar}`);
  }
  console.log('');

  console.log('👥 By Group:');
  for (const [group, count] of Object.entries(byGroup).sort((a, b) => b[1] - a[1])) {
    const bar = '█'.repeat(Math.ceil(count / 2));
    console.log(`   ${group.padEnd(15)} ${count.toString().padStart(3)} ${bar}`);
  }
  console.log('');

  console.log('🧠 By Model:');
  for (const [model, count] of Object.entries(byModel).sort((a, b) => b[1] - a[1])) {
    const bar = '█'.repeat(Math.ceil(count / 2));
    console.log(`   ${model.padEnd(20)} ${count.toString().padStart(3)} ${bar}`);
  }
  console.log('');
}

function tailLogs(): void {
  console.log('📜 Tailing execution logs (Ctrl+C to stop)...\n');

  const files = fs.readdirSync(MONITORING_LOG_DIR)
    .filter(f => f.startsWith('executions-') && f.endsWith('.jsonl'))
    .sort();

  if (files.length === 0) {
    console.log('No logs yet.');
    return;
  }

  const latestFile = path.join(MONITORING_LOG_DIR, files[files.length - 1]);
  let lastSize = fs.statSync(latestFile).size;

  // Show last 10 lines
  const content = fs.readFileSync(latestFile, 'utf-8');
  const lines = content.trim().split('\n').slice(-10);
  for (const line of lines) {
    try {
      const exec: AgentExecution = JSON.parse(line);
      console.log(`[${formatTimestamp(exec.timestamp)}] ${exec.groupFolder}/${exec.agentType} - ${exec.status} (${exec.model})`);
    } catch {
      // Skip invalid lines
    }
  }

  // Watch for changes
  setInterval(() => {
    const currentSize = fs.statSync(latestFile).size;
    if (currentSize > lastSize) {
      const stream = fs.createReadStream(latestFile, {
        start: lastSize,
        end: currentSize,
      });
      
      let buffer = '';
      stream.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const exec: AgentExecution = JSON.parse(line);
            console.log(`[${formatTimestamp(exec.timestamp)}] ${exec.groupFolder}/${exec.agentType} - ${exec.status} (${exec.model})`);
          } catch {
            // Skip invalid lines
          }
        }
      });
      
      lastSize = currentSize;
    }
  }, 1000);
}

// Main
const args = process.argv.slice(2);

if (args.includes('--stats')) {
  showStats();
} else if (args.includes('--logs')) {
  tailLogs();
} else {
  showDashboard();
}
