# Shimaya Cupones

Validación de cupones numéricos de Shimaya Ramen: un trabajador consulta un código, confirma el canje y, opcionalmente, registra los datos del cliente para avisarle de promociones. Tres roles (validador, moderador, analista) con permisos comprobados **en el servidor**.

> Esta carpeta es una app **independiente** dentro del repositorio `agenda-operativa-shimaya` (Next.js + Supabase en Vercel). No comparte código, base de datos ni despliegue con ella: su CI solo corre cuando cambian archivos de `cupones/` y el `tsconfig` raíz la excluye. Si prefieres un repositorio propio, mueve la carpeta tal cual.

**Stack:** TypeScript · Cloudflare Workers (API con [Hono](https://hono.dev)) · Cloudflare D1 · React + Vite (se sirve como *static assets* del mismo Worker, un solo despliegue) · pruebas con Vitest sobre `workerd` real.

## Estructura

| Ruta | Qué hay |
|---|---|
| `migrations/` | Esquema D1 versionado (`0001_esquema_inicial.sql`: tablas, índices, restricciones y *triggers* de inmutabilidad) |
| `src/worker/` | API: `app.ts` (middleware CSRF/cabeceras), `auth.ts` (sesiones y roles), `routes/` (`validator`, `admin`, `analytics`, `auth`), `status.ts` (estado efectivo del cupón), `ratelimit.ts`, `password.ts`, `audit.ts` |
| `src/shared/` | Reglas compartidas servidor/cliente: zona horaria Lima, validaciones, CSV, texto de consentimiento |
| `src/web/` | Interfaz en español (celular, tablet, escritorio) |
| `test/worker/`, `test/web/` | Pruebas de integración del Worker y de interfaz |
| `scripts/` | `create-user.ts` (alta de usuarios) y `seed-local.ts` (datos ficticios, solo local) |
| `docs/` | `ROLES_Y_PERMISOS.md`, `DESPLIEGUE.md` |
| `design/originales/` | Logo y mascota originales (la web usa copias en `public/brand/`) |

## Instalación local

Requisitos: Node 22+. (`.npmrc` activa `legacy-peer-deps`, necesario por el paquete de pruebas de Cloudflare.)

```bash
cd cupones
npm install
npm run db:migrate:local     # crea la D1 local en .wrangler/state y aplica migrations/
npm run db:seed:local        # datos FICTICIOS + 4 usuarios demo (las contraseñas se imprimen una sola vez)
npm run dev                  # build + wrangler dev → http://localhost:8787
```

Para desarrollar la interfaz con recarga en caliente: `npm run dev:web` (puerto 5173, proxy a `wrangler dev`, que debe estar corriendo).
Para empezar de cero: borra `.wrangler/state` y repite migrar + sembrar.

Comandos: `npm run typecheck` · `npm test` (Worker + interfaz) · `npm run build`.

## Cómo funciona (decisiones de negocio documentadas)

**Estado de un cupón.** En la base solo se guarda `available | redeemed | voided`. El estado *efectivo* se calcula con la vigencia de la campaña (una única definición, `src/worker/status.ts`, usada por validación, listados y estadísticas), por prioridad:

1. canjeado → 2. anulado → 3. `ahora ≥ fin` → **vencido** → 4. campaña inactiva o `ahora < inicio` → **campaña no disponible** → 5. **disponible**.

**Vigencia:** inicio inclusivo, fin **exclusivo**. En la interfaz el moderador elige "último día de vigencia" (hora de Lima) y se guarda el instante 00:00 del día siguiente. Las marcas de tiempo se guardan en UTC ISO-8601 y se muestran en `America/Lima` (UTC-5, sin horario de verano).

**Canje atómico e idempotente.** Una sola sentencia `INSERT … SELECT … WHERE <cupón disponible y campaña vigente>` crea el canje; un *trigger* marca el cupón `redeemed` en la misma sentencia y `UNIQUE(coupon_id)` impide un segundo canje aunque dos solicitudes lleguen a la vez. Va en un `db.batch()` (transacción de D1) junto con su registro de auditoría. El cliente envía `Idempotency-Key` (se genera al mostrar "Cupón disponible" y se reutiliza en cada reintento): un reintento o doble clic devuelve el mismo canje (`replayed: true`) sin duplicar. No se confía en `meta.changes` (D1 cuenta también las filas que toca el trigger): se comprueba qué quedó guardado para esa clave.

**Contactos.** El registro es un paso posterior e independiente (`POST /api/validador/redemptions/:id/contact`): solo quien hizo el canje, dentro de 30 min. Sin casilla de consentimiento (desmarcada por defecto) no se guarda nada. Se guarda el texto y la versión aceptada, la fecha y el canje. **No se fusionan personas** por compartir teléfono o correo: cada registro con consentimiento crea su propio contacto (la deduplicación, si se quiere, será una decisión explícita futura). No hay envío de correos/SMS/WhatsApp ni exportaciones de datos personales.

**Estadísticas.** Dos ejes, explicados en pantalla: los indicadores de *cupones* (emitidos, estados, tasa) se filtran por fecha de **creación** del cupón y campaña; los de *canjes* (serie por fecha, por hora) por fecha del **canje** y campaña. **Tasa de canje = canjeados ÷ emitidos** del filtro (el denominador incluye vencidos y anulados). Las categorías de estado son excluyentes y suman el total. Días, semanas (lunes–domingo), meses y horas se agrupan en hora de Lima.

**Importación CSV.** Vista previa (no escribe) → confirmación (el servidor revalida todo). Por defecto **todo o nada**; modo **parcial** opcional. Nunca sobrescribe cupones existentes; detecta duplicados dentro del archivo y contra la base; conserva ceros iniciales (todo se lee como texto; si Excel ya los quitó, la fila se rechaza con una explicación en vez de "arreglarla"). Máximo 2000 filas por archivo; se registran hasta 200 errores por importación.

## Seguridad (resumen)

Sesiones con token aleatorio (en D1 solo su SHA-256), cookie `HttpOnly` + `SameSite=Strict` + `Secure` y prefijo `__Host-` en HTTPS; expiración absoluta 12 h e inactividad 3 h; cierre de sesión que borra la sesión en el servidor. Contraseñas con PBKDF2-SHA256 (WebCrypto; 100 000 iteraciones, el máximo que permite Workers). CSRF: encabezado propio `X-Shimaya-CSRF` + verificación de `Origin` + SameSite. Límites de intentos en D1 (login por cuenta/IP, consulta, canje y códigos inexistentes). CSP estricta y `Cache-Control: no-store` en la API. Sin datos sensibles en `localStorage`; códigos de cupón nunca en URLs. Detalle en `docs/ROLES_Y_PERMISOS.md`.

## Despliegue y operación

Ver `docs/DESPLIEGUE.md` (crear la base, vincularla, migrar, crear el primer moderador y demás usuarios, desplegar, recuperarse de errores).
