/**
 * Session Pool
 * 
 * Maintains a pool of warm OpenCode sessions for faster response times.
 * Instead of creating a new session for each message (500ms), reuse existing ones (50ms).
 */

import { createOpencodeClient } from '@opencode-ai/sdk';

interface PooledSession {
  id: string;
  client: any; // OpenCode client instance
  createdAt: number;
  lastUsed: number;
  useCount: number;
  inUse: boolean;
}

export interface SessionPoolOptions {
  maxSize: number;          // Maximum number of sessions in pool
  maxReuse: number;         // Maximum times a session can be reused
  maxAge: number;           // Maximum age of a session in ms
  healthCheckInterval: number; // How often to check session health
}

export class SessionPool {
  private pool: Map<string, PooledSession> = new Map();
  private options: SessionPoolOptions;
  private healthCheckTimer?: NodeJS.Timeout;

  constructor(options: Partial<SessionPoolOptions> = {}) {
    this.options = {
      maxSize: options.maxSize ?? 3,
      maxReuse: options.maxReuse ?? 10,
      maxAge: options.maxAge ?? 300000, // 5 minutes
      healthCheckInterval: options.healthCheckInterval ?? 60000, // 1 minute
    };

    // Start health check
    this.startHealthCheck();
  }

  /**
   * Get or create a session
   */
  async acquire(client: any): Promise<string> {
    // Try to find an available session
    for (const [id, session] of this.pool.entries()) {
      if (!session.inUse && this.isSessionHealthy(session)) {
        session.inUse = true;
        session.lastUsed = Date.now();
        session.useCount++;
        return id;
      }
    }

    // No available session, create new one if pool not full
    if (this.pool.size < this.options.maxSize) {
      const newSession = await client.session.create();
      const pooled: PooledSession = {
        id: newSession.id,
        client,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        useCount: 1,
        inUse: true,
      };
      this.pool.set(newSession.id, pooled);
      return newSession.id;
    }

    // Pool is full, wait for a session to become available or create new one
    // For now, just create a new session outside the pool
    const tempSession = await client.session.create();
    return tempSession.id;
  }

  /**
   * Release a session back to the pool
   */
  release(sessionId: string): void {
    const session = this.pool.get(sessionId);
    if (session) {
      session.inUse = false;

      // Remove if exceeded max reuse or max age
      if (session.useCount >= this.options.maxReuse || !this.isSessionHealthy(session)) {
        this.remove(sessionId);
      }
    }
  }

  /**
   * Remove a session from the pool
   */
  private async remove(sessionId: string): Promise<void> {
    const session = this.pool.get(sessionId);
    if (session) {
      try {
        await session.client.session.delete(sessionId);
      } catch (err) {
        // Ignore errors on cleanup
      }
      this.pool.delete(sessionId);
    }
  }

  /**
   * Check if a session is healthy
   */
  private isSessionHealthy(session: PooledSession): boolean {
    const age = Date.now() - session.createdAt;
    return age < this.options.maxAge && session.useCount < this.options.maxReuse;
  }

  /**
   * Health check: remove stale sessions
   */
  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(() => {
      for (const [id, session] of this.pool.entries()) {
        if (!session.inUse && !this.isSessionHealthy(session)) {
          this.remove(id);
        }
      }
    }, this.options.healthCheckInterval);
  }

  /**
   * Cleanup all sessions
   */
  async cleanup(): Promise<void> {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    const promises = Array.from(this.pool.keys()).map(id => this.remove(id));
    await Promise.all(promises);
    this.pool.clear();
  }

  /**
   * Get pool statistics
   */
  getStats() {
    const sessions = Array.from(this.pool.values());
    return {
      total: sessions.length,
      inUse: sessions.filter(s => s.inUse).length,
      available: sessions.filter(s => !s.inUse).length,
      sessions: sessions.map(s => ({
        id: s.id,
        age: Date.now() - s.createdAt,
        useCount: s.useCount,
        inUse: s.inUse,
      })),
    };
  }
}
