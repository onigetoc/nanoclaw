/**
 * MCP Server: Model Manager
 * 
 * Provides tools for the agent to:
 * - View current model configuration
 * - Change models dynamically
 * - List available models
 * 
 * This allows the agent to adapt its model based on task complexity.
 */
import fs from 'fs';
import path from 'path';

interface ModelConfig {
  model?: string;
  small_model?: string;
  fallback_model?: string;
  vision_model?: string;
  provider?: Record<string, any>;
}

/**
 * Get the path to models-config.json in the project root.
 * In container mode: /workspace/project/models-config.json
 * In direct mode: passed via environment variable
 */
function getConfigPath(): string {
  const projectDir = process.env.PROJECT_DIR || '/workspace/project';
  return path.join(projectDir, 'models-config.json');
}

/**
 * Read current model configuration from models-config.json
 */
export function getCurrentModelConfig(): ModelConfig {
  const configPath = getConfigPath();
  
  if (!fs.existsSync(configPath)) {
    // Return sensible defaults if file doesn't exist
    return {
      model: 'opencode/minimax-m2.5-free',
      small_model: 'opencode/minimax-m2.5-free',
      vision_model: 'opencode/minimax-m2.5-free',
      fallback_model: 'opencode/glm-5-free'
    };
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    throw new Error(`Failed to read models-config.json: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Update model configuration in models-config.json
 */
export function updateModelConfig(updates: {
  model?: string;
  small_model?: string;
  fallback_model?: string;
  vision_model?: string;
}): void {
  const configPath = getConfigPath();
  const config = getCurrentModelConfig();

  // Apply updates
  if (updates.model !== undefined) config.model = updates.model;
  if (updates.small_model !== undefined) config.small_model = updates.small_model;
  if (updates.fallback_model !== undefined) config.fallback_model = updates.fallback_model;
  if (updates.vision_model !== undefined) config.vision_model = updates.vision_model;

  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  } catch (err) {
    throw new Error(`Failed to write models-config.json: ${err instanceof Error ? err.message : String(err)}`);
  }
}


/**
 * MCP tool: Get current model configuration
 */
export const tool_get_current_model = {
  name: 'get_current_model',
  description: 'Get the current AI model configuration (primary, small, fallback models)',
  inputSchema: {
    type: 'object',
    properties: {},
    required: []
  },
  handler: async () => {
    const config = getCurrentModelConfig();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            primary_model: config.model || 'opencode/minimax-m2.5-free',
            small_model: config.small_model || 'opencode/minimax-m2.5-free',
            vision_model: config.vision_model || 'opencode/minimax-m2.5-free',
            fallback_model: config.fallback_model || 'opencode/glm-5-free',
            note: 'Changes require OpenCode server restart to take effect'
          }, null, 2)
        }
      ]
    };
  }
};

/**
 * MCP tool: Change the primary model
 */
export const tool_change_model = {
  name: 'change_model',
  description: 'Change the primary AI model used for complex reasoning tasks. Requires server restart.',
  inputSchema: {
    type: 'object',
    properties: {
      model: {
        type: 'string',
        description: 'Model identifier (e.g., "anthropic/claude-3-5-sonnet", "google/gemini-2.0-flash-lite")'
      }
    },
    required: ['model']
  },
  handler: async (args: { model: string }) => {
    try {
      updateModelConfig({ model: args.model });
      return {
        content: [
          {
            type: 'text',
            text: `✓ Primary model changed to: ${args.model}\n\n` +
                  `⚠️  OpenCode server restart required for changes to take effect.\n` +
                  `The user needs to restart NanoClaw for the new model to be used.`
          }
        ]
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: `✗ Failed to change model: ${err instanceof Error ? err.message : String(err)}`
          }
        ],
        isError: true
      };
    }
  }
};

/**
 * MCP tool: Set the small model for lightweight tasks
 */
export const tool_set_small_model = {
  name: 'set_small_model',
  description: 'Set the lightweight model for simple tasks (searches, summaries). Requires server restart.',
  inputSchema: {
    type: 'object',
    properties: {
      model: {
        type: 'string',
        description: 'Model identifier for lightweight tasks (e.g., "google/gemini-2.0-flash-lite")'
      }
    },
    required: ['model']
  },
  handler: async (args: { model: string }) => {
    try {
      updateModelConfig({ small_model: args.model });
      return {
        content: [
          {
            type: 'text',
            text: `✓ Small model changed to: ${args.model}\n\n` +
                  `⚠️  OpenCode server restart required for changes to take effect.`
          }
        ]
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: `✗ Failed to set small model: ${err instanceof Error ? err.message : String(err)}`
          }
        ],
        isError: true
      };
    }
  }
};

/**
 * MCP tool: Set fallback model
 */
export const tool_set_fallback_model = {
  name: 'set_fallback_model',
  description: 'Set the fallback model to use if the primary model fails. Requires server restart.',
  inputSchema: {
    type: 'object',
    properties: {
      model: {
        type: 'string',
        description: 'Model identifier for fallback (e.g., "openai/gpt-4o")'
      }
    },
    required: ['model']
  },
  handler: async (args: { model: string }) => {
    try {
      updateModelConfig({ fallback_model: args.model });
      return {
        content: [
          {
            type: 'text',
            text: `✓ Fallback model set to: ${args.model}\n\n` +
                  `⚠️  OpenCode server restart required for changes to take effect.`
          }
        ]
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: `✗ Failed to set fallback model: ${err instanceof Error ? err.message : String(err)}`
          }
        ],
        isError: true
      };
    }
  }
};

/**
 * MCP tool: Set vision model for image analysis
 */
export const tool_set_vision_model = {
  name: 'set_vision_model',
  description: 'Set the model for image/vision tasks. Use this when you want a different model for image analysis than your primary text model. Requires server restart.',
  inputSchema: {
    type: 'object',
    properties: {
      model: {
        type: 'string',
        description: 'Model identifier with vision support (e.g., "opencode/minimax-m2.5-free", "google/gemini-2.0-flash-lite", "anthropic/claude-3-5-sonnet")'
      }
    },
    required: ['model']
  },
  handler: async (args: { model: string }) => {
    try {
      updateModelConfig({ vision_model: args.model });
      return {
        content: [
          {
            type: 'text',
            text: `✓ Vision model set to: ${args.model}\n\n` +
                  `This model will be used for image analysis tasks.\n` +
                  `⚠️  OpenCode server restart required for changes to take effect.`
          }
        ]
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: `✗ Failed to set vision model: ${err instanceof Error ? err.message : String(err)}`
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
  tool_change_model,
  tool_set_small_model,
  tool_set_fallback_model,
  tool_set_vision_model,
  tool_list_models
];
