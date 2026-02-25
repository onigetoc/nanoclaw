import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface VisionConfig {
  enabled: boolean;
  provider: 'gemini' | 'openai';
  fallbackMessage: string;
}

function loadConfig(): VisionConfig {
  const configPath = path.join(__dirname, '../.vision.config.json');
  try {
    const configData = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(configData);
  } catch {
    return {
      enabled: true,
      provider: 'gemini',
      fallbackMessage: '[Photo - vision unavailable]',
    };
  }
}

export async function analyzeWithGemini(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.warn('GEMINI_API_KEY not found in environment');
    return null;
  }

  const config = loadConfig();
  if (!config.enabled) {
    return config.fallbackMessage;
  }

  try {
    const base64Image = imageBuffer.toString('base64');

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: 'Analyze this image in detail. Extract ALL visible text, numbers, and data exactly as shown. If it contains tables, charts, or structured data, transcribe everything. If it\'s a photo or illustration, describe it thoroughly including colors, objects, people, actions, text, and context. Be comprehensive and precise.',
                },
                { inline_data: { mime_type: mimeType, data: base64Image } },
              ],
            },
          ],
          generationConfig: { maxOutputTokens: 1000 },
        }),
      },
    );

    const data = (await response.json()) as any;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return text || null;
  } catch (err) {
    console.error('Gemini vision failed:', err);
    return null;
  }
}

export async function analyzeWithOpenAI(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('OPENAI_API_KEY not found in environment');
    return null;
  }

  try {
    const base64Image = imageBuffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64Image}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Analyze this image in detail. Extract ALL visible text, numbers, and data exactly as shown. If it contains tables, charts, or structured data, transcribe everything. If it\'s a photo or illustration, describe it thoroughly including colors, objects, people, actions, text, and context. Be comprehensive and precise.',
              },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        max_tokens: 1000,
      }),
    });

    const data = (await response.json()) as any;
    return data.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error('OpenAI vision failed:', err);
    return null;
  }
}

export async function analyzeImage(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<string | null> {
  const config = loadConfig();

  if (config.provider === 'gemini') {
    const result = await analyzeWithGemini(imageBuffer, mimeType);
    if (result) return result;
  }

  return analyzeWithOpenAI(imageBuffer, mimeType);
}

export function isVisionEnabled(): boolean {
  const config = loadConfig();
  return (
    config.enabled &&
    (!!process.env.GEMINI_API_KEY ||
      !!process.env.GOOGLE_API_KEY ||
      !!process.env.OPENAI_API_KEY)
  );
}
