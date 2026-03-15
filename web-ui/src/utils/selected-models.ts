/**
 * Utility to get selected models from localStorage
 */
import { loadSelections, getModelsDevData } from '../services/models-cache';

export interface SelectedModel {
  id: string;
  name: string;
  provider: string;
}

export async function getSelectedModels(): Promise<SelectedModel[]> {
  try {
    const saved = loadSelections();
    if (saved.models.length === 0) {
      return getDefaultModels();
    }

    // Fetch models.dev data to get full model info
    const modelsDevData = await getModelsDevData();
    const result: SelectedModel[] = [];
    
    for (const modelId of saved.models) {
      const provider = extractProvider(modelId);
      const modelIdPart = modelId.includes('/') ? modelId.slice(modelId.indexOf('/') + 1) : modelId;
      const providerData = modelsDevData[provider];
      
      if (provider === 'opencode') {
        // OpenCode models
        result.push({
          id: modelId,
          name: extractModelName(modelId),
          provider: 'opencode',
        });
      } else if (providerData) {
        // Find model in provider data (match by raw model ID or full provider/model ID)
        const modelData = Object.values(providerData.models).find(m => m.id === modelIdPart || m.id === modelId);
        if (modelData) {
          result.push({
            id: modelId,  // Keep the full "provider/modelId" format
            name: modelData.name,
            provider,
          });
        }
      }
    }

    return result.length > 0 ? result : getDefaultModels();
  } catch (e) {
    console.error('Failed to parse selected models:', e);
    return getDefaultModels();
  }
}

function getDefaultModels(): SelectedModel[] {
  return [
    { id: 'opencode/big-pickle', name: 'Big Pickle', provider: 'opencode' },
    { id: 'opencode/trinity-large-preview-free', name: 'Trinity Large (Free)', provider: 'opencode' },
    { id: 'google/gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash', provider: 'google' },
    { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'anthropic' },
    { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'openai' },
  ];
}

function extractModelName(id: string): string {
  const parts = id.split('/');
  if (parts.length > 1) {
    return parts[1].split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  return id;
}

function extractProvider(id: string): string {
  const parts = id.split('/');
  return parts[0] || 'unknown';
}
