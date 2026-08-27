import { createContext, useCallback, useContext, useMemo, useState } from "react";
import api from "../api.js";

const AuthContext = createContext(null);
const STORAGE_KEY = "auth";

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(readStored);

  const persist = useCallback((next) => {
    setAuth(next);
    try {
      if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* приватный режим — просто живём без запоминания сессии */
    }
  }, []);

  const login = useCallback(
    async (username, password) => {
      const form = new URLSearchParams();
      form.set("username", username);
      form.set("password", password);
      const { data } = await api.post("/auth/login", form, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      persist({
        token: data.access_token,
        id: data.id,
        role: data.role,
        username: data.username,
        displayName: data.display_name,
        avatarColor: data.avatar_color,
        avatarUrl: data.avatar_url,
      });
    },
    [persist]
  );

  const logout = useCallback(() => persist(null), [persist]);

  // Профиль меняется в кабинете — шапка должна обновиться сразу.
  const updateProfile = useCallback(
    (patch) => persist(auth ? { ...auth, ...patch } : auth),
    [auth, persist]
  );

  const value = useMemo(
    () => ({ auth, isAdmin: auth?.role === "admin", login, logout, updateProfile }),
    [auth, login, logout, updateProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
