import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface TranscriptionConfig {
  provider: string;
  openai?: {
    model: string;
  };
  enabled: boolean;
  fallbackMessage: string;
}

function loadConfig(): TranscriptionConfig {
  const configPath = path.join(__dirname, '../.transcription.config.json');
  try {
    const configData = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(configData);
  } catch {
    return {
      provider: 'openai',
      enabled: false,
      fallbackMessage: '[Voice Message - transcription unavailable]',
    };
  }
}

export async function transcribeWithOpenAI(
  audioBuffer: Buffer,
  filename: string,
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('OPENAI_API_KEY not found in environment');
    return null;
  }

  const config = loadConfig();
  if (!config.enabled) {
    return config.fallbackMessage;
  }

  try {
    const openai = new OpenAI({ apiKey });

    const file = new File([audioBuffer], filename, { type: 'audio/ogg' });

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: config.openai?.model || 'whisper-1',
      response_format: 'text',
    });

    return transcription as unknown as string;
  } catch (err) {
    console.error('OpenAI transcription failed:', err);
    return null;
  }
}

export function isTranscriptionEnabled(): boolean {
  const config = loadConfig();
  return config.enabled && !!process.env.OPENAI_API_KEY;
}
