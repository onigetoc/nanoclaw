/**
 * Tests for OpenCode command handlers
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { executeCommand, getRegisteredCommands } from '../index.js';
import { EURECLAW_COMMANDS, isEureClawCommand, isOpenCodeCommand } from '../opencode-commands.js';
import '../builtin-commands.js';
import '../opencode-commands.js';

describe('OpenCode Commands', () => {
  const mockContext = {
    chatJid: 'test@g.us',
    senderName: 'Test User',
    senderId: 'test123',
    group: {
      name: 'test',
      folder: 'test',
      trigger: '@andy',
      added_at: new Date().toISOString(),
    },
  };

  describe('Command Registration', () => {
    it('should register /new command', () => {
      const commands = getRegisteredCommands();
      expect(commands).toContain('new');
    });

    it('should have all EureClaw commands registered', () => {
      const commands = getRegisteredCommands();
      const eureClawCommands = Array.from(EURECLAW_COMMANDS);
      
      for (const cmd of eureClawCommands) {
        expect(commands).toContain(cmd);
      }
    });
  });

  describe('Command Detection', () => {
    it('should identify EureClaw commands', () => {
      expect(isEureClawCommand('restart')).toBe(true);
      expect(isEureClawCommand('sleep')).toBe(true);
      expect(isEureClawCommand('awake')).toBe(true);
      expect(isEureClawCommand('status')).toBe(true);
      expect(isEureClawCommand('help')).toBe(true);
    });

    it('should identify non-EureClaw commands', () => {
      expect(isEureClawCommand('new')).toBe(false);
      expect(isEureClawCommand('unknown')).toBe(false);
    });

    it('should detect OpenCode commands in messages', () => {
      expect(isOpenCodeCommand('/new')).toBe(true);
      expect(isOpenCodeCommand('/new session')).toBe(true);
      expect(isOpenCodeCommand('/restart')).toBe(false);
      expect(isOpenCodeCommand('not a command')).toBe(false);
    });
  });

  describe('/new Command', () => {
    it('should return success response with OpenCode data', async () => {
      const result = await executeCommand('/new', mockContext);
      
      expect(result).toBeDefined();
      expect(result?.reply).toContain('Starting a new session');
      expect(result?.action).toBe('none');
      expect(result?.data).toEqual({
        opencodeCommand: 'new',
        forceNewSession: true,
      });
    });

    it('should require registered group', async () => {
      const contextWithoutGroup = {
        ...mockContext,
        group: undefined,
      };
      
      const result = await executeCommand('/new', contextWithoutGroup);
      
      expect(result).toBeDefined();
      expect(result?.reply).toContain('only available in registered chats');
    });

    it('should be case-insensitive', async () => {
      const result = await executeCommand('/NEW', mockContext);
      
      expect(result).toBeDefined();
      expect(result?.data?.opencodeCommand).toBe('new');
    });
  });

  describe('Command Parsing', () => {
    it('should parse command with no arguments', async () => {
      const result = await executeCommand('/new', mockContext);
      expect(result).toBeDefined();
    });

    it('should ignore non-command messages', async () => {
      const result = await executeCommand('hello world', mockContext);
      expect(result).toBeNull();
    });

    it('should handle unknown commands', async () => {
      const result = await executeCommand('/unknown', mockContext);
      expect(result).toBeNull();
    });
  });
});
