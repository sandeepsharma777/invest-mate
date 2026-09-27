import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import App from "./App";

// Global styles — same order as original HTML <link> tags
import "./styles/variables.css";
import "./styles/base.css";
import "./styles/components.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </AuthProvider>
  </StrictMode>
);
