/**
 * EureClaw Monitoring System
 * 
 * Tracks and logs all agent activity, model usage, and system state.
 * Provides real-time visibility into what's happening in the system.
 */
import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';
import { getModelInfo } from './opencode-config.js';

export interface AgentExecution {
  id: string;
  timestamp: string;
  groupName: string;
  groupFolder: string;
  chatJid: string;
  agentType: 'orchestrator' | 'researcher' | 'planner' | 'summarizer' | 'chat' | 'build';
  status: 'started' | 'running' | 'completed' | 'error';
  model: string;
  sessionId?: string;
  messageCount: number;
  duration?: number; // milliseconds
  error?: string;
  outputSent: boolean;
}

export interface ModelUsage {
  timestamp: string;
  model: string;
  groupFolder: string;
  agentType: string;
  tokensUsed?: number;
}

export interface SystemState {
  openCodeServerStatus: 'running' | 'stopped' | 'error';
  openCodeServerPort: number;
  activeAgents: number;
  registeredGroups: number;
  isSleeping: boolean;
  uptime: number; // seconds
}

class MonitoringService {
  private executions: Map<string, AgentExecution> = new Map();
  private recentExecutions: AgentExecution[] = [];
  private maxRecentExecutions = 100;
  private startTime = Date.now();
  private logsDir: string;

  constructor(logsDir: string) {
    this.logsDir = logsDir;
    fs.mkdirSync(logsDir, { recursive: true });
  }

  /**
   * Start tracking an agent execution
   */
  startExecution(params: {
    groupName: string;
    groupFolder: string;
    chatJid: string;
    agentType?: string;
    sessionId?: string;
    messageCount: number;
  }): string {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const modelInfo = getModelInfo();
    
    const execution: AgentExecution = {
      id,
      timestamp: new Date().toISOString(),
      groupName: params.groupName,
      groupFolder: params.groupFolder,
      chatJid: params.chatJid,
      agentType: (params.agentType as any) || 'orchestrator',
      status: 'started',
      model: modelInfo.primary + ' (configured)', // Mark as configured, will be updated with real model
      sessionId: params.sessionId,
      messageCount: params.messageCount,
      outputSent: false,
    };

    this.executions.set(id, execution);
    
    logger.info({
      executionId: id,
      group: params.groupName,
      agent: execution.agentType,
      model: execution.model,
      messages: params.messageCount,
      sessionId: params.sessionId,
    }, '🚀 Agent execution started');

    return id;
  }
  
  /**
   * Update execution with real model from OpenCode logs
   */
  setRealModel(id: string, modelId: string, providerId: string): void {
    const execution = this.executions.get(id);
    if (execution) {
      execution.model = `${providerId}/${modelId}`;
      logger.info({
        executionId: id,
        realModel: execution.model,
      }, '🧠 Real model detected from OpenCode');
    }
  }

  /**
   * Update execution status
   */
  updateExecution(id: string, updates: Partial<AgentExecution>): void {
    const execution = this.executions.get(id);
    if (!execution) return;

    Object.assign(execution, updates);

    if (updates.status === 'completed' || updates.status === 'error') {
      execution.duration = Date.now() - new Date(execution.timestamp).getTime();
      this.recentExecutions.unshift(execution);
      if (this.recentExecutions.length > this.maxRecentExecutions) {
        this.recentExecutions.pop();
      }
      this.executions.delete(id);

      // Log completion
      if (updates.status === 'completed') {
        logger.info({
          executionId: id,
          group: execution.groupName,
          agent: execution.agentType,
          duration: execution.duration,
          outputSent: execution.outputSent,
        }, '✅ Agent execution completed');
      } else {
        logger.error({
          executionId: id,
          group: execution.groupName,
          agent: execution.agentType,
          error: updates.error,
          duration: execution.duration,
        }, '❌ Agent execution failed');
      }

      // Write to log file
      this.writeExecutionLog(execution);
    }
  }

  /**
   * Mark that output was sent to user
   */
  markOutputSent(id: string): void {
    const execution = this.executions.get(id);
    if (execution) {
      execution.outputSent = true;
    }
  }

  /**
   * Get active executions
   */
  getActiveExecutions(): AgentExecution[] {
    return Array.from(this.executions.values());
  }

  /**
   * Get recent executions
   */
  getRecentExecutions(limit = 20): AgentExecution[] {
    return this.recentExecutions.slice(0, limit);
  }

  /**
   * Get system state
   */
  getSystemState(additionalInfo: {
    openCodeServerStatus: 'running' | 'stopped' | 'error';
    openCodeServerPort: number;
    registeredGroups: number;
    isSleeping: boolean;
  }): SystemState {
    return {
      ...additionalInfo,
      activeAgents: this.executions.size,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }

  /**
   * Write execution log to file
   */
  private writeExecutionLog(execution: AgentExecution): void {
    try {
      const date = new Date(execution.timestamp);
      const dateStr = date.toISOString().split('T')[0];
      const logFile = path.join(this.logsDir, `executions-${dateStr}.jsonl`);
      
      const logLine = JSON.stringify(execution) + '\n';
      fs.appendFileSync(logFile, logLine, 'utf-8');
    } catch (err) {
      logger.error({ err }, 'Failed to write execution log');
    }
  }

  /**
   * Get execution statistics
   */
  getStats(): {
    totalExecutions: number;
    successRate: number;
    averageDuration: number;
    byAgent: Record<string, number>;
    byGroup: Record<string, number>;
  } {
    const completed = this.recentExecutions.filter(e => e.status === 'completed');
    const total = this.recentExecutions.length;
    
    const byAgent: Record<string, number> = {};
    const byGroup: Record<string, number> = {};
    let totalDuration = 0;

    for (const exec of this.recentExecutions) {
      byAgent[exec.agentType] = (byAgent[exec.agentType] || 0) + 1;
      byGroup[exec.groupFolder] = (byGroup[exec.groupFolder] || 0) + 1;
      if (exec.duration) {
        totalDuration += exec.duration;
      }
    }

    return {
      totalExecutions: total,
      successRate: total > 0 ? (completed.length / total) * 100 : 0,
      averageDuration: total > 0 ? totalDuration / total : 0,
      byAgent,
      byGroup,
    };
  }
}

// Singleton instance
let monitoringService: MonitoringService | null = null;

export function initMonitoring(logsDir: string): void {
  if (!monitoringService) {
    monitoringService = new MonitoringService(logsDir);
    logger.info({ logsDir }, 'Monitoring service initialized');
  }
}

export function getMonitoring(): MonitoringService {
  if (!monitoringService) {
    throw new Error('Monitoring service not initialized. Call initMonitoring() first.');
  }
  return monitoringService;
}
