/**
 * Log Parser
 * 
 * Parses OpenCode execution logs to extract real model information.
 */
import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';

export interface ParsedLogInfo {
  modelId?: string;
  providerId?: string;
  agentType?: string;
  tokensUsed?: number;
  duration?: number;
}

/**
 * Parse the most recent log file for a group to extract real model info.
 * 
 * OpenCode writes logs with JSON snippets containing:
 * - "modelID": "minimax-m2.5-free"
 * - "providerID": "opencode"
 * - "agent": "build" | "orchestrator" | etc.
 * - "tokens": {...}
 */
export function parseLatestLog(workspaceFolder: string): ParsedLogInfo | null {
  try {
    const logsDir = path.join(process.cwd(), 'workspaces', workspaceFolder, 'logs');
    
    if (!fs.existsSync(logsDir)) {
      return null;
    }

    // Get most recent log file
    const logFiles = fs.readdirSync(logsDir)
      .filter(f => f.endsWith('.log'))
      .map(f => ({
        name: f,
        path: path.join(logsDir, f),
        mtime: fs.statSync(path.join(logsDir, f)).mtime,
      }))
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    if (logFiles.length === 0) {
      return null;
    }

    const latestLog = logFiles[0];
    const content = fs.readFileSync(latestLog.path, 'utf-8');

    // Look for the Response.data snippet that contains model info
    // Format: "modelID":"minimax-m2.5-free","providerID":"opencode"
    const modelIdMatch = content.match(/"modelID":"([^"]+)"/);
    const providerIdMatch = content.match(/"providerID":"([^"]+)"/);
    const agentMatch = content.match(/"agent":"([^"]+)"/);
    
    // Extract token usage
    const tokensMatch = content.match(/"tokens":\{[^}]*"total":(\d+)/);
    
    // Extract duration from time fields
    const timeMatch = content.match(/"time":\{"created":(\d+),"completed":(\d+)\}/);
    let duration: number | undefined;
    if (timeMatch) {
      const created = parseInt(timeMatch[1], 10);
      const completed = parseInt(timeMatch[2], 10);
      duration = completed - created;
    }

    if (!modelIdMatch || !providerIdMatch) {
      return null;
    }

    return {
      modelId: modelIdMatch[1],
      providerId: providerIdMatch[1],
      agentType: agentMatch ? agentMatch[1] : undefined,
      tokensUsed: tokensMatch ? parseInt(tokensMatch[1], 10) : undefined,
      duration,
    };
  } catch (err) {
    logger.debug({ err, workspaceFolder }, 'Failed to parse latest log');
    return null;
  }
}

/**
 * Watch a log file and call callback when model info is detected.
 * Used for real-time monitoring during agent execution.
 */
export function watchLogForModel(
  logFilePath: string,
  callback: (info: ParsedLogInfo) => void
): () => void {
  let lastSize = 0;
  
  try {
    if (fs.existsSync(logFilePath)) {
      lastSize = fs.statSync(logFilePath).size;
    }
  } catch {
    // File doesn't exist yet
  }

  const interval = setInterval(() => {
    try {
      if (!fs.existsSync(logFilePath)) {
        return;
      }

      const currentSize = fs.statSync(logFilePath).size;
      
      if (currentSize > lastSize) {
        // Read new content
        const stream = fs.createReadStream(logFilePath, {
          start: lastSize,
          end: currentSize,
        });

        let buffer = '';
        stream.on('data', (chunk) => {
          buffer += chunk.toString();
        });

        stream.on('end', () => {
          // Look for model info in new content
          const modelIdMatch = buffer.match(/"modelID":"([^"]+)"/);
          const providerIdMatch = buffer.match(/"providerID":"([^"]+)"/);
          
          if (modelIdMatch && providerIdMatch) {
            callback({
              modelId: modelIdMatch[1],
              providerId: providerIdMatch[1],
            });
          }
        });

        lastSize = currentSize;
      }
    } catch (err) {
      logger.debug({ err, logFilePath }, 'Error watching log file');
    }
  }, 500); // Check every 500ms

  // Return cleanup function
  return () => clearInterval(interval);
}
