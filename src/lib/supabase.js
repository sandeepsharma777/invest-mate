import { createClient } from "@supabase/supabase-js";
import { auth, getFirebaseIdToken } from "./firebase";

export const SUPABASE_URL = "https://wvcxeltsyodhcrxjylua.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2Y3hlbHRzeW9kaGNyeGp5bHVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1MTQ1MjEsImV4cCI6MjEwNjA5MDUyMX0.Z95azVdS7nMJOFnq8EkSfUK5U0EI7Cz03hzbVMUqc28";

/**
 * Supabase client configured with the official accessToken async callback pattern.
 * Per Supabase third-party auth documentation, accessToken dynamically supplies
 * the fresh Firebase ID token on every request, ensuring Supabase receives the bearer
 * token without custom header injection or manual session management.
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  global: {
    headers: async () => {
      const token = await getFirebaseIdToken();
      if (token) {
        return {
          Authorization: `Bearer ${token}`,
        };
      }
      return {};
    },
  },
  accessToken: async () => {
    const token = await getFirebaseIdToken();
    return token || null;
  },
});

/**
 * Helper to decode JWT payload (without verification, for debugging/diagnostic UI)
 */
export function decodeJwtPayload(token) {
  if (!token) return null;
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch (err) {
    return { error: "Failed to parse JWT payload: " + err.message };
  }
}

/**
 * Step 2 Diagnostic: Verify Firebase JWT bridging to Supabase
 * Performs a test request to Supabase with the active Firebase ID token
 */
export async function testSupabaseJwtBridge() {
  const user = auth.currentUser;
  if (!user) {
    return {
      success: false,
      error: "No Firebase user is currently signed in. Please log in first.",
    };
  }

  try {
    const idToken = await user.getIdToken(true); // force fresh token
    const decoded = decodeJwtPayload(idToken);

    // Make an authenticated REST ping to Supabase PostgREST root
    const restEndpoint = `${SUPABASE_URL}/rest/v1/`;
    const response = await fetch(restEndpoint, {
      method: "GET",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${idToken}`,
        Accept: "application/json",
      },
    });

    let responseBody = null;
    try {
      responseBody = await response.json();
    } catch {
      responseBody = await response.text();
    }

    return {
      success: response.status !== 401 && response.status !== 403,
      status: response.status,
      statusText: response.statusText,
      user: {
        uid: user.uid,
        email: user.email,
      },
      jwtClaims: {
        iss: decoded?.iss,
        sub: decoded?.sub,
        aud: decoded?.aud,
        auth_time: decoded?.auth_time ? new Date(decoded.auth_time * 1000).toISOString() : null,
        exp: decoded?.exp ? new Date(decoded.exp * 1000).toISOString() : null,
      },
      supabaseResponse: responseBody,
      tokenSnippet: `${idToken.slice(0, 16)}...${idToken.slice(-16)}`,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
    };
  }
}
