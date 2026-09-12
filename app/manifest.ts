import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Agenda Operativa Shimaya",
    short_name: "Shimaya",
    description: "Sistema de gestión operativa Shimaya",
    start_url: "/",
    display: "standalone",
    background_color: "#0d0e10",
    theme_color: "#d31e2b",
    orientation: "portrait",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
