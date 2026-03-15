import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ModelState {
  selectedModel: string;
  
  setSelectedModel: (modelId: string) => void;
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
      onRehydrateStorage: () => {
        // After zustand loads the persisted value, migrate old format if needed.
        // Old format: "big-pickle" (no provider). New format: "opencode/big-pickle".
        return (state: ModelState | undefined) => {
          if (state?.selectedModel && !state.selectedModel.includes('/')) {
            console.log(`[modelStore] Migrating old selectedModel "${state.selectedModel}" → reset to auto-select`);
            state.selectedModel = '';
          }
        };
      },
    }
  )
);
