import { useState, createContext, useContext } from "react";
import { type User, setAuthTokenGetter } from "@workspace/api-client-react";

type AuthState = {
  user: User | null;
  token: string | null;
};

type AuthContextType = AuthState & {
  login: (user: User, token: string) => void;
  logout: () => void;
  isAuthenticated: boolean;
};

const AUTH_KEY = "restoCrm_auth";

// Set up the token getter synchronously at module load time so it is
// available before the first TanStack Query fetch fires (microtasks run
// before useEffect, so an effect-based setup would be too late).
setAuthTokenGetter(() => {
  try {
    const stored = localStorage.getItem(AUTH_KEY);
    if (stored) {
      return JSON.parse(stored).token ?? null;
    }
  } catch {
    // ignore
  }
  return null;
});

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>(() => {
    try {
      const stored = localStorage.getItem(AUTH_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.token) {
          return parsed;
        }
      }
    } catch (e) {
      // ignore
    }
    return { user: null, token: null };
  });

  const login = (user: User, token: string) => {
    const state = { user, token };
    localStorage.setItem(AUTH_KEY, JSON.stringify(state));
    setAuthState(state);
  };

  const logout = () => {
    localStorage.removeItem(AUTH_KEY);
    setAuthState({ user: null, token: null });
  };

  return (
    <AuthContext.Provider value={{ ...authState, login, logout, isAuthenticated: !!authState.token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
