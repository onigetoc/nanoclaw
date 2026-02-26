/**
 * WebUI Channel for EureClaw
 * Handles messages from the OpenCode Web UI via the REST API
 * Sends responses back via SSE to connected clients
 */
import { Channel } from '../types.js';
import { broadcastToToken } from '../api-server.js';
import { logger } from '../logger.js';

export class WebUIChannel implements Channel {
  name = 'webui';
  private connected = false;

  connect(): Promise<void> {
    this.connected = true;
    logger.info('WebUI channel connected');
    return Promise.resolve();
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    // Broadcast with the full JID (e.g. web:main) so the frontend can match it
    const message = {
      id: `bot_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      sender: 'bot',
      sender_name: 'EureClaw',
      content: text,
      timestamp: new Date().toISOString(),
      is_from_me: true,
      is_bot_message: true,
    };

    broadcastToToken(jid, message);
    logger.debug(
      { jid, textLength: text.length },
      'WebUI message sent via SSE',
    );
  }

  isConnected(): boolean {
    return this.connected;
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith('web:');
  }

  disconnect(): Promise<void> {
    this.connected = false;
    logger.info('WebUI channel disconnected');
    return Promise.resolve();
  }

  async setTyping(jid: string, isTyping: boolean): Promise<void> {
    broadcastToToken(jid, {
      id: `typing_${Date.now()}`,
      content: isTyping ? 'typing' : '',
      sender_name: 'EureClaw',
      timestamp: new Date().toISOString(),
      is_from_me: true,
      is_bot_message: false,
    });
  }
}
