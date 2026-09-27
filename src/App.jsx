import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import Holdings from "./pages/Holdings";
import Analytics from "./pages/Analytics";

/** Redirect unauthenticated users to /login */
function ProtectedRoute({ children }) {
  const { user } = useAuth();
  if (user === undefined) return null; // still loading
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

/** Redirect already-logged-in users away from auth pages */
function PublicRoute({ children }) {
  const { user } = useAuth();
  if (user === undefined) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/signup" element={<PublicRoute><Signup /></PublicRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/holdings" element={<ProtectedRoute><Holdings /></ProtectedRoute>} />
        <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
