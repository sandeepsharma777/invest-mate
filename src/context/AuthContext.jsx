import { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  auth as firebaseAuth,
  loginWithEmail,
  signupWithEmail,
  logoutFirebase,
  getFirebaseIdToken,
  getUserPreferences,
  saveUserPreferences,
} from "../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { testSupabaseJwtBridge } from "../lib/supabase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading
  const [jwtBridgeStatus, setJwtBridgeStatus] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
      if (firebaseUser) {
        const prefs = getUserPreferences(firebaseUser.uid);
        const formattedUser = {
          id: firebaseUser.uid,
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          name: firebaseUser.displayName || prefs.name || firebaseUser.email.split("@")[0],
          currency: prefs.currency || "INR",
          tracked_asset_types: prefs.tracked_asset_types || [
            "stocks",
            "mutual_fund",
            "gold",
            "fixed_deposit",
            "crypto",
          ],
        };
        setUser(formattedUser);
      } else {
        setUser(null);
      }
    });

    return () => unsubscribe();
  }, []);

  const login = useCallback(async ({ email, password }) => {
    const fbUser = await loginWithEmail(email, password);
    const prefs = getUserPreferences(fbUser.uid);
    const formattedUser = {
      id: fbUser.uid,
      uid: fbUser.uid,
      email: fbUser.email,
      name: fbUser.displayName || prefs.name || fbUser.email.split("@")[0],
      currency: prefs.currency || "INR",
      tracked_asset_types: prefs.tracked_asset_types || [
        "stocks",
        "mutual_fund",
        "gold",
        "fixed_deposit",
        "crypto",
      ],
    };
    setUser(formattedUser);
    return formattedUser;
  }, []);

  const signup = useCallback(
    async ({ name, email, password, currency = "INR", tracked_asset_types = [] }) => {
      const fbUser = await signupWithEmail({
        name,
        email,
        password,
        currency,
        tracked_asset_types,
      });
      const formattedUser = {
        id: fbUser.uid,
        uid: fbUser.uid,
        email: fbUser.email,
        name: name || fbUser.displayName || email.split("@")[0],
        currency,
        tracked_asset_types,
      };
      setUser(formattedUser);
      return formattedUser;
    },
    []
  );

  const logout = useCallback(async () => {
    await logoutFirebase();
    setUser(null);
  }, []);

  const updatePreferences = useCallback(
    (prefs) => {
      if (!user?.id) return;
      const updated = saveUserPreferences(user.id, prefs);
      setUser((prev) => (prev ? { ...prev, ...updated } : prev));
    },
    [user?.id]
  );

  const checkJwtBridge = useCallback(async () => {
    const result = await testSupabaseJwtBridge();
    setJwtBridgeStatus(result);
    return result;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        signup,
        logout,
        setUser,
        updatePreferences,
        getIdToken: getFirebaseIdToken,
        checkJwtBridge,
        jwtBridgeStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
