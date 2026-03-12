/**
 * MCP Server: Model Manager
 * 
 * Provides tools for the agent to:
 * - View current model configuration (read-only from opencode.json)
 * - List available models
 * 
 * NOTE: Model changes will be handled via Web UI in the future.
 * The old models-config.json system has been deprecated.
 */
import fs from 'fs';
import path from 'path';

interface OpencodeConfig {
  model?: string;
  small_model?: string;
  fallback_model?: string;
  vision_model?: string;
  agent?: Record<string, any>;
  provider?: Record<string, any>;
}

/**
 * Read current model configuration from opencode.json (source of truth)
 */
export function getCurrentModelConfig(): OpencodeConfig {
  const projectDir = process.env.PROJECT_DIR || '/workspace/project';
  const configPath = path.join(projectDir, 'opencode.json');
  
  if (!fs.existsSync(configPath)) {
    throw new Error('opencode.json not found - this is the source of truth for model configuration');
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    throw new Error(`Failed to read opencode.json: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * MCP tool: Get current model configuration (read-only)
 */
export const tool_get_current_model = {
  name: 'get_current_model',
  description: 'Get the current AI model configuration from opencode.json (read-only)',
  inputSchema: {
    type: 'object',
    properties: {},
    required: []
  },
  handler: async () => {
    try {
      const config = getCurrentModelConfig();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              primary_model: config.model || 'not configured',
              small_model: config.small_model || 'not configured',
              source: 'opencode.json',
              note: 'Model configuration is read from opencode.json. Changes will be handled via Web UI in the future.'
            }, null, 2)
          }
        ]
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: `✗ Failed to read model config: ${err instanceof Error ? err.message : String(err)}`
          }
        ],
        isError: true
      };
    }
  }
};

/**
 * MCP tool: List popular models
 */
export const tool_list_models = {
  name: 'list_models',
  description: 'List popular AI models available for use',
  inputSchema: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        enum: ['free', 'premium', 'vision', 'all'],
        description: 'Filter by category (default: all)'
      }
    },
    required: []
  },
  handler: async (args: { category?: string }) => {
    const category = args.category || 'all';
    
    const freeModels = [
      { id: 'opencode/minimax-m2.5-free', name: 'MiniMax M2.5 Free', note: 'Current default, supports vision' },
      { id: 'opencode/glm-5-free', name: 'GLM-5 Free', note: 'Good for Chinese' },
      { id: 'google/gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite', note: 'Fast, lightweight, supports vision' },
      { id: 'google/gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', note: 'Latest lite version, supports vision' }
    ];

    const premiumModels = [
      { id: 'anthropic/claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', note: 'Balanced, excellent for code, supports vision' },
      { id: 'anthropic/claude-3-opus', name: 'Claude 3 Opus', note: 'Best reasoning, supports vision' },
      { id: 'openai/gpt-4o', name: 'GPT-4 Omni', note: 'Multimodal, supports vision' },
      { id: 'openai/gpt-4-turbo', name: 'GPT-4 Turbo', note: 'Fast GPT-4, supports vision' },
      { id: 'google/gemini-2.0-pro', name: 'Gemini 2.0 Pro', note: 'Google\'s best, supports vision' },
      { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat', note: 'Very cheap, good quality' }
    ];

    const visionModels = [
      { id: 'opencode/minimax-m2.5-free', name: 'MiniMax M2.5 Free', note: 'Free, good vision support' },
      { id: 'google/gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite', note: 'Free, fast vision' },
      { id: 'google/gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', note: 'Free, latest' },
      { id: 'anthropic/claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', note: 'Premium, excellent vision' },
      { id: 'openai/gpt-4o', name: 'GPT-4 Omni', note: 'Premium, multimodal' },
      { id: 'google/gemini-2.0-pro', name: 'Gemini 2.0 Pro', note: 'Premium, best vision' }
    ];

    let models = [];
    if (category === 'free' || category === 'all') {
      models.push('## Free Models\n');
      for (const m of freeModels) {
        models.push(`- **${m.id}** - ${m.name} (${m.note})`);
      }
    }
    if (category === 'premium' || category === 'all') {
      models.push('\n## Premium Models (require API key)\n');
      for (const m of premiumModels) {
        models.push(`- **${m.id}** - ${m.name} (${m.note})`);
      }
    }
    if (category === 'vision') {
      models.push('## Vision-Capable Models\n');
      for (const m of visionModels) {
        models.push(`- **${m.id}** - ${m.name} (${m.note})`);
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: models.join('\n')
        }
      ]
    };
  }
};

// Export all tools for registration
export const modelManagerTools = [
  tool_get_current_model,
  tool_list_models
];
