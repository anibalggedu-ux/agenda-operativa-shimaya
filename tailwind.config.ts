import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Identidad visual "Torre de Control": negro, blanco y rojo — los
        // colores de la empresa. Fuente única para todo el rediseño, en vez
        // de repetir hex sueltos en cada componente.
        marca: {
          fondo: "#0d0e10",
          superficie: "#18191d",
          superficie2: "#1f2025",
          borde: "#2a2c31",
          texto: "#f1eee6",
          textofuerte: "#f7f5f2",
          tenue: "#8b8d92",
          rojo: "#d31e2b",
          rojoclaro: "#e23744",
          rojooscuro: "#a6121d",
        },
      },
      // Nombres propios (no "sans"/"mono") para no cambiar de golpe la
      // tipografía de los paneles que todavía no se han rediseñado.
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
        data: ["var(--font-data)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
