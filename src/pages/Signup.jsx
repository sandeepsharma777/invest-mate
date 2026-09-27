import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { ASSET_TYPES } from "../lib/db";
import "../styles/auth.css";

const ASSET_ICONS = {
  stocks: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 17l6-6 4 4 8-8"/><path d="M17 7h4v4"/></svg>,
  mutual_fund: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="8" width="4" height="12"/><rect x="10" y="4" width="4" height="16"/><rect x="17" y="11" width="4" height="9"/></svg>,
  gold: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="8"/><path d="M9 12h6M12 9v6"/></svg>,
  fixed_deposit: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M8 15h4"/></svg>,
  crypto: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M9.5 8h3.2a2.3 2.3 0 010 4.6H9.5m0 0h3.6a2.3 2.3 0 010 4.6H9.5m1-9.2V7m0 10v1.2"/></svg>,
  other: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M2 12h20"/></svg>,
};

export default function Signup() {
  const { signup } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [fields, setFields] = useState({ name: "", email: "", password: "", password2: "", currency: "INR", agreedTerms: false });
  const [errors, setErrors] = useState({});
  const [pwLevel, setPwLevel] = useState(0);
  const [collected, setCollected] = useState({});

  // First 3 types checked by default
  const allTypes = Object.values(ASSET_TYPES);
  const [selectedTypes, setSelectedTypes] = useState(allTypes.slice(0, 3).map((t) => t.key));
  const [assetError, setAssetError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function set(key, value) {
    setFields((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: false }));
  }

  function handlePwChange(e) {
    const v = e.target.value;
    set("password", v);
    let level = 0;
    if (v.length >= 6) level = 1;
    if (v.length >= 8 && /[0-9]/.test(v)) level = 2;
    if (v.length >= 10 && /[0-9]/.test(v) && /[^A-Za-z0-9]/.test(v)) level = 3;
    setPwLevel(level);
  }

  function handleStep1(e) {
    e.preventDefault();
    const { name, email, password, password2, currency, agreedTerms } = fields;
    const errs = {};
    if (!name.trim()) errs.name = true;
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) errs.email = true;
    if (password.length < 6) errs.password = true;
    if (password !== password2) errs.password2 = true;
    setErrors(errs);
    if (Object.keys(errs).length) return;
    if (!agreedTerms) { toast("Please confirm you understand InvestMate is manual-entry.", "error"); return; }
    setCollected({ name: name.trim(), email: email.trim(), password, currency });
    setStep(2);
  }

  function toggleType(key) {
    setSelectedTypes((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
    setAssetError(false);
  }

  async function handleStep2(e) {
    e.preventDefault();
    if (selectedTypes.length === 0) { setAssetError(true); return; }
    setSubmitting(true);
    try {
      await signup({ ...collected, tracked_asset_types: selectedTypes });
      toast("Account created — welcome to InvestMate!", "success");
      navigate("/dashboard");
    } catch (err) {
      toast(err.message || "Couldn't create your account.", "error");
      setSubmitting(false);
    }
  }

  const stepMeta = {
    1: { heading: "Create your account", sub: "Start with the basics — you're two steps from your dashboard.", stepName: "Account details" },
    2: { heading: "What would you like to track?", sub: "Pick everything that applies — you can change this later.", stepName: "What do you invest in?" },
  };
  const meta = stepMeta[step];

  return (
    <div className="auth-shell">
      <aside className="auth-aside">
        <div className="brand">
          <div className="brand__mark">IM</div>
          <span className="brand__name">InvestMate</span>
        </div>
        <div>
          <p className="auth-aside__quote">Stocks, funds, gold, deposits, crypto — <span>tracked your way.</span></p>
          <p style={{ color: "var(--ink-400)", maxWidth: 380, fontSize: "var(--fs-sm)" }}>
            Tell us what you invest in once at signup. InvestMate builds your dashboard,
            forms and reports around exactly those asset types — nothing you don't need.
          </p>
        </div>
        <p className="auth-aside__foot">Takes about a minute. You can change this anytime in Settings.</p>
      </aside>

      <main className="auth-main">
        <div className="auth-card auth-card--wide">
          <h1 id="step-heading">{meta.heading}</h1>
          <p className="auth-card__sub" id="step-subheading">{meta.sub}</p>

          <div className="step-label">
            <span>Step <b id="step-current">{step}</b> of 2</span>
            <span id="step-name-label">{meta.stepName}</span>
          </div>
          <div className="step-track">
            <div className={`step-track__item${step >= 1 ? " is-active" : ""}${step > 1 ? " is-done" : ""}`} data-step="1" />
            <div className={`step-track__item${step >= 2 ? " is-active" : ""}`} data-step="2" />
          </div>

          {/* ── Step 1 ── */}
          {step === 1 && (
            <form id="step-1" noValidate onSubmit={handleStep1}>
              <div className="field-row">
                <div className={`field${errors.name ? " has-error" : ""}`} id="field-name">
                  <label className="field__label" htmlFor="name">Full name</label>
                  <input className="input" type="text" id="name" placeholder="Asha Verma" autoComplete="name"
                    value={fields.name} onChange={(e) => set("name", e.target.value)} />
                  <p className="field__error">Enter your name.</p>
                </div>
                <div className="field" id="field-currency">
                  <label className="field__label" htmlFor="currency">Reporting currency</label>
                  <select className="input" id="currency" value={fields.currency} onChange={(e) => set("currency", e.target.value)}>
                    <option value="INR">₹ INR — Indian Rupee</option>
                    <option value="USD">$ USD — US Dollar</option>
                    <option value="EUR">€ EUR — Euro</option>
                    <option value="GBP">£ GBP — British Pound</option>
                  </select>
                </div>
              </div>

              <div className={`field${errors.email ? " has-error" : ""}`} id="field-email">
                <label className="field__label" htmlFor="email">Email address</label>
                <input className="input" type="email" id="email" placeholder="you@example.com" autoComplete="email"
                  value={fields.email} onChange={(e) => set("email", e.target.value)} />
                <p className="field__error">Enter a valid email address.</p>
              </div>

              <div className="field-row">
                <div className={`field${errors.password ? " has-error" : ""}`} id="field-password">
                  <label className="field__label" htmlFor="password">Password</label>
                  <input className="input" type="password" id="password" placeholder="At least 6 characters" autoComplete="new-password"
                    value={fields.password} onChange={handlePwChange} />
                  <div className="password-strength" id="pw-strength" data-level={String(pwLevel)}>
                    <span /><span /><span />
                  </div>
                  <p className="field__error">Password must be at least 6 characters.</p>
                </div>
                <div className={`field${errors.password2 ? " has-error" : ""}`} id="field-password2">
                  <label className="field__label" htmlFor="password2">Confirm password</label>
                  <input className="input" type="password" id="password2" placeholder="Re-enter password" autoComplete="new-password"
                    value={fields.password2} onChange={(e) => set("password2", e.target.value)} />
                  <p className="field__error">Passwords don't match.</p>
                </div>
              </div>

              <label className="checkbox-row">
                <input type="checkbox" id="agree-terms" checked={fields.agreedTerms}
                  onChange={(e) => set("agreedTerms", e.target.checked)} />
                <span>I understand InvestMate is manual-entry only — I'll enter and update my own prices, no live market data is pulled in.</span>
              </label>

              <div className="auth-actions">
                <button className="btn btn--primary btn--block" type="submit">Continue</button>
              </div>
            </form>
          )}

          {/* ── Step 2 ── */}
          {step === 2 && (
            <form id="step-2" noValidate onSubmit={handleStep2}>
              <p style={{ color: "var(--ink-200)", fontSize: "var(--fs-sm)", marginBottom: "var(--sp-4)" }}>
                Select every asset type you'd like InvestMate to track.
              </p>
              <div className="asset-picker" id="asset-picker">
                {allTypes.map((type) => {
                  const isSelected = selectedTypes.includes(type.key);
                  return (
                    <label
                      key={type.key}
                      className={`asset-option${isSelected ? " is-selected" : ""}`}
                      data-type={type.key}
                      onClick={() => toggleType(type.key)}
                    >
                      <input
                        type="checkbox"
                        name="asset_type"
                        value={type.key}
                        checked={isSelected}
                        onChange={() => {}} // controlled via onClick on label
                      />
                      <span className="asset-option__icon" style={{ background: "rgba(201,162,75,0.14)", color: "var(--gold-500)" }}>
                        {ASSET_ICONS[type.key] || ASSET_ICONS.other}
                      </span>
                      <span className="asset-option__label">{type.label}</span>
                      <span className="asset-option__desc">{type.description}</span>
                    </label>
                  );
                })}
              </div>
              {assetError && (
                <p className="field__error" id="asset-picker-error" style={{ marginTop: "var(--sp-3)" }}>
                  Pick at least one asset type to continue.
                </p>
              )}
              <div className="auth-actions">
                <button className="btn btn--ghost btn--block" type="button" onClick={() => setStep(1)}>Back</button>
                <button className="btn btn--primary btn--block" type="submit" disabled={submitting}>
                  {submitting ? "Creating account…" : "Create account"}
                </button>
              </div>
            </form>
          )}

          <p className="auth-foot">Already have an account? <Link to="/login">Log in</Link></p>
        </div>
      </main>
    </div>
  );
}
