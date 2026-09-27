import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { testSupabaseJwtBridge, decodeJwtPayload, SUPABASE_URL } from "../lib/supabase";
import { getFirebaseIdToken } from "../lib/firebase";

export default function JwtBridgeVerifier({ isOpen, onClose }) {
  const { user } = useAuth();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [tokenInfo, setTokenInfo] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen && user) {
      loadTokenInfo();
    }
  }, [isOpen, user]);

  async function loadTokenInfo(forceRefresh = false) {
    try {
      const token = await getFirebaseIdToken(forceRefresh);
      if (token) {
        const payload = decodeJwtPayload(token);
        setTokenInfo({
          rawToken: token,
          payload,
          hasAuthRole: payload?.role === "authenticated",
          role: payload?.role || "(none)",
          expDate: payload.exp ? new Date(payload.exp * 1000).toLocaleString() : null,
          issuedAt: payload.iat ? new Date(payload.iat * 1000).toLocaleString() : null,
        });
      }
    } catch (err) {
      console.error("Failed to load token info:", err);
    }
  }

  async function handleForceRefresh() {
    setTesting(true);
    await loadTokenInfo(true);
    setTesting(false);
  }

  async function handleRunTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testSupabaseJwtBridge();
      setTestResult(res);
    } catch (err) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setTesting(false);
    }
  }

  function copyToken() {
    if (!tokenInfo?.rawToken) return;
    navigator.clipboard.writeText(tokenInfo.rawToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!isOpen) return null;

  return (
    <div className="modal-overlay is-open" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 680 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal__head">
          <div>
            <h3 className="modal__title">Firebase ↔ Supabase JWT Bridge</h3>
            <p className="modal__sub">
              Verification tool for Step 1 (Firebase Auth) &amp; Step 2 (Supabase JWT Bridging)
            </p>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="modal__body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Active Firebase User Details */}
          <div
            style={{
              padding: 14,
              borderRadius: "var(--radius-sm)",
              background: "#fbf9f5",
              border: "1px solid var(--paper-line)",
              fontSize: "var(--fs-xs)",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 6, color: "var(--paper-ink)" }}>
              🔥 Firebase Auth State (Step 1)
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: "4px 8px" }}>
              <span style={{ color: "var(--paper-ink-soft)" }}>Signed-in Email:</span>
              <strong>{user?.email || "Not signed in"}</strong>
              <span style={{ color: "var(--paper-ink-soft)" }}>Firebase UID:</span>
              <code style={{ fontFamily: "var(--font-mono)", color: "var(--jade-600)" }}>{user?.uid || "—"}</code>
              <span style={{ color: "var(--paper-ink-soft)" }}>Project ID:</span>
              <code>invest-mate-b7cee</code>
            </div>
          </div>

          {/* Token Claims */}
          {tokenInfo && (
            <div
              style={{
                padding: 14,
                borderRadius: "var(--radius-sm)",
                background: "#fcfbfa",
                border: "1px solid var(--paper-line)",
                fontSize: "var(--fs-xs)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 700, color: "var(--paper-ink)" }}>
                    🔑 Firebase JWT Claims &amp; Role Check
                  </span>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "2px 8px",
                      borderRadius: 999,
                      fontSize: 10,
                      fontWeight: 700,
                      background: tokenInfo.hasAuthRole ? "rgba(46,125,90,0.12)" : "rgba(201,162,75,0.18)",
                      color: tokenInfo.hasAuthRole ? "var(--jade-600)" : "#8c6d1f",
                    }}
                  >
                    {tokenInfo.hasAuthRole ? "✓ role: 'authenticated'" : "⚠ role claim not set"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    className="btn btn--sm btn--ghost-paper"
                    onClick={handleForceRefresh}
                    disabled={testing}
                    style={{ fontSize: 11, padding: "3px 8px", minHeight: 26 }}
                    title="Force refresh token from Firebase to fetch updated custom claims"
                  >
                    🔄 Force Refresh Claims
                  </button>
                  <button
                    type="button"
                    className="btn btn--sm btn--ghost-paper"
                    onClick={copyToken}
                    style={{ fontSize: 11, padding: "3px 8px", minHeight: 26 }}
                  >
                    {copied ? "✓ Copied" : "Copy Token"}
                  </button>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: "4px 8px", fontSize: 11 }}>
                <span style={{ color: "var(--paper-ink-soft)" }}>Postgres Role (role):</span>
                <code style={{ fontWeight: 700, color: tokenInfo.hasAuthRole ? "var(--jade-600)" : "var(--oxblood-600)" }}>
                  {tokenInfo.role} {tokenInfo.hasAuthRole ? "✓" : "(Requires Cloud Function trigger)"}
                </code>
                <span style={{ color: "var(--paper-ink-soft)" }}>Issuer (iss):</span>
                <code>{tokenInfo.payload.iss}</code>
                <span style={{ color: "var(--paper-ink-soft)" }}>Audience (aud):</span>
                <code>{tokenInfo.payload.aud}</code>
                <span style={{ color: "var(--paper-ink-soft)" }}>Subject (sub):</span>
                <code>{tokenInfo.payload.sub}</code>
                <span style={{ color: "var(--paper-ink-soft)" }}>Expires At:</span>
                <span>{tokenInfo.expDate}</span>
              </div>
            </div>
          )}

          {/* Supabase Third-Party Auth Configuration Reference */}
          <div
            style={{
              padding: 12,
              borderRadius: "var(--radius-sm)",
              background: "rgba(201,162,75,0.08)",
              border: "1px dashed var(--gold-500)",
              fontSize: "var(--fs-xs)",
              color: "#6b5113",
              lineHeight: 1.45,
            }}
          >
            <strong>Supabase Third-Party Auth Setup:</strong>
            <ul style={{ margin: "6px 0 0 16px", padding: 0 }}>
              <li><strong>Provider:</strong> Firebase</li>
              <li><strong>Project ID / Client ID:</strong> <code>invest-mate-b7cee</code></li>
              <li><strong>Issuer URL:</strong> <code>https://securetoken.google.com/invest-mate-b7cee</code></li>
              <li><strong>JWKS Endpoint:</strong> <code>https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com</code></li>
            </ul>
          </div>

          {/* Live Bridge Ping Test */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontWeight: 700, fontSize: "var(--fs-sm)", color: "var(--paper-ink)" }}>
                ⚡ Live Supabase REST Ping with Firebase Bearer Token
              </span>
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={handleRunTest}
                disabled={testing || !user}
              >
                {testing ? "Testing..." : "Send Authenticated Ping"}
              </button>
            </div>

            {testResult && (
              <div
                style={{
                  padding: 12,
                  borderRadius: "var(--radius-sm)",
                  background: testResult.success ? "rgba(46,125,90,0.08)" : "rgba(184,51,42,0.08)",
                  border: `1px solid ${testResult.success ? "var(--jade-500)" : "var(--oxblood-600)"}`,
                  fontSize: "var(--fs-xs)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 16 }}>{testResult.success ? "✅" : "⚠️"}</span>
                  <strong style={{ color: testResult.success ? "var(--jade-700)" : "var(--oxblood-600)" }}>
                    HTTP Status: {testResult.status} {testResult.statusText || ""}
                  </strong>
                </div>

                {testResult.error ? (
                  <p style={{ margin: 0, color: "var(--oxblood-600)" }}>{testResult.error}</p>
                ) : (
                  <div>
                    <p style={{ margin: "0 0 6px 0" }}>
                      Bearer token was transmitted to <code>{SUPABASE_URL}/rest/v1/</code>.
                    </p>
                    <pre
                      style={{
                        margin: 0,
                        padding: 8,
                        background: "#ffffff",
                        borderRadius: 4,
                        border: "1px solid var(--paper-line)",
                        fontSize: 10,
                        maxHeight: 120,
                        overflowY: "auto",
                      }}
                    >
                      {JSON.stringify(testResult, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Supabase Schema & RLS Copy Utility */}
          <div
            style={{
              padding: 12,
              borderRadius: "var(--radius-sm)",
              background: "#f8f9fa",
              border: "1px solid var(--paper-line)",
              fontSize: "var(--fs-xs)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <strong>Supabase Database Schema &amp; RLS Policies</strong>
              <div style={{ color: "var(--paper-ink-soft)", fontSize: 11 }}>
                Contains table definitions &amp; resilient sub-claim RLS policies.
              </div>
            </div>
            <button
              type="button"
              className="btn btn--sm btn--ghost-paper"
              onClick={() => {
                const sqlScript = `-- 1. Resilient Firebase UID extraction function
CREATE OR REPLACE FUNCTION public.firebase_uid()
RETURNS TEXT AS $$
BEGIN
  RETURN COALESCE(
    auth.jwt() ->> 'sub',
    NULLIF(current_setting('request.jwt.claim', true), '')::jsonb ->> 'sub',
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
    auth.uid()::text
  );
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 2. Drop existing RLS policies
DROP POLICY IF EXISTS "Users can only access their own holdings" ON public.holdings;
DROP POLICY IF EXISTS "Users can only access transactions of their holdings" ON public.transactions;
DROP POLICY IF EXISTS "Users can only access income records of their holdings" ON public.income_records;
DROP POLICY IF EXISTS "Users can only access price alerts of their holdings" ON public.price_alerts;
DROP POLICY IF EXISTS "Users can only access their own goals" ON public.goals;

-- 3. Re-create RLS policies with sub verification
CREATE POLICY "Users can only access their own holdings"
ON public.holdings
FOR ALL
TO public
USING (user_id IS NOT NULL AND user_id = public.firebase_uid())
WITH CHECK (user_id IS NOT NULL AND user_id = public.firebase_uid());

CREATE POLICY "Users can only access transactions of their holdings"
ON public.transactions
FOR ALL
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.holdings
    WHERE holdings.id = transactions.holding_id
      AND holdings.user_id = public.firebase_uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.holdings
    WHERE holdings.id = transactions.holding_id
      AND holdings.user_id = public.firebase_uid()
  )
);

CREATE POLICY "Users can only access income records of their holdings"
ON public.income_records
FOR ALL
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.holdings
    WHERE holdings.id = income_records.holding_id
      AND holdings.user_id = public.firebase_uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.holdings
    WHERE holdings.id = income_records.holding_id
      AND holdings.user_id = public.firebase_uid()
  )
);

CREATE POLICY "Users can only access price alerts of their holdings"
ON public.price_alerts
FOR ALL
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.holdings
    WHERE holdings.id = price_alerts.holding_id
      AND holdings.user_id = public.firebase_uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.holdings
    WHERE holdings.id = price_alerts.holding_id
      AND holdings.user_id = public.firebase_uid()
  )
);

CREATE POLICY "Users can only access their own goals"
ON public.goals
FOR ALL
TO public
USING (user_id IS NOT NULL AND user_id = public.firebase_uid())
WITH CHECK (user_id IS NOT NULL AND user_id = public.firebase_uid());`;
                navigator.clipboard.writeText(sqlScript);
                alert("SQL Setup Script copied to clipboard! Paste and run it in your Supabase SQL Editor.");
              }}
              style={{ fontSize: 11 }}
            >
              📋 Copy RLS SQL Script
            </button>
          </div>
        </div>

        <div className="modal__foot">
          <button type="button" className="btn btn--ghost-paper" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
