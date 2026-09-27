import { NavLink, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { initials } from "../lib/utils";

export default function DashboardLayout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  async function handleLogout(e) {
    e.preventDefault();
    await logout();
    navigate("/login");
  }

  const navLinks = [
    {
      to: "/dashboard",
      label: "Dashboard",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="8" height="8" rx="1.5"/>
          <rect x="13" y="3" width="8" height="5" rx="1.5"/>
          <rect x="13" y="12" width="8" height="9" rx="1.5"/>
          <rect x="3" y="14" width="8" height="7" rx="1.5"/>
        </svg>
      ),
    },
    {
      to: "/holdings",
      label: "Holdings",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 19V6a2 2 0 012-2h8l6 6v9a2 2 0 01-2 2H6a2 2 0 01-2-2z"/>
          <path d="M14 4v6h6"/>
        </svg>
      ),
    },
    {
      to: "/analytics",
      label: "Analytics",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 19V9M11 19V4M18 19v-6"/>
        </svg>
      ),
    },
    {
      to: "/goals",
      label: "Goals",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9"/>
          <circle cx="12" cy="12" r="5"/>
          <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
        </svg>
      ),
    },
  ];

  return (
    <>
      <button
        className="nav-toggle"
        id="nav-toggle"
        aria-label={sidebarOpen ? "Close menu" : "Open menu"}
        aria-expanded={sidebarOpen}
        onClick={() => setSidebarOpen((o) => !o)}
      >
        {sidebarOpen ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        )}
      </button>

      {sidebarOpen && (
        <div
          className="sidebar-scrim is-open"
          id="sidebar-scrim"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="app-shell">
        <aside className={`sidebar${sidebarOpen ? " is-open" : ""}`}>
          <div className="brand">
            <div className="brand__mark">IM</div>
            <span className="brand__name">InvestMate</span>
          </div>

          <nav className="nav-group">
            <div className="nav-group__label">Overview</div>
            <ul>
              {navLinks.map((link) => (
                <li key={link.to}>
                  <NavLink
                    className={({ isActive }) => `nav-link${isActive ? " is-active" : ""}`}
                    to={link.to}
                    onClick={() => setSidebarOpen(false)}
                  >
                    {link.icon}
                    {link.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <div className="sidebar__footer">
            <div className="user-chip">
              <div className="user-chip__avatar">{user ? initials(user.name) : "—"}</div>
              <div className="user-chip__info">
                <div className="user-chip__name" title={user?.name || ""}>{user?.name || "Loading…"}</div>
                <div className="user-chip__email" title={user?.email || ""}>{user?.email || ""}</div>
              </div>
            </div>
            <button type="button" className="logout-link" onClick={handleLogout}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
              </svg>
              Log out
            </button>
          </div>
        </aside>

        <main className="main">
          {children}
        </main>
      </div>
    </>
  );
}
