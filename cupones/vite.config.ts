import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist/client", emptyOutDir: true, sourcemap: false },
  server: {
    // Desarrollo con recarga en caliente: `npm run dev:web` junto a `wrangler dev` (puerto 8787).
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        configure: (proxy) => proxy.on("proxyReq", (req) => req.setHeader("origin", "http://localhost:8787")),
      },
    },
  },
});
