import { create } from "zustand";

interface AIState {
  configured: boolean;
  onboardingDone: boolean;
  setConfigured: (configured: boolean) => void;
  setOnboardingDone: (done: boolean) => void;
}

export const useAIStore = create<AIState>((set) => ({
  configured: false,
  onboardingDone: false,
  setConfigured: (configured) => set({ configured }),
  setOnboardingDone: (done) => set({ onboardingDone: done }),
}));
