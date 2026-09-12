/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      // Las fotos ya se comprimen en el navegador antes de enviarse (ver
      // lib/comprimir-imagen.ts); esto es solo un margen de seguridad.
      bodySizeLimit: "4mb",
    },
  },
};

module.exports = nextConfig;
