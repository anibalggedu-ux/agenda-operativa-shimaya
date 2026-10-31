import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import type { Role } from "../shared/types";
import { HOME, ROLE_LABEL, useAuth } from "./auth";
import { Analytics } from "./pages/Analytics";
import { Login } from "./pages/Login";
import { Moderacion } from "./pages/Moderacion";
import { Validar } from "./pages/Validar";
import { Logo } from "./ui";

function Shell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Logo />
          <div className="brand">
            Shimaya Cupones
            {user && <small>{ROLE_LABEL[user.role]}</small>}
          </div>
          {user && (
            <>
              <div className="who">{user.name}</div>
              <button className="secondary" onClick={() => logout().then(() => nav("/login", { replace: true }))}>
                Salir
              </button>
            </>
          )}
        </div>
      </header>
      {children}
    </>
  );
}

function Guard({ role, children }: { role: Role; children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <main className="page narrow"><p role="status">Cargando…</p></main>;
  if (!user) return <Navigate to="/login" replace />;
  // La interfaz solo redirige por comodidad: la autorización real la hace el servidor en cada endpoint.
  if (user.role !== role) return <Navigate to={HOME[user.role]} replace />;
  return <>{children}</>;
}

export function App() {
  const { user, loading } = useAuth();
  return (
    <Shell>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/validar" element={<Guard role="validador"><Validar /></Guard>} />
        <Route path="/moderacion" element={<Guard role="moderador"><Moderacion /></Guard>} />
        <Route path="/analisis" element={<Guard role="analista"><main className="page"><h1>Estadísticas</h1><Analytics /></main></Guard>} />
        <Route path="*" element={loading ? null : <Navigate to={user ? HOME[user.role] : "/login"} replace />} />
      </Routes>
    </Shell>
  );
}
