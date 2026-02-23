import { Bot, InputFile } from 'grammy';
import path from 'path';
import fs from 'fs/promises';

import { ASSISTANT_NAME, TRIGGER_PATTERN } from '../config.js';
import { logger } from '../logger.js';
import {
  Channel,
  OnInboundMessage,
  OnChatMetadata,
  RegisteredGroup,
} from '../types.js';
import { getTranscriptionManager, isAudioTranscriptionAvailable } from '../media/audio-manager.js';
import { analyzeImage, isVisionEnabled } from '../vision.js';

export interface TelegramChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  registeredGroups: () => Record<string, RegisteredGroup>;
}

export class TelegramChannel implements Channel {
  name = 'telegram';

  private bot: Bot | null = null;
  private opts: TelegramChannelOpts;
  private botToken: string;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private lastActivity: number = Date.now();
  private isShuttingDown: boolean = false;

  constructor(botToken: string, opts: TelegramChannelOpts) {
    this.botToken = botToken;
    this.opts = opts;
  }

  async connect(): Promise<void> {
    if (this.isShuttingDown) return;
    
    this.bot = new Bot(this.botToken);

    // Command to get chat ID (useful for registration)
    this.bot.command('chatid', (ctx) => {
      this.lastActivity = Date.now();
      const chatId = ctx.chat.id;
      const chatType = ctx.chat.type;
      const chatName =
        chatType === 'private'
          ? ctx.from?.first_name || 'Private'
          : (ctx.chat as any).title || 'Unknown';

      ctx.reply(
        `Chat ID: \`tg:${chatId}\`\nName: ${chatName}\nType: ${chatType}`,
        { parse_mode: 'Markdown' },
      );
    });

    this.bot.on('message:text', async (ctx) => {
      this.lastActivity = Date.now();

      const chatJid = `tg:${ctx.chat.id}`;
      let content = ctx.message.text;
      const timestamp = new Date(ctx.message.date * 1000).toISOString();
      const senderName =
        ctx.from?.first_name ||
        ctx.from?.username ||
        ctx.from?.id.toString() ||
        'Unknown';
      const sender = ctx.from?.id.toString() || '';
      const msgId = ctx.message.message_id.toString();

      // Determine chat name
      const chatName =
        ctx.chat.type === 'private'
          ? senderName
          : (ctx.chat as any).title || chatJid;

      // Translate Telegram @bot_username mentions into TRIGGER_PATTERN format.
      // Telegram @mentions (e.g., @my_bot) won't match TRIGGER_PATTERN
      // (e.g., ^@Bot\b), so we prepend the trigger when the bot is @mentioned.
      const botUsername = ctx.me?.username?.toLowerCase();
      if (botUsername) {
        const entities = ctx.message.entities || [];
        const isBotMentioned = entities.some((entity) => {
          if (entity.type === 'mention') {
            const mentionText = content
              .substring(entity.offset, entity.offset + entity.length)
              .toLowerCase();
            return mentionText === `@${botUsername}`;
          }
          return false;
        });
        if (isBotMentioned && !TRIGGER_PATTERN.test(content)) {
          content = `@${ASSISTANT_NAME} ${content}`;
        }
      }

      // Store chat metadata for discovery
      this.opts.onChatMetadata(chatJid, timestamp, chatName);

      // Only deliver full message for registered groups
      const group = this.opts.registeredGroups()[chatJid];
      if (!group) {
        // Check if this is the first private chat and no main group exists
        if (ctx.chat.type === 'private') {
          const allGroups = this.opts.registeredGroups();
          const hasMainGroup = Object.values(allGroups).some(
            (g) => g.folder === 'main',
          );

          if (!hasMainGroup) {
            // First private chat - send instructions for auto-setup
            await ctx.reply(
              `👋 Welcome! I'm ${ASSISTANT_NAME}.\n\n` +
                `To get started, I need to register this chat.\n` +
                `Please send me any message and I'll set everything up automatically!`,
            );
          }
        }

        logger.debug(
          { chatJid, chatName },
          'Message from unregistered Telegram chat',
        );
        return;
      }

      // Deliver message — startMessageLoop() will pick it up
      this.opts.onMessage(chatJid, {
        id: msgId,
        chat_jid: chatJid,
        sender,
        sender_name: senderName,
        content,
        timestamp,
        is_from_me: false,
        is_private_chat: ctx.chat.type === 'private',
      });

      logger.info(
        { chatJid, chatName, sender: senderName },
        'Telegram message stored',
      );
    });

    // Handle non-text messages with placeholders so the agent knows something was sent
    const storeNonText = (ctx: any, placeholder: string) => {
      const chatJid = `tg:${ctx.chat.id}`;
      const group = this.opts.registeredGroups()[chatJid];
      if (!group) return;

      const timestamp = new Date(ctx.message.date * 1000).toISOString();
      const senderName =
        ctx.from?.first_name ||
        ctx.from?.username ||
        ctx.from?.id?.toString() ||
        'Unknown';
      const caption = ctx.message.caption ? ` ${ctx.message.caption}` : '';

      this.opts.onChatMetadata(chatJid, timestamp);
      this.opts.onMessage(chatJid, {
        id: ctx.message.message_id.toString(),
        chat_jid: chatJid,
        sender: ctx.from?.id?.toString() || '',
        sender_name: senderName,
        content: `${placeholder}${caption}`,
        timestamp,
        is_from_me: false,
        is_private_chat: ctx.chat.type === 'private',
      });
    };

    this.bot.on('message:photo', async (ctx) => {
      const chatJid = `tg:${ctx.chat.id}`;
      const group = this.opts.registeredGroups()[chatJid];
      if (!group) return;

      const timestamp = new Date(ctx.message.date * 1000).toISOString();
      const senderName =
        ctx.from?.first_name ||
        ctx.from?.username ||
        ctx.from?.id?.toString() ||
        'Unknown';
      const caption = ctx.message.caption ? ` ${ctx.message.caption}` : '';

      this.opts.onChatMetadata(chatJid, timestamp);

      let content = '[Photo]';

      if (isVisionEnabled() && ctx.message.photo) {
        try {
          const photos = ctx.message.photo;
          const largestPhoto = photos[photos.length - 1];
          const file = await ctx.getFile();
          const fileInfo = await fetch(
            `https://api.telegram.org/file/bot${this.botToken}/${file.file_path}`,
          );
          const imageBuffer = Buffer.from(await fileInfo.arrayBuffer());

          const description = await analyzeImage(imageBuffer, 'image/jpeg');
          if (description) {
            content = `[Photo: ${description.trim()}]`;
            logger.info(
              { chatJid, length: description.length },
              'Photo analyzed',
            );
          }
        } catch (err) {
          logger.warn(
            { chatJid, err },
            'Photo vision failed, using placeholder',
          );
        }
      }

      this.opts.onMessage(chatJid, {
        id: ctx.message.message_id.toString(),
        chat_jid: chatJid,
        sender: ctx.from?.id?.toString() || '',
        sender_name: senderName,
        content: `${content}${caption}`,
        timestamp,
        is_from_me: false,
        is_private_chat: ctx.chat.type === 'private',
      });
    });
    this.bot.on('message:video', (ctx) => storeNonText(ctx, '[Video]'));
    this.bot.on('message:voice', async (ctx) => {
      const chatJid = `tg:${ctx.chat.id}`;
      const group = this.opts.registeredGroups()[chatJid];
      if (!group) return;

      const timestamp = new Date(ctx.message.date * 1000).toISOString();
      const senderName =
        ctx.from?.first_name ||
        ctx.from?.username ||
        ctx.from?.id?.toString() ||
        'Unknown';
      const caption = ctx.message.caption ? ` ${ctx.message.caption}` : '';

      this.opts.onChatMetadata(chatJid, timestamp);

      let content = '[Voice message]';

      // Use new Groq Whisper transcription system
      if (isAudioTranscriptionAvailable() && ctx.message.voice) {
        try {
          const file = await ctx.getFile();
          const fileUrl = `https://api.telegram.org/file/bot${this.botToken}/${file.file_path}`;
          const fileInfo = await fetch(fileUrl);
          const audioBuffer = Buffer.from(await fileInfo.arrayBuffer());

          const manager = getTranscriptionManager();
          if (manager) {
            const result = await manager.transcribe(
              audioBuffer,
              'voice.ogg',
              undefined // Auto-detect language
            );
            
            if (result && result.text) {
              content = `[Audio] Transcript: "${result.text.trim()}"`;
              logger.info(
                { 
                  chatJid, 
                  length: result.text.length,
                  provider: result.provider,
                  duration: result.duration 
                },
                'Voice message transcribed with Groq Whisper',
              );
            }
          }
        } catch (err: any) {
          logger.warn(
            { 
              chatJid, 
              error: err.message,
              code: err.code,
              retryAfter: err.retryAfter 
            },
            'Voice transcription failed, using placeholder',
          );
          
          // If rate limit, log it clearly
          if (err.code === 'RATE_LIMIT') {
            logger.warn(
              { retryAfter: err.retryAfter },
              'Groq rate limit hit, will retry after cooldown'
            );
          }
        }
      }

      this.opts.onMessage(chatJid, {
        id: ctx.message.message_id.toString(),
        chat_jid: chatJid,
        sender: ctx.from?.id?.toString() || '',
        sender_name: senderName,
        content: `${content}${caption}`,
        timestamp,
        is_from_me: false,
        is_private_chat: ctx.chat.type === 'private',
      });
    });
    this.bot.on('message:audio', (ctx) => storeNonText(ctx, '[Audio]'));
    this.bot.on('message:document', (ctx) => {
      const name = ctx.message.document?.file_name || 'file';
      storeNonText(ctx, `[Document: ${name}]`);
    });
    this.bot.on('message:sticker', (ctx) => {
      const emoji = ctx.message.sticker?.emoji || '';
      storeNonText(ctx, `[Sticker ${emoji}]`);
    });
    this.bot.on('message:location', (ctx) => storeNonText(ctx, '[Location]'));
    this.bot.on('message:contact', (ctx) => storeNonText(ctx, '[Contact]'));

    // Handle errors gracefully with reconnection
    this.bot.catch((err) => {
      logger.error({ err: err.message }, 'Telegram bot error');
      // Schedule reconnection on critical errors
      if (!this.isShuttingDown && !this.reconnectTimer) {
        logger.warn('Scheduling Telegram reconnection in 10 seconds...');
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          this.reconnect();
        }, 10000);
      }
    });

    // Start polling — returns a Promise that resolves when started
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Telegram bot connection timeout'));
      }, 30000);

      this.bot!.start({
        onStart: (botInfo) => {
          clearTimeout(timeout);
          logger.info(
            { username: botInfo.username, id: botInfo.id },
            'Telegram bot connected',
          );
          console.log(`\n  Telegram bot: @${botInfo.username}`);
          console.log(
            `  Send /chatid to the bot to get a chat's registration ID\n`,
          );
          
          // Start keep-alive mechanism
          this.startKeepAlive();
          
          resolve();
        },
      }).catch((err) => {
        clearTimeout(timeout);
        logger.error({ err }, 'Failed to start Telegram bot');
        reject(err);
      });
    });
  }

  /**
   * Keep-alive mechanism to prevent session timeouts.
   * Sends a getMe() request every 5 minutes to keep the connection alive.
   */
  private startKeepAlive(): void {
    if (this.keepAliveTimer) return;

    this.keepAliveTimer = setInterval(async () => {
      if (!this.bot || this.isShuttingDown) return;

      try {
        await this.bot.api.getMe();
        logger.debug('Telegram keep-alive ping successful');
      } catch (err) {
        logger.warn({ err }, 'Telegram keep-alive ping failed, reconnecting...');
        this.reconnect();
      }
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Reconnect the Telegram bot after a failure.
   */
  private async reconnect(): Promise<void> {
    if (this.isShuttingDown) return;

    logger.info('Reconnecting Telegram bot...');

    // Stop existing bot
    if (this.bot) {
      try {
        this.bot.stop();
      } catch (err) {
        logger.debug({ err }, 'Error stopping bot during reconnect');
      }
      this.bot = null;
    }

    // Clear timers
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }

    // Wait a bit before reconnecting
    await new Promise((r) => setTimeout(r, 2000));

    // Reconnect
    try {
      await this.connect();
      logger.info('Telegram bot reconnected successfully');
    } catch (err) {
      logger.error({ err }, 'Failed to reconnect Telegram bot, will retry in 30s');
      if (!this.isShuttingDown) {
        setTimeout(() => this.reconnect(), 30000);
      }
    }
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    if (!this.bot) {
      logger.warn('Telegram bot not initialized');
      return;
    }

    try {
      const numericId = jid.replace(/^tg:/, '');

      // Telegram has a 4096 character limit per message — split if needed
      const MAX_LENGTH = 4096;
      if (text.length <= MAX_LENGTH) {
        await this.bot.api.sendMessage(numericId, text);
      } else {
        for (let i = 0; i < text.length; i += MAX_LENGTH) {
          await this.bot.api.sendMessage(
            numericId,
            text.slice(i, i + MAX_LENGTH),
          );
        }
      }
      logger.info({ jid, length: text.length }, 'Telegram message sent');
    } catch (err) {
      logger.error({ jid, err }, 'Failed to send Telegram message');
    }
  }
  async sendMedia(jid: string, filePath: string, options?: { caption?: string }): Promise<void> {
    if (!this.bot) {
      logger.warn('Telegram bot not initialized');
      return;
    }

    try {
      const numericId = jid.replace(/^tg:/, '');

      // Check if file exists
      await fs.access(filePath);

      // Detect file type by extension
      const ext = path.extname(filePath).toLowerCase();
      const inputFile = new InputFile(filePath);

      if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) {
        await this.bot.api.sendPhoto(numericId, inputFile, {
          caption: options?.caption
        });
        logger.info({ jid, filePath }, 'Telegram photo sent');
      } else if (ext === '.pdf') {
        await this.bot.api.sendDocument(numericId, inputFile, {
          caption: options?.caption
        });
        logger.info({ jid, filePath }, 'Telegram document sent');
      } else {
        throw new Error(`Unsupported file type: ${ext}`);
      }
    } catch (err) {
      logger.error({ jid, filePath, err }, 'Failed to send Telegram media');
      throw err;
    }
  }

  isConnected(): boolean {
    return this.bot !== null;
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith('tg:');
  }

  async disconnect(): Promise<void> {
    this.isShuttingDown = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }

    if (this.bot) {
      this.bot.stop();
      this.bot = null;
      logger.info('Telegram bot stopped');
    }
  }

  async setTyping(jid: string, isTyping: boolean): Promise<void> {
    if (!this.bot || !isTyping) return;
    try {
      const numericId = jid.replace(/^tg:/, '');
      await this.bot.api.sendChatAction(numericId, 'typing');
    } catch (err) {
      logger.debug({ jid, err }, 'Failed to send Telegram typing indicator');
    }
  }
}
