import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Pruebas de interfaz (React + jsdom). Las reglas críticas se prueban en el servidor (vitest.config.ts).
export default defineConfig({
  plugins: [react()],
  test: { environment: "jsdom", include: ["test/web/**/*.test.tsx"], globals: false },
});
