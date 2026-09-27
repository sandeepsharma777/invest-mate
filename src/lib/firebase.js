import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";

export const firebaseConfig = {
  apiKey: "AIzaSyADkjh3i6dq04NN-0PVFIUZdL92xXDmhhA",
  authDomain: "invest-mate-b7cee.firebaseapp.com",
  projectId: "invest-mate-b7cee",
  storageBucket: "invest-mate-b7cee.firebasestorage.app",
  messagingSenderId: "1068399750733",
  appId: "1:1068399750733:web:f5b0c6630a4c7905a13604",
};

// Initialize Firebase App
export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Initialize Firebase Auth
export const auth = getAuth(app);

/**
 * Sign in with email and password
 */
export async function loginWithEmail(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

/**
 * Create a new user with email and password, setting display name and local preferences.
 * Forces token refresh to fetch custom claims (role: 'authenticated') set by the auth trigger.
 */
export async function signupWithEmail({ name, email, password, currency = "INR", tracked_asset_types = [] }) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (name) {
    try {
      await updateProfile(cred.user, { displayName: name });
    } catch {
      // ignore non-fatal profile name update error
    }
  }

  // Store user preferences in localStorage scoped by UID
  const prefsKey = `investmate_user_prefs_${cred.user.uid}`;
  const prefs = {
    currency,
    tracked_asset_types,
    name: name || email.split("@")[0],
  };
  localStorage.setItem(prefsKey, JSON.stringify(prefs));

  // Poll briefly for the Firebase Cloud Function to assign custom claim { role: 'authenticated' }
  // and force-refresh the ID token
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await new Promise((resolve) => setTimeout(resolve, 600));
      const tokenResult = await cred.user.getIdTokenResult(true);
      if (tokenResult.claims.role === "authenticated") {
        break;
      }
    } catch {
      // continue next attempt
    }
  }

  // Force refresh one last time to ensure fresh token is cached locally
  await cred.user.getIdToken(true);

  return cred.user;
}

/**
 * Log out current Firebase user
 */
export async function logoutFirebase() {
  await signOut(auth);
}

/**
 * Retrieve the current fresh Firebase ID token
 * @param {boolean} forceRefresh - If true, forces token refresh from Firebase
 */
export async function getFirebaseIdToken(forceRefresh = false) {
  const currentUser = auth.currentUser;
  if (!currentUser) return null;
  return await currentUser.getIdToken(forceRefresh);
}

/**
 * Retrieve the current Firebase ID token result with all custom claims
 */
export async function getFirebaseIdTokenResult(forceRefresh = false) {
  const currentUser = auth.currentUser;
  if (!currentUser) return null;
  return await currentUser.getIdTokenResult(forceRefresh);
}

/**
 * Helper to get local user preferences (currency, tracked types, etc.)
 */
export function getUserPreferences(uid) {
  if (!uid) return { currency: "INR", tracked_asset_types: ["stocks", "mutual_fund", "gold", "fixed_deposit", "crypto"] };
  try {
    const raw = localStorage.getItem(`investmate_user_prefs_${uid}`);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return { currency: "INR", tracked_asset_types: ["stocks", "mutual_fund", "gold", "fixed_deposit", "crypto"] };
}

/**
 * Helper to save local user preferences
 */
export function saveUserPreferences(uid, prefs) {
  if (!uid) return;
  const current = getUserPreferences(uid);
  const updated = { ...current, ...prefs };
  localStorage.setItem(`investmate_user_prefs_${uid}`, JSON.stringify(updated));
  return updated;
}

/**
 * Format Firebase Auth errors into friendly messages
 */
export function formatFirebaseAuthError(err) {
  if (!err) return "An unexpected error occurred.";
  const code = err.code || "";
  switch (code) {
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/user-disabled":
      return "This account has been disabled.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Invalid email or password. Please check your credentials.";
    case "auth/email-already-in-use":
      return "An account already exists with this email. Please log in.";
    case "auth/weak-password":
      return "Password should be at least 6 characters long.";
    case "auth/too-many-requests":
      return "Too many failed attempts. Please try again in a few moments.";
    case "auth/network-request-failed":
      return "Network connection error. Please check your internet connection.";
    default:
      return err.message?.replace(/^Firebase:\s*/, "") || "Authentication failed.";
  }
}
