// Cliente de la API. Las sesiones viajan en una cookie HttpOnly que el navegador adjunta solo:
// aquí no se guarda NINGÚN token ni dato sensible (nada en localStorage).

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public body: Record<string, unknown> = {},
  ) {
    super(message);
  }
  get fieldErrors(): Record<string, string> {
    return (this.body.fieldErrors as Record<string, string> | undefined) ?? {};
  }
}

/** No hubo respuesta del servidor (sin señal, corte de red). El resultado de la operación es incierto. */
export class NetworkError extends Error {
  constructor() {
    super("No hay conexión con el servidor. Revisa tu señal e intenta de nuevo.");
  }
}

export async function api<T>(method: string, path: string, opts: { body?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: {
        "x-shimaya-csrf": "1",
        ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
        ...opts.headers,
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new NetworkError();
  }
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* respuesta no JSON (p. ej. error del borde) */
  }
  if (!res.ok) {
    throw new ApiClientError(res.status, String(data.error ?? "error"), String(data.message ?? "Ocurrió un error. Intenta de nuevo."), data);
  }
  return data as T;
}

export const qs = (params: Record<string, string | number | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiClientError || e instanceof NetworkError) return e.message;
  return "Ocurrió un error inesperado. Intenta de nuevo.";
}
