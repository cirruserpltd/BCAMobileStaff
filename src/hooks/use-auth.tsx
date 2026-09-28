import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

const extra = (Constants.expoConfig?.extra ?? {}) as { API_BASE_URL?: string };
const API_BASE_URL = extra.API_BASE_URL;

type AuthContextType = {
  isAuthenticated: boolean | null;
  accessToken: string | null;
  login: (accessToken: string, refreshToken?: string) => Promise<void>;
  logout: () => Promise<void>;
  authFetch: (path: string, options?: RequestInit, rebuildBody?: () => BodyInit) => Promise<Response>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const refreshPromiseRef = useRef<Promise<string> | null>(null);

  useEffect(() => {
    (async () => {
      const token = await AsyncStorage.getItem('token');
      setAccessToken(token);
      setIsAuthenticated(!!token);
    })();
  }, []);

  const login = async (newAccessToken: string, refreshToken?: string) => {
    await AsyncStorage.setItem('token', newAccessToken);
    if (refreshToken) await AsyncStorage.setItem('refreshToken', refreshToken);
    setAccessToken(newAccessToken);
    setIsAuthenticated(true);
  };

  const logout = useCallback(async () => {
    await AsyncStorage.multiRemove(['token', 'refreshToken']);
    setAccessToken(null);
    setIsAuthenticated(false);
  }, []);

  const refreshAccessToken = useCallback((): Promise<string> => {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    const doRefresh = async (): Promise<string> => {
      const storedRefreshToken = await AsyncStorage.getItem('refreshToken');
      if (!API_BASE_URL || !storedRefreshToken) {
        await logout();
        throw new Error('Session expired. Please log in again.');
      }

      const res = await fetch(`${API_BASE_URL}/api/mobile/staff/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: storedRefreshToken }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success || !data.access_token) {
        await logout();
        throw new Error(data.error || 'Session expired. Please log in again.');
      }

      await AsyncStorage.setItem('token', data.access_token);
      if (data.refresh_token) await AsyncStorage.setItem('refreshToken', data.refresh_token);
      setAccessToken(data.access_token);
      setIsAuthenticated(true);
      return data.access_token;
    };

    const promise = doRefresh().finally(() => {

      if (refreshPromiseRef.current === promise) {
        refreshPromiseRef.current = null;
      }
    });

    refreshPromiseRef.current = promise;
    return promise;
  }, [logout]);


  const authFetch = useCallback(
    async (path: string, options: RequestInit = {}, rebuildBody?: () => BodyInit): Promise<Response> => {
      if (!API_BASE_URL) throw new Error('API base URL is not configured');

      const doFetch = (token: string | null, body: BodyInit | null | undefined = options.body) => {
        const isFormData = body instanceof FormData;
        return fetch(`${API_BASE_URL}${path}`, {
          ...options,
          body,
          headers: {
            ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
            ...(options.headers || {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
      };

      let res = await doFetch(accessToken);

      if (res.status === 401) {
        const body = await res.clone().json().catch(() => ({} as any));
        if (body.code === 'token_expired' || body.code === 'invalid_token') {
          const newToken = await refreshAccessToken();
          const retryBody = options.body instanceof FormData && rebuildBody ? rebuildBody() : options.body;
          res = await doFetch(newToken, retryBody);
        }
      }

      return res;
    },
    [accessToken, refreshAccessToken]
  );

  return (
    <AuthContext.Provider value={{ isAuthenticated, accessToken, login, logout, authFetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}