import type { Context } from "hono";
import { z } from "zod";
import type { Role } from "../shared/types";

export interface AuthUser {
  id: string;
  name: string;
  role: Role;
  sessionId: string;
}

export interface Deps {
  /** Reloj inyectable: las pruebas fijan el tiempo; en producción es `new Date()`. */
  now: () => Date;
}

export type AppEnv = {
  Bindings: Env;
  Variables: { user: AuthUser; now: Date };
};
export type Ctx = Context<AppEnv>;

export class ApiError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429 | 500,
    public code: string,
    message: string,
    public extra: Record<string, unknown> = {},
    public headers: Record<string, string> = {},
  ) {
    super(message);
  }
}

const MAX_BODY_BYTES = 512 * 1024;

export async function readJson(c: Ctx): Promise<unknown> {
  const len = Number(c.req.header("content-length") ?? "0");
  if (len > MAX_BODY_BYTES) throw new ApiError(413, "body_too_large", "El envío es demasiado grande.");
  const text = await c.req.text();
  if (text.length > MAX_BODY_BYTES) throw new ApiError(413, "body_too_large", "El envío es demasiado grande.");
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "invalid_json", "No pudimos leer el envío.");
  }
}

/** Valida con zod y devuelve errores por campo (en español) cuando falla. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  const fieldErrors: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const key = issue.path.join(".") || "_";
    fieldErrors[key] ??= issue.message;
  }
  throw new ApiError(422, "validation", "Revisa los datos ingresados.", { fieldErrors });
}

export function tooManyRequests(retryAfterSeconds: number): ApiError {
  return new ApiError(
    429,
    "rate_limited",
    "Demasiados intentos. Espera un momento antes de volver a intentar.",
    { retryAfterSeconds },
    { "Retry-After": String(retryAfterSeconds) },
  );
}

export const clientIp = (c: Ctx) => c.req.header("cf-connecting-ip") ?? "desconocida";

export const pageParams = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** Constructor de consultas con parámetros numerados (?1, ?2…): nunca se interpolan valores. */
export class Q {
  readonly params: unknown[] = [];
  p(value: unknown): string {
    this.params.push(value);
    return `?${this.params.length}`;
  }
}
