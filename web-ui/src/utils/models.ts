import { getSelectedModels } from './selected-models';

export interface UiModel {
  id: string;
  name: string;
  provider: string;
}

// Get models from user selection in localStorage
export function getUiModels(): UiModel[] {
  return getSelectedModels();
}

// Legacy export for compatibility
export const UI_MODELS = getUiModels();

export function getProviderLogoUrl(provider: string): string {
  return `https://models.dev/logos/${provider}.svg`;
}

export const SUGGESTIONS = [
  'Résume les derniers messages et donne 3 actions concrètes',
  'Propose une réponse courte et polie à envoyer',
  'Peux-tu reformuler en style plus professionnel ?',
  'Donne une checklist exécutable pour cette tâche',
];

export function getProviderBadgeColor(provider: string, isDark: boolean): string {
  const lowerProvider = provider.toLowerCase();
  
  if (lowerProvider.includes('anthropic') || lowerProvider.includes('claude')) {
    return isDark
      ? 'bg-amber-500/15 text-amber-300 border-amber-500/25'
      : 'bg-amber-100 text-amber-700 border-amber-200';
  }
  if (lowerProvider.includes('openai') || lowerProvider.includes('gpt')) {
    return isDark
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25'
      : 'bg-emerald-100 text-emerald-700 border-emerald-200';
  }
  if (lowerProvider.includes('google') || lowerProvider.includes('gemini')) {
    return isDark
      ? 'bg-sky-500/15 text-sky-300 border-sky-500/25'
      : 'bg-sky-100 text-sky-700 border-sky-200';
  }
  if (lowerProvider.includes('opencode')) {
    return isDark
      ? 'bg-purple-500/15 text-purple-300 border-purple-500/25'
      : 'bg-purple-100 text-purple-700 border-purple-200';
  }
  
  // Default color for other providers
  return isDark
    ? 'bg-zinc-500/15 text-zinc-300 border-zinc-500/25'
    : 'bg-zinc-100 text-zinc-700 border-zinc-200';
}
