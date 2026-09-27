/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      // Las fotos ya se comprimen en el navegador antes de enviarse (ver
      // lib/comprimir-imagen.ts); esto es solo un margen de seguridad.
      bodySizeLimit: "4mb",
    },
    // El binario de ffmpeg-static no se detecta solo al empaquetar la
    // función serverless (no lo referencia un require() estático, sino un
    // spawn() con una ruta armada en tiempo de ejecución) -- sin esto, la
    // ruta de recorte de video fallaría en producción con "spawn ENOENT".
    outputFileTracingIncludes: {
      "/api/historias/recortar-video": ["./node_modules/ffmpeg-static/ffmpeg"],
    },
  },
};

// No se define Content-Security-Policy: Next inyecta scripts en línea y una
// política mal calibrada rompería la app; el resto de cabeceras sí es seguro.
// Cámara y geolocalización siguen permitidas para el propio sitio (marcación).
const cabecerasSeguridad = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=(), payment=()" },
];

nextConfig.headers = async () => [{ source: "/:path*", headers: cabecerasSeguridad }];

module.exports = nextConfig;
