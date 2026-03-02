export interface UiModel {
  id: string;
  name: string;
  provider: 'Anthropic' | 'OpenAI' | 'Google';
  providerSlug: 'anthropic' | 'openai' | 'google';
}

export const UI_MODELS: UiModel[] = [
  { id: 'claude-sonnet-4', name: 'Claude Sonnet 4', provider: 'Anthropic', providerSlug: 'anthropic' },
  { id: 'claude-opus-4', name: 'Claude Opus 4', provider: 'Anthropic', providerSlug: 'anthropic' },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI', providerSlug: 'openai' },
  { id: 'gpt-4o-mini', name: 'GPT-4o mini', provider: 'OpenAI', providerSlug: 'openai' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'Google', providerSlug: 'google' },
];

export function getProviderLogoUrl(provider: UiModel['providerSlug']): string {
  return `https://models.dev/logos/${provider}.svg`;
}

export const SUGGESTIONS = [
  'Résume les derniers messages et donne 3 actions concrètes',
  'Propose une réponse courte et polie à envoyer',
  'Peux-tu reformuler en style plus professionnel ?',
  'Donne une checklist exécutable pour cette tâche',
];

export function getProviderBadgeColor(provider: UiModel['provider'], isDark: boolean): string {
  if (provider === 'Anthropic') {
    return isDark
      ? 'bg-amber-500/15 text-amber-300 border-amber-500/25'
      : 'bg-amber-100 text-amber-700 border-amber-200';
  }
  if (provider === 'OpenAI') {
    return isDark
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25'
      : 'bg-emerald-100 text-emerald-700 border-emerald-200';
  }
  return isDark
    ? 'bg-sky-500/15 text-sky-300 border-sky-500/25'
    : 'bg-sky-100 text-sky-700 border-sky-200';
}
