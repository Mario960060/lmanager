import { create } from 'zustand';
import { User } from '@supabase/supabase-js';
import { persist } from 'zustand/middleware';

interface AuthState {
  user: User | null;
  profile: {
    role: 'user' | 'project_manager' | 'Team_Leader' | 'Admin' | null;
    full_name: string;
    email: string;
    company_id: string | null;
  } | null;
  theme: 'light' | 'dark';
  setUser: (user: User | null) => void;
  setProfile: (profile: AuthState['profile']) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;
  getCompanyId: () => string | null;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      profile: null,
      theme: 'light',
      setUser: (user) => set({ user }),
      setProfile: (profile) => set({ profile }),
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
      getCompanyId: () => get().profile?.company_id || null,
    }),
    {
      name: 'auth-storage',
    }
  )
);
