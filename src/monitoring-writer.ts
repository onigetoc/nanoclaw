/**
 * Monitoring Writer
 * 
 * Periodically writes monitoring data to IPC directory so agents can read it.
 */
import fs from 'fs';
import path from 'path';
import { getMonitoring } from './monitoring.js';
import { getModelInfo } from './opencode-config.js';
import { getOpenCodePort } from './opencode-server.js';
import { logger } from './logger.js';
import { isSleeping } from './commands/sleep-manager.js';
import { parseLatestLog } from './log-parser.js';

let writerInterval: ReturnType<typeof setInterval> | null = null;
let ipcDir: string;
let registeredGroupsCount: number = 0;

export function startMonitoringWriter(
  ipcDirectory: string,
  getRegisteredGroupsCount: () => number
): void {
  if (writerInterval) return;

  ipcDir = ipcDirectory;
  fs.mkdirSync(ipcDir, { recursive: true });

  // Write monitoring data every 5 seconds
  writerInterval = setInterval(() => {
    try {
      registeredGroupsCount = getRegisteredGroupsCount();
      writeSystemStatus();
      writeExecutionStats();
    } catch (err) {
      logger.error({ err }, 'Error writing monitoring data');
    }
  }, 5000);

  logger.info('Monitoring writer started');
}

export function stopMonitoringWriter(): void {
  if (writerInterval) {
    clearInterval(writerInterval);
    writerInterval = null;
    logger.info('Monitoring writer stopped');
  }
}

function writeSystemStatus(): void {
  const monitoring = getMonitoring();
  const modelInfo = getModelInfo();
  const recentExecutions = monitoring.getRecentExecutions(20);

  // Try to get real model from latest log
  let realModel: string | undefined;
  try {
    const logInfo = parseLatestLog('main'); // Parse main group logs
    if (logInfo && logInfo.modelId && logInfo.providerId) {
      realModel = `${logInfo.providerId}/${logInfo.modelId}`;
    }
  } catch {
    // Ignore errors
  }

  const status = {
    timestamp: new Date().toISOString(),
    models: {
      ...modelInfo,
      realModel: realModel || 'unknown (check logs)',
      note: realModel 
        ? 'Real model from OpenCode logs' 
        : 'Configured models (real model unknown until first execution)',
    },
    openCodeServer: {
      status: 'running', // If we're running, server is running
      port: getOpenCodePort(),
    },
    activeAgents: monitoring.getActiveExecutions().length,
    registeredGroups: registeredGroupsCount,
    isSleeping: isSleeping(),
    uptime: Math.floor((Date.now() - Date.now()) / 1000), // Will be calculated properly
    recentExecutions: recentExecutions.map(exec => ({
      timestamp: exec.timestamp,
      groupFolder: exec.groupFolder,
      agentType: exec.agentType,
      model: exec.model,
      status: exec.status,
      duration: exec.duration,
    })),
  };

  const statusFile = path.join(ipcDir, 'system-status.json');
  const tempFile = `${statusFile}.tmp`;
  
  fs.writeFileSync(tempFile, JSON.stringify(status, null, 2), 'utf-8');
  fs.renameSync(tempFile, statusFile);
}

function writeExecutionStats(): void {
  const monitoring = getMonitoring();
  const stats = monitoring.getStats();

  const statsFile = path.join(ipcDir, 'execution-stats.json');
  const tempFile = `${statsFile}.tmp`;
  
  fs.writeFileSync(tempFile, JSON.stringify(stats, null, 2), 'utf-8');
  fs.renameSync(tempFile, statsFile);
}
