import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { seedDemoData } from "../lib/db";
import "../styles/auth.css";

export default function Login() {
  const { login, signup: signupFn } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

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
      toast(err.message || "Couldn't log in. Try again.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleDemo() {
    setDemoLoading(true);
    const demoEmail = "demo@investmate.app";
    const demoPassword = "demo123";
    try {
      let user;
      try {
        user = await login({ email: demoEmail, password: demoPassword });
      } catch {
        user = await signupFn({
          name: "Asha Verma",
          email: demoEmail,
          password: demoPassword,
          currency: "INR",
          tracked_asset_types: ["stocks", "mutual_fund", "gold", "fixed_deposit", "crypto"],
        });
        await seedDemoData(user.id);
      }
      navigate("/dashboard");
    } catch (err) {
      toast(err.message || "Couldn't start demo.", "error");
      setDemoLoading(false);
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
          <div className="ledger-preview" style={{ marginTop: 32 }}>
            <div className="ledger-preview__row"><span className="seal seal--stocks"><i className="seal__dot" />Stocks</span><span className="num">₹4,32,150</span></div>
            <div className="ledger-preview__row"><span className="seal seal--mutual_fund"><i className="seal__dot" />Mutual Funds</span><span className="num">₹2,18,940</span></div>
            <div className="ledger-preview__row"><span className="seal seal--gold"><i className="seal__dot" />Gold</span><span className="num">₹86,160</span></div>
            <div className="ledger-preview__row"><span className="seal seal--fixed_deposit"><i className="seal__dot" />Fixed Deposit</span><span className="num">₹2,68,750</span></div>
            <div className="ledger-preview__total">
              <span>Portfolio value</span>
              <b className="num">₹10,06,000</b>
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

          <div className="auth-divider">or</div>

          <button className="btn btn--ghost btn--block" type="button" onClick={handleDemo} disabled={demoLoading}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M13 2 3 14h8l-1 8 10-12h-8l1-8z"/>
            </svg>
            {demoLoading ? "Preparing demo…" : "Explore with demo data"}
          </button>

          <p className="auth-foot">New to InvestMate? <Link to="/signup">Create an account</Link></p>
        </div>
      </main>
    </div>
  );
}
