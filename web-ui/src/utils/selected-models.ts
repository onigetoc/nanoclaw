/**
 * Utility to get selected models from localStorage
 */

export interface SelectedModel {
  id: string;
  name: string;
  provider: string;
}

export function getSelectedModels(): SelectedModel[] {
  try {
    const saved = localStorage.getItem('eureclaw_selected_models');
    if (!saved) {
      // Return default models if nothing selected
      return getDefaultModels();
    }

    const parsed = JSON.parse(saved);
    const modelIds = new Set(parsed.models || []);
    
    // We need to reconstruct the full model objects
    // For now, just return the IDs - the UI will need to fetch full data
    return Array.from(modelIds).map(id => ({
      id: id as string,
      name: extractModelName(id as string),
      provider: extractProvider(id as string),
    }));
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
