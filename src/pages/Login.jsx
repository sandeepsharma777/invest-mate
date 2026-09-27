import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { formatFirebaseAuthError } from "../lib/firebase";
import "../styles/auth.css";

export default function Login() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  function validate() {
    const e = {};
    if (!/^\S+@\S+\.\S+$/.test(email)) e.email = true;
    if (!password) e.password = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      await login({ email: email.trim(), password });
      navigate("/dashboard");
    } catch (err) {
      toast(formatFirebaseAuthError(err), "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      <aside className="auth-aside">
        <div className="brand">
          <div className="brand__mark">IM</div>
          <span className="brand__name">InvestMate</span>
        </div>
        <div>
          <p className="auth-aside__quote">
            Every rupee you've put to work, <span>in one ledger.</span>
          </p>
          <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--ink-200)", fontSize: "var(--fs-sm)" }}>
              <span style={{ color: "var(--gold-400)", fontSize: 16 }}>✓</span>
              <span>Unified tracking across stocks, mutual funds, gold, FDs &amp; crypto</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--ink-200)", fontSize: "var(--fs-sm)" }}>
              <span style={{ color: "var(--gold-400)", fontSize: 16 }}>✓</span>
              <span>Cashflow-accurate XIRR, CAGR &amp; dividend accounting</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--ink-200)", fontSize: "var(--fs-sm)" }}>
              <span style={{ color: "var(--gold-400)", fontSize: 16 }}>✓</span>
              <span>Target asset allocation &amp; goal trajectory forecasting</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--ink-200)", fontSize: "var(--fs-sm)" }}>
              <span style={{ color: "var(--gold-400)", fontSize: 16 }}>✓</span>
              <span>100% private — your ledger data remains completely yours</span>
            </div>
          </div>
        </div>
        <p className="auth-aside__foot">Manual entry, always. No market API ever reads your data.</p>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <h1>Welcome back</h1>
          <p className="auth-card__sub">Log in to see where your money stands today.</p>

          <form id="login-form" noValidate onSubmit={handleSubmit}>
            <div className={`field${errors.email ? " has-error" : ""}`} id="field-email">
              <label className="field__label" htmlFor="email">Email address</label>
              <input
                className="input"
                type="email"
                id="email"
                name="email"
                placeholder="you@example.com"
                autoComplete="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setErrors((prev) => ({ ...prev, email: false })); }}
              />
              <p className="field__error">Enter a valid email address.</p>
            </div>

            <div className={`field${errors.password ? " has-error" : ""}`} id="field-password">
              <label className="field__label" htmlFor="password">Password</label>
              <input
                className="input"
                type="password"
                id="password"
                name="password"
                placeholder="••••••••"
                autoComplete="current-password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setErrors((prev) => ({ ...prev, password: false })); }}
              />
              <p className="field__error">Enter your password.</p>
            </div>

            <button className="btn btn--primary btn--block" type="submit" disabled={loading}>
              {loading ? "Logging in…" : "Log in"}
            </button>
          </form>

          <p className="auth-foot">New to InvestMate? <Link to="/signup">Create an account</Link></p>
        </div>
      </main>
    </div>
  );
}
