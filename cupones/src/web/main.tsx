import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./auth";
import "./styles.css";

// Tres accesos instalables, uno por rol: cada entrada (/validar, /moderacion, /analisis) usa su propio manifiesto
// (nombre y pantalla de inicio). Es solo comodidad: el acceso real lo decide el servidor al iniciar sesión.
const entry = { "/validar": "validador", "/moderacion": "moderador", "/analisis": "analista" }[location.pathname as "/validar"];
if (entry) document.getElementById("manifest")?.setAttribute("href", `/manifest-${entry}.webmanifest`);
if ("serviceWorker" in navigator && import.meta.env.PROD) navigator.serviceWorker.register("/sw.js").catch(() => {});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
