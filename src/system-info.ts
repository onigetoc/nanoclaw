/**
 * System Information Module
 * Provides runtime information about the EureClaw instance
 */
import { execSync } from 'child_process';
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

/**
 * Check if Docker is installed
 */
function isDockerInstalled(): boolean {
  try {
    execSync('docker --version', { stdio: 'pipe', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Docker daemon is running
 */
function isDockerRunning(): boolean {
  try {
    execSync('docker ps', { stdio: 'pipe', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get Node.js version
 */
function getNodeVersion(): string | undefined {
  try {
    const version = execSync('node --version', { encoding: 'utf-8', timeout: 5000 }).trim();
    return version;
  } catch {
    return undefined;
  }
}

/**
 * Get OpenCode version and check if functional
 */
function getOpenCodeInfo(): { version?: string; functional: boolean } {
  try {
    const version = execSync('opencode --version', { encoding: 'utf-8', timeout: 5000 }).trim();
    return { version, functional: true };
  } catch {
    return { functional: false };
  }
}

/**
 * Get human-readable platform name
 */
function getPlatformName(platform: string): string {
  switch (platform) {
    case 'darwin':
      return 'macOS';
    case 'win32':
      return 'Windows';
    case 'linux':
      return 'Linux';
    default:
      return platform;
  }
}

/**
 * Get current system information
 */
export function getSystemInfo(): SystemInfo {
  const platform = os.platform();
  const platformName = getPlatformName(platform);
  const isDirectMode = shouldUseDirectMode();

  let containerMode: SystemInfo['containerMode'];
  let containerAvailable: boolean;
  let dockerInstalled: boolean | undefined;
  let dockerRunning: boolean | undefined;
  let dockerFunctional: boolean | undefined;
  let securityLevel: SystemInfo['securityLevel'];
  let recommendation: string | undefined;

  // Get Node.js and OpenCode info
  const nodeVersion = getNodeVersion();
  const opencodeInfo = getOpenCodeInfo();

  if (platform === 'darwin') {
    // macOS: Always uses Apple Container
    containerMode = 'apple-container';
    containerAvailable = true;
    securityLevel = 'high';
  } else {
    // Windows/Linux: Check Docker availability
    dockerInstalled = isDockerInstalled();
    dockerRunning = dockerInstalled ? isDockerRunning() : false;

    if (!isDirectMode && dockerInstalled && dockerRunning) {
      // Docker is available and being used
      containerMode = 'docker';
      containerAvailable = true;
      dockerFunctional = true;
      securityLevel = 'high';
    } else {
      // Fallback to direct mode
      containerMode = 'direct';
      containerAvailable = false;
      securityLevel = 'low';

      // Simplified Docker messaging - don't guess why it doesn't work
      if (!dockerInstalled) {
        dockerFunctional = false;
        recommendation = `Docker is not installed. EureClaw runs in direct mode with lower security isolation.`;
      } else if (isDirectMode) {
        // We're in direct mode even though Docker is installed
        // This means Docker is not functional on this system
        dockerFunctional = false;
        recommendation = `Docker is installed but not functional. EureClaw runs in direct mode with lower security isolation.`;
      }
    }
  }

  return {
    platform,
    platformName,
    containerMode,
    containerAvailable,
    dockerInstalled,
    dockerRunning,
    dockerFunctional,
    securityLevel,
    recommendation,
    nodeVersion,
    opencodeVersion: opencodeInfo.version,
    opencodeFunctional: opencodeInfo.functional,
  };
}
