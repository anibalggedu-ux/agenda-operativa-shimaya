import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Role } from "../shared/types";
import { api } from "./api";

export interface SessionUser {
  id: string;
  name: string;
  role: Role;
}

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  login(email: string, password: string): Promise<void>;
  loginPin(storeId: string, pin: string): Promise<void>;
  logout(): Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export const HOME: Record<Role, string> = { validador: "/validar", moderador: "/moderacion", analista: "/analisis" };
export const ROLE_LABEL: Record<Role, string> = { validador: "Validador", moderador: "Moderador", analista: "Analista" };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ user: SessionUser }>("GET", "/api/auth/me")
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api<{ user: SessionUser }>("POST", "/api/auth/login", { body: { email, password } });
    setUser(r.user);
  }, []);

  const loginPin = useCallback(async (storeId: string, pin: string) => {
    const r = await api<{ user: SessionUser }>("POST", "/api/auth/pin-login", { body: { storeId, pin } });
    setUser(r.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("POST", "/api/auth/logout");
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(() => ({ user, loading, login, loginPin, logout }), [user, loading, login, loginPin, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("AuthProvider ausente");
  return v;
}
