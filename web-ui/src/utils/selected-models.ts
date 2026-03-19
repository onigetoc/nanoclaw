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
      
      if (provider === 'opencode') {
        result.push({
          id: modelId,
          name: extractModelName(modelId),
          provider: 'opencode',
        });
      } else if (provider === 'openrouter') {
        // OpenRouter format: "openrouter/{org}/{model}:suffix"
        // Try to find in models.dev by org name, otherwise use extracted name
        const parts = modelId.split('/');
        const org = parts.length >= 3 ? parts[1] : 'openrouter';
        const orgData = modelsDevData[org];
        const modelSlug = parts[parts.length - 1].replace(/:(free|extended|beta|preview)$/i, '');
        
        if (orgData) {
          const modelData = Object.values(orgData.models).find(m => m.id === modelSlug || m.id === parts.slice(1).join('/'));
          if (modelData) {
            result.push({ id: modelId, name: modelData.name, provider: 'openrouter' });
            continue;
          }
        }
        // Fallback: use last segment as display name
        result.push({
          id: modelId,
          name: extractModelName(modelId),
          provider: 'openrouter',
        });
      } else {
        const modelIdPart = modelId.slice(modelId.indexOf('/') + 1);
        const providerData = modelsDevData[provider];
        if (providerData) {
          const modelData = Object.values(providerData.models).find(m => m.id === modelIdPart || m.id === modelId);
          if (modelData) {
            result.push({ id: modelId, name: modelData.name, provider });
          }
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
  if (parts.length >= 2) {
    // Always use last segment as model name (handles openrouter/org/model format)
    const modelPart = parts[parts.length - 1];
    const clean = modelPart.replace(/:(free|extended|beta|preview)$/i, '');
    return clean.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  return id;
}

function extractProvider(id: string): string {
  const parts = id.split('/');
  return parts[0] || 'unknown';
}
