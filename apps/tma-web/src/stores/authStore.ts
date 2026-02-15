import { create } from 'zustand';

interface User {
  id: string;
  name: string;
  telegramUserId: number;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  workspaceId: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User, token: string) => void;
  setWorkspaceId: (id: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  workspaceId: null,
  isAuthenticated: false,
  setAuth: (user, token) => set({ user, accessToken: token, isAuthenticated: true }),
  setWorkspaceId: (id) => set({ workspaceId: id }),
  logout: () => set({ user: null, accessToken: null, workspaceId: null, isAuthenticated: false }),
}));
