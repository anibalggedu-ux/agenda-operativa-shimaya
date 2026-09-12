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
          fondo: "rgb(var(--marca-fondo) / <alpha-value>)",
          superficie: "rgb(var(--marca-superficie) / <alpha-value>)",
          superficie2: "rgb(var(--marca-superficie2) / <alpha-value>)",
          borde: "rgb(var(--marca-borde) / <alpha-value>)",
          texto: "rgb(var(--marca-texto) / <alpha-value>)",
          textofuerte: "rgb(var(--marca-textofuerte) / <alpha-value>)",
          tenue: "rgb(var(--marca-tenue) / <alpha-value>)",
          rojo: "rgb(var(--marca-rojo) / <alpha-value>)",
          rojoclaro: "rgb(var(--marca-rojoclaro) / <alpha-value>)",
          rojooscuro: "rgb(var(--marca-rojooscuro) / <alpha-value>)",
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
