/**
 * Shared command side-effects handler.
 * Called by ALL channels (Telegram, WhatsApp, Web UI) after executeCommand().
 * This ensures commands like /new work identically everywhere.
 */
import fs from 'fs';
import path from 'path';
import { createOpencodeClient } from '@opencode-ai/sdk';
import { DATA_DIR } from '../config.js';
import { logger } from '../logger.js';
import { getOpenCodeHost, getOpenCodePort } from '../opencode-server.js';
import {
  getSessions,
  setGroupSession,
  setLastAgentTimestampForJid,
  saveState,
} from '../state.js';
import { CommandResponse } from './index.js';
import { RegisteredGroup } from '../types.js';
import { clearUndoState } from './undo-manager.js';

/**
 * Process side effects for a command result.
 * Mutates commandResult.reply if needed (e.g. to include session ID).
 * Returns true if the command was fully handled (caller should NOT forward to agent).
 */
export async function handleCommandSideEffects(
  commandResult: CommandResponse,
  chatJid: string,
  group?: RegisteredGroup,
): Promise<boolean> {
  // /new — create fresh OpenCode session
  if (
    commandResult.data?.opencodeCommand === 'new' &&
    commandResult.data?.forceNewSession &&
    group
  ) {
    console.log(`\n🆕 /new command for ${group.folder} (${chatJid}) — creating fresh session`);
    logger.info({ chatJid, groupFolder: group.folder }, '/new: Creating fresh OpenCode session');

    // 1. Kill the running agent-runner (it holds the old session in memory)
    const closeSentinel = path.join(DATA_DIR, 'ipc', group.folder, 'input', '_close');
    try {
      fs.mkdirSync(path.dirname(closeSentinel), { recursive: true });
      fs.writeFileSync(closeSentinel, '');
      logger.info({ groupFolder: group.folder }, '/new: Sent _close to agent-runner');
    } catch {
      // Agent-runner may not be running — that's fine
    }

    // 2. Create a new session directly via the OpenCode SDK
    try {
      const baseUrl = `http://${getOpenCodeHost()}:${getOpenCodePort()}`;
      const client = createOpencodeClient({ baseUrl });
      const sessionResult = await client.session.create();
      const newSessionId = (sessionResult as any).data?.id ?? (sessionResult as any).id;

      if (newSessionId && typeof newSessionId === 'string') {
        setGroupSession(group.folder, newSessionId);
        clearUndoState(newSessionId); // Clear undo/redo history for new session
        const shortId = newSessionId.slice(0, 12) + '...';
        commandResult.reply = `🆕 New session created (${shortId}).`;
        logger.info({ chatJid, groupFolder: group.folder, newSessionId }, '/new: Session created');
      } else {
        setGroupSession(group.folder, '');
        logger.warn({ chatJid }, '/new: SDK returned no session ID, cleared session');
      }
    } catch (err) {
      setGroupSession(group.folder, '');
      logger.warn(
        { chatJid, err: err instanceof Error ? err.message : String(err) },
        '/new: SDK session.create failed, cleared session as fallback',
      );
    }

    // 3. Set timestamp to NOW so old messages are excluded
    setLastAgentTimestampForJid(chatJid, new Date().toISOString());
    saveState();
    return true;
  }

  return false;
}
