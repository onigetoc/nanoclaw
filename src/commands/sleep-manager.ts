/**
 * Sleep/Awake system for EureClaw
 * Allows pausing all bot activity (messages, crons) until awakened
 */

import fs from 'fs';
import path from 'path';
import { DATA_DIR, ASSISTANT_NAME } from '../config.js';
import { logger } from '../logger.js';

interface SleepState {
  isSleeping: boolean;
  sleepStartTime?: string;
  sleepDuration?: number; // in milliseconds, null = indefinite
  sleepUntil?: string; // ISO timestamp when auto-wake should happen
  sleepRequestedBy?: string;
  sleepRequestedFrom?: string; // chatJid
}

const SLEEP_STATE_FILE = path.join(DATA_DIR, 'sleep-state.json');

let currentState: SleepState = {
  isSleeping: false,
};

let wakeTimer: ReturnType<typeof setTimeout> | null = null;
let onWakeCallback: ((chatJid: string, message: string) => void) | null = null;

/**
 * Set callback for when bot wakes up automatically
 */
export function setOnWakeCallback(callback: (chatJid: string, message: string) => void): void {
  onWakeCallback = callback;
}

/**
 * Load sleep state from disk
 */
export function loadSleepState(): void {
  try {
    if (fs.existsSync(SLEEP_STATE_FILE)) {
      const data = fs.readFileSync(SLEEP_STATE_FILE, 'utf-8');
      currentState = JSON.parse(data);

      // Check if we should auto-wake
      if (currentState.isSleeping && currentState.sleepUntil) {
        const wakeTime = new Date(currentState.sleepUntil).getTime();
        const now = Date.now();
        
        if (now >= wakeTime) {
          logger.info('Auto-waking from scheduled sleep');
          currentState.isSleeping = false;
          currentState.sleepUntil = undefined;
          currentState.sleepDuration = undefined;
          saveSleepState();
        }
      }

      logger.info({ state: currentState }, 'Sleep state loaded');
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to load sleep state, using defaults');
  }
}

/**
 * Save sleep state to disk
 */
function saveSleepState(): void {
  try {
    fs.writeFileSync(SLEEP_STATE_FILE, JSON.stringify(currentState, null, 2), 'utf-8');
  } catch (err) {
    logger.error({ err }, 'Failed to save sleep state');
  }
}

/**
 * Put the bot to sleep
 * @param duration - Duration in milliseconds, or null for indefinite sleep
 * @param requestedBy - Name of person who requested sleep
 * @param chatJid - Chat where sleep was requested
 */
export function sleep(duration: number | null, requestedBy: string, chatJid: string): void {
  // Clear any existing timer
  if (wakeTimer) {
    clearTimeout(wakeTimer);
    wakeTimer = null;
  }

  currentState = {
    isSleeping: true,
    sleepStartTime: new Date().toISOString(),
    sleepDuration: duration ?? undefined,
    sleepUntil: duration ? new Date(Date.now() + duration).toISOString() : undefined,
    sleepRequestedBy: requestedBy,
    sleepRequestedFrom: chatJid,
  };

  saveSleepState();

  // Set timer for auto-wake if duration specified
  if (duration && onWakeCallback) {
    wakeTimer = setTimeout(() => {
      const sleepDuration = currentState.sleepStartTime
        ? Date.now() - new Date(currentState.sleepStartTime).getTime()
        : duration;

      awake();

      const message = `☀️ ${ASSISTANT_NAME} is now awake!\n\nSlept for: ${formatDuration(sleepDuration)}`;
      
      if (onWakeCallback && chatJid) {
        onWakeCallback(chatJid, message);
      }
    }, duration);
  }

  logger.info(
    {
      duration: duration ? `${duration}ms` : 'indefinite',
      requestedBy,
      chatJid,
      sleepUntil: currentState.sleepUntil,
    },
    'Bot entered sleep mode',
  );
}

/**
 * Wake the bot up
 */
export function awake(): void {
  const wasSleeping = currentState.isSleeping;
  
  // Clear timer if exists
  if (wakeTimer) {
    clearTimeout(wakeTimer);
    wakeTimer = null;
  }

  currentState = {
    isSleeping: false,
  };

  saveSleepState();

  if (wasSleeping) {
    logger.info('Bot awakened from sleep mode');
  }
}

/**
 * Check if the bot is currently sleeping
 */
export function isSleeping(): boolean {
  // Check for auto-wake
  if (currentState.isSleeping && currentState.sleepUntil) {
    const wakeTime = new Date(currentState.sleepUntil).getTime();
    const now = Date.now();
    
    if (now >= wakeTime) {
      logger.info('Auto-waking from scheduled sleep');
      awake();
      return false;
    }
  }

  return currentState.isSleeping;
}

/**
 * Get current sleep state
 */
export function getSleepState(): Readonly<SleepState> {
  return { ...currentState };
}

/**
 * Format sleep duration for human-readable display
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

/**
 * Parse duration string (e.g., "4h", "30m", "2d", "1h30m")
 */
export function parseDuration(durationStr: string): number | null {
  const regex = /(\d+)([dhms])/g;
  let totalMs = 0;
  let match;

  while ((match = regex.exec(durationStr.toLowerCase())) !== null) {
    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 'd':
        totalMs += value * 24 * 60 * 60 * 1000;
        break;
      case 'h':
        totalMs += value * 60 * 60 * 1000;
        break;
      case 'm':
        totalMs += value * 60 * 1000;
        break;
      case 's':
        totalMs += value * 1000;
        break;
    }
  }

  return totalMs > 0 ? totalMs : null;
}
