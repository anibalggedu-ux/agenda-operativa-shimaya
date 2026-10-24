import { Hono } from "hono";
import { ApiError, type AppEnv, type Deps } from "./http";
import { adminRoutes } from "./routes/admin";
import { analyticsRoutes } from "./routes/analytics";
import { authRoutes } from "./routes/auth";
import { validatorRoutes } from "./routes/validator";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function createApp(deps: Deps = { now: () => new Date() }) {
  const app = new Hono<AppEnv>();

  app.use("/api/*", async (c, next) => {
    c.set("now", deps.now());

    // CSRF: además de la cookie SameSite=Strict, toda petición que modifica datos debe traer un
    // encabezado propio (un sitio ajeno no puede enviarlo sin permiso CORS, que no concedemos) y,
    // si trae Origin, debe ser el de esta misma app.
    if (MUTATING.has(c.req.method)) {
      const origin = c.req.header("origin");
      if (origin && origin !== new URL(c.req.url).origin) throw new ApiError(403, "bad_origin", "Origen no permitido.");
      if (c.req.header("x-shimaya-csrf") !== "1") throw new ApiError(403, "csrf", "Petición no permitida.");
    }

    await next();

    // Respuestas autenticadas con datos sensibles: jamás en cachés compartidas ni del navegador.
    c.res.headers.set("Cache-Control", "no-store");
    c.res.headers.set("Pragma", "no-cache");
    c.res.headers.set("X-Content-Type-Options", "nosniff");
    c.res.headers.set("Referrer-Policy", "no-referrer");
  });

  app.route("/api/auth", authRoutes);
  app.route("/api/validador", validatorRoutes);
  app.route("/api/admin", adminRoutes);
  app.route("/api/analytics", analyticsRoutes);

  app.all("/api/*", () => {
    throw new ApiError(404, "not_found", "Ruta inexistente.");
  });

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      for (const [k, v] of Object.entries(err.headers)) c.header(k, v);
      return c.json({ error: err.code, message: err.message, ...err.extra }, err.status);
    }
    // Sin parámetros ni cuerpo en el log: podrían contener códigos o datos personales.
    console.error("unhandled", err instanceof Error ? err.name : "unknown");
    return c.json({ error: "internal", message: "Ocurrió un error inesperado. Intenta de nuevo." }, 500);
  });

  return app;
}
