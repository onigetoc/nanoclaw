import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ModelState {
  selectedModel: string;
  
  setSelectedModel: (modelId: string) => void;
}

// Read persisted value synchronously for immediate access (no hydration race)
function getPersistedModel(): string {
  try {
    const raw = localStorage.getItem('eureclaw-model-selection');
    if (raw) {
      const parsed = JSON.parse(raw);
      const model = parsed?.state?.selectedModel || '';
      // Reject old format (no provider prefix)
      if (model && !model.includes('/')) return '';
      return model;
    }
  } catch { /* ignore */ }
  return '';
}

export const useModelStore = create<ModelState>()(
  persist(
    (set) => ({
      selectedModel: '', // Empty = use first available model
      
      setSelectedModel: (modelId: string) => {
        set({ selectedModel: modelId });
      },
    }),
    {
      name: 'eureclaw-model-selection',
      partialize: (state) => ({
        selectedModel: state.selectedModel,
      }),
    }
  )
);

// Export the sync reader for use in App.tsx init
export { getPersistedModel };
