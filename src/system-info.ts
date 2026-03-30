/**
 * System Information Module
 * Provides runtime information about the EureClaw instance.
 * All shell commands run async + in parallel to avoid blocking the event loop.
 */
import { exec } from 'child_process';
import os from 'os';

import { shouldUseDirectMode } from './container-runner.js';

export interface SystemInfo {
  platform: 'darwin' | 'win32' | 'linux' | string;
  platformName: string;
  containerMode: 'apple-container' | 'docker' | 'direct';
  containerAvailable: boolean;
  dockerInstalled?: boolean;
  dockerRunning?: boolean;
  dockerFunctional?: boolean;
  securityLevel: 'high' | 'medium' | 'low';
  recommendation?: string;
  nodeVersion?: string;
  opencodeVersion?: string;
  opencodeFunctional?: boolean;
}

/** Run a shell command async with a timeout. Returns stdout on success, null on failure. */
function execAsync(cmd: string, timeoutMs = 3000): Promise<string | null> {
  return new Promise((resolve) => {
    const child = exec(cmd, { timeout: timeoutMs, encoding: 'utf-8' }, (err, stdout) => {
      resolve(err ? null : (stdout ?? '').trim());
    });
    // Safety: kill if the promise somehow hangs
    setTimeout(() => { try { child.kill(); } catch {} }, timeoutMs + 500);
  });
}

function getPlatformName(platform: string): string {
  switch (platform) {
    case 'darwin': return 'macOS';
    case 'win32': return 'Windows';
    case 'linux': return 'Linux';
    default: return platform;
  }
}

// ── Cached system info (shell commands are expensive) ──
let cachedSystemInfo: SystemInfo | null = null;
let cachedAt = 0;
const CACHE_TTL = 300_000; // 5 min — platform/docker/node versions don't change at runtime
let inflightPromise: Promise<SystemInfo> | null = null;

/**
 * Get current system information.
 * Returns stale cache immediately if available, refreshes in background when expired.
 * Only blocks on the very first call (before any cache exists).
 */
export async function getSystemInfo(): Promise<SystemInfo> {
  if (cachedSystemInfo && Date.now() - cachedAt < CACHE_TTL) {
    return cachedSystemInfo;
  }
  // Stale-while-revalidate: return old cache instantly, refresh in background
  if (cachedSystemInfo) {
    if (!inflightPromise) {
      inflightPromise = fetchSystemInfo().finally(() => { inflightPromise = null; });
    }
    return cachedSystemInfo;
  }
  // First call ever — must wait
  if (inflightPromise) return inflightPromise;
  inflightPromise = fetchSystemInfo();
  try { return await inflightPromise; } finally { inflightPromise = null; }
}

/** Synchronous getter — returns cached data or null (never blocks). */
export function getSystemInfoCached(): SystemInfo | null {
  return cachedSystemInfo;
}

async function fetchSystemInfo(): Promise<SystemInfo> {
  const platform = os.platform();
  const platformName = getPlatformName(platform);
  const isDirectMode = shouldUseDirectMode();

  // Run ALL shell checks in parallel
  const [dockerVersionOut, dockerPsOut, nodeVersionOut, opencodeVersionOut] = await Promise.all([
    platform !== 'darwin' ? execAsync('docker --version') : Promise.resolve(null),
    platform !== 'darwin' ? execAsync('docker ps') : Promise.resolve(null),
    execAsync('node --version'),
    execAsync('opencode --version'),
  ]);

  const nodeVersion = nodeVersionOut ?? undefined;
  const opencodeVersion = opencodeVersionOut ?? undefined;
  const opencodeFunctional = opencodeVersionOut !== null;

  let containerMode: SystemInfo['containerMode'];
  let containerAvailable: boolean;
  let dockerInstalled: boolean | undefined;
  let dockerRunning: boolean | undefined;
  let dockerFunctional: boolean | undefined;
  let securityLevel: SystemInfo['securityLevel'];
  let recommendation: string | undefined;

  if (platform === 'darwin') {
    containerMode = 'apple-container';
    containerAvailable = true;
    securityLevel = 'high';
  } else {
    dockerInstalled = dockerVersionOut !== null;
    dockerRunning = dockerPsOut !== null;

    if (!isDirectMode && dockerInstalled && dockerRunning) {
      containerMode = 'docker';
      containerAvailable = true;
      dockerFunctional = true;
      securityLevel = 'high';
    } else {
      containerMode = 'direct';
      containerAvailable = false;
      securityLevel = 'low';

      if (!dockerInstalled) {
        dockerFunctional = false;
        recommendation = 'Docker is not installed. EureClaw runs in direct mode with lower security isolation.';
      } else if (isDirectMode) {
        dockerFunctional = false;
        recommendation = 'Docker is installed but not functional. EureClaw runs in direct mode with lower security isolation.';
      }
    }
  }

  const result: SystemInfo = {
    platform, platformName, containerMode, containerAvailable,
    dockerInstalled, dockerRunning, dockerFunctional,
    securityLevel, recommendation, nodeVersion,
    opencodeVersion, opencodeFunctional,
  };

  cachedSystemInfo = result;
  cachedAt = Date.now();
  return result;
}
