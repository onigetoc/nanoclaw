import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

/**
 * Detected API key information
 */
export interface ApiKeyInfo {
  value: string;
  source: 'Project (.env)' | 'System (OS)';
  masked: string;
}

export type ApiKeysMap = Record<string, ApiKeyInfo>;

/**
 * Comprehensive list of API keys to track
 */
const API_KEYS_TO_TRACK = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GOOGLE_API_KEY',
  'GEMINI_API_KEY',
  'DASHSCOPE_API_KEY',
  'MISTRAL_API_KEY',
  'GROQ_API_KEY',
  'OPENROUTER_API_KEY',
  'HF_TOKEN',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'MOONSHOT_API_KEY',
  'DEEPSEEK_API_KEY',
  'COHERE_API_KEY',
  'PERPLEXITY_API_KEY',
  'TOGETHER_API_KEY',
  'VOYAGE_API_KEY',
] as const;

/**
 * Mask an API key for secure display
 */
function maskApiKey(key: string): string {
  if (key.length <= 10) return '***';
  return `${key.substring(0, 6)}...${key.slice(-4)}`;
}

/**
 * Multi-source API key scanner
 * Priority: Local .env > System environment variables
 */
export function scanAndGetApiKeys(): ApiKeysMap {
  const foundKeys: ApiKeysMap = {};
  const envPath = path.join(process.cwd(), '.env');

  // Step 1: Load local .env if it exists
  let localEnvData: Record<string, string> = {};
  if (fs.existsSync(envPath)) {
    const result = dotenv.config({ path: envPath, override: true });
    if (result.parsed) {
      localEnvData = result.parsed;
    }
  }

  // Step 2: Scan each key
  API_KEYS_TO_TRACK.forEach((keyName) => {
    const value = process.env[keyName];
    
    if (value && value.trim() !== '') {
      const isLocal = localEnvData.hasOwnProperty(keyName);
      
      foundKeys[keyName] = {
        value: value,
        source: isLocal ? 'Project (.env)' : 'System (OS)',
        masked: maskApiKey(value),
      };
    }
  });

  return foundKeys;
}

/**
 * Display a report of detected keys
 */
export function logApiKeysReport(keys: ApiKeysMap): void {
  console.log('\n--- API KEY SCAN COMPLETE ---');
  
  const keyCount = Object.keys(keys).length;
  
  if (keyCount === 0) {
    console.log('⚠️  No API keys detected. Manual configuration required.\n');
    return;
  }

  console.log(`✅ ${keyCount} API key(s) detected:\n`);
  
  Object.entries(keys).forEach(([name, data]) => {
    console.log(`   ${name}`);
    console.log(`   └─ Source: ${data.source}`);
    console.log(`   └─ Value: ${data.masked}\n`);
  });
}

/**
 * Get a specific API key
 */
export function getApiKey(keyName: string, keys: ApiKeysMap): string | undefined {
  return keys[keyName]?.value;
}
