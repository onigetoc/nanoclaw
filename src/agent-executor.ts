/**
 * Agent Executor with Retry and Fallback Logic
 * Wraps container/direct runner with resilience features
 */
import type { ChildProcess } from 'node:child_process';
import { logger } from './logger.js';
import { runContainerAgent, shouldUseDirectMode } from './container-runner.js';
import { runDirectAgent } from './direct-runner.js';
import type { ContainerInput, ContainerOutput } from './container-runner.js';
import type { RegisteredGroup } from './types.js';

interface RetryConfig {
  maxRetries: number;
  backoffMs: number;
  fallbackModels?: string[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  backoffMs: 2000, // Start with 2s, exponential backoff
  fallbackModels: [
    'openrouter/google/gemini-2.5-flash',
    'google/gemini-2.5-flash-lite',
    'opencode/minimax-m2.5-free',
  ],
};

/**
 * Execute agent with retry and fallback logic
 */
export async function executeAgentWithRetry(
  input: ContainerInput,
  group: RegisteredGroup,
  onProcess: (proc: ChildProcess, processName: string) => void,
  config: Partial<RetryConfig> = {},
): Promise<ContainerOutput> {
  const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  const useDirectMode = shouldUseDirectMode();
  
  let lastError: Error | null = null;
  let attempt = 0;
  
  // Try with primary model first
  while (attempt < retryConfig.maxRetries) {
    attempt++;
    
    try {
      logger.info(
        { attempt, maxRetries: retryConfig.maxRetries, group: group.name },
        'Executing agent',
      );
      
      const result = useDirectMode
        ? await runDirectAgent(group, input, onProcess)
        : await runContainerAgent(group, input, onProcess);
      
      // Success!
      if (result.status === 'success') {
        if (attempt > 1) {
          logger.info(
            { attempt, group: group.name },
            'Agent execution succeeded after retry',
          );
        }
        return result;
      }
      
      // Got a result but it's an error
      lastError = new Error(result.error || 'Unknown error');
      logger.warn(
        { attempt, error: result.error, group: group.name },
        'Agent execution failed',
      );
      
    } catch (error) {
      lastError = error as Error;
      logger.error(
        { attempt, error: (error as Error).message, group: group.name },
        'Agent execution threw exception',
      );
    }
    
    // If we have more retries, wait with exponential backoff
    if (attempt < retryConfig.maxRetries) {
      const waitMs = retryConfig.backoffMs * Math.pow(2, attempt - 1);
      logger.info(
        { attempt, waitMs, group: group.name },
        'Waiting before retry',
      );
      await sleep(waitMs);
    }
  }
  
  // All retries exhausted
  logger.error(
    { attempts: attempt, group: group.name, lastError: lastError?.message },
    'Agent execution failed after all retries',
  );
  
  return {
    status: 'error',
    result: null,
    error: `Failed after ${attempt} attempts: ${lastError?.message || 'Unknown error'}`,
  };
}

/**
 * Check if error is retryable (quota, timeout, network)
 */
function isRetryableError(error: string): boolean {
  const retryablePatterns = [
    /quota.*exceeded/i,
    /rate.*limit/i,
    /timeout/i,
    /fetch.*failed/i,
    /ECONNREFUSED/i,
    /ETIMEDOUT/i,
    /429/i, // HTTP 429 Too Many Requests
    /503/i, // HTTP 503 Service Unavailable
  ];
  
  return retryablePatterns.some(pattern => pattern.test(error));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
