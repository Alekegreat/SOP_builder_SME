import { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore.js';
import { authenticateTelegram, setAccessToken } from '../lib/api.js';

export function useAuth() {
  const { isAuthenticated, setAuth, setWorkspaceId } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function init() {
      try {
        // Get initData from Telegram WebApp
        const tg = (window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp;
        const initData = tg?.initData;

        if (!initData) {
          setIsLoading(false);
          return;
        }

        const result = await authenticateTelegram(initData);
        setAccessToken(result.accessToken);
        setAuth(result.user, result.accessToken);
        setWorkspaceId(result.workspaceId);
        setIsLoading(false);
      } catch (err) {
        console.error('Auth error:', err);
        setIsLoading(false);
      }
    }

    init();
  }, [setAuth, setWorkspaceId]);

  return { isLoading, isAuthenticated };
}
