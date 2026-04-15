import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  currentUserId: string | null;
  login: (id: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      currentUserId: null,
      login: (id) => set({ currentUserId: id }),
      logout: () => set({ currentUserId: null }),
    }),
    {
      name: 'auth-storage',
    }
  )
);
