"use client";

import { useEffect, useState } from "react";

const CLAVE = "shimaya-tema";

export default function ThemeToggle() {
  const [tema, setTema] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const actual = document.documentElement.getAttribute("data-theme");
    setTema(actual === "light" ? "light" : "dark");
  }, []);

  function alternar() {
    const nuevo = tema === "dark" ? "light" : "dark";
    setTema(nuevo);
    if (nuevo === "light") {
      document.documentElement.setAttribute("data-theme", "light");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    try {
      localStorage.setItem(CLAVE, nuevo);
    } catch {}
  }

  return (
    <button
      type="button"
      onClick={alternar}
      className="bg-marca-superficie2 border border-marca-borde text-marca-tenue hover:text-marca-texto w-9 h-9 rounded-[3px] text-sm shrink-0 transition"
      aria-label={tema === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      title={tema === "dark" ? "Modo claro" : "Modo oscuro"}
    >
      {tema === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
