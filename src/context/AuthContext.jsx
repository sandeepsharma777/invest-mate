import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { auth } from "../lib/db";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading

  useEffect(() => {
    auth.getCurrentUser().then(setUser);
  }, []);

  const login = useCallback(async (credentials) => {
    const u = await auth.login(credentials);
    setUser(u);
    return u;
  }, []);

  const signup = useCallback(async (payload) => {
    const u = await auth.signup(payload);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    await auth.logout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, signup, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
