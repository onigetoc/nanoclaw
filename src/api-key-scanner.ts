import fs from 'fs';
import path from 'path';

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
 * 
 * SECURITY: Does NOT pollute process.env with secrets.
 * Reads .env file directly without loading into environment.
 */
export function scanAndGetApiKeys(): ApiKeysMap {
  const foundKeys: ApiKeysMap = {};
  const envPath = path.join(process.cwd(), '.env');

  // Step 1: Parse local .env WITHOUT loading into process.env
  let localEnvData: Record<string, string> = {};
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    // Parse manually to avoid polluting process.env
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        localEnvData[key] = value;
      }
    }
  }

  // Step 2: Scan each key (check local .env first, then system env)
  API_KEYS_TO_TRACK.forEach((keyName) => {
    // Priority: local .env > system environment
    const localValue = localEnvData[keyName];
    const systemValue = process.env[keyName];
    const value = localValue || systemValue;
    
    if (value && value.trim() !== '') {
      foundKeys[keyName] = {
        value: value,
        source: localValue ? 'Project (.env)' : 'System (OS)',
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
