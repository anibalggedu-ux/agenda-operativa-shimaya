# Despliegue y operación

Todo se hace **a mano**, con tu autorización: el CI de GitHub solo comprueba tipos, pruebas y build, y no despliega.

## 0. Requisitos
Cuenta de Cloudflare con Workers y D1 (PBKDF2 consume CPU: usa el plan **Workers Paid**; en Free el límite de ~10 ms de CPU puede cortar el inicio de sesión). `npx wrangler login` (OAuth) en tu terminal. No pongas tokens en el repositorio.

## 1. Crear y vincular la base de datos
```bash
cd cupones
npx wrangler d1 create shimaya-cupones      # imprime database_id
```
Copia el `database_id` en `wrangler.jsonc` (reemplaza el marcador `0000…`) y haz commit (el id no es un secreto). Si usas otro nombre, ajusta también `database_name`.

## 2. Migrar
```bash
npm run db:migrate:remote      # wrangler d1 migrations apply DB --remote
```
Las migraciones son aditivas y versionadas (`migrations/NNNN_*.sql`); wrangler registra cuáles ya se aplicaron. **Antes de cada migración en producción**, haz una copia (sección 6). Nunca edites una migración ya aplicada: crea una nueva.

## 3. Primer moderador y demás usuarios
```bash
npm run user:create -- --remote --email jefe@shimaya.pe --name "Nombre Apellido" --role moderador
npm run user:create -- --remote --email datos@shimaya.pe --name "Análisis" --role analista
npm run user:create -- --remote --email caja1@shimaya.pe --reset-password     # olvidó su clave (cierra sus sesiones)
```
Los validadores **no** se crean por terminal: cada tienda se crea desde el panel del moderador (**Tiendas y PIN**), que genera su PIN. Por terminal solo se crean moderadores y analistas. La contraseña (mín. 12 caracteres) se pide por teclado sin eco (o `SHIMAYA_NEW_PASSWORD`); solo se guarda su hash. Con `--remote` pide confirmación. `--local` o `--remote` es obligatorio. Usa un correo y contraseña únicos por persona; entrégalos por un canal seguro y pide cambiarlos si lo ves necesario (restablecer con `--reset-password`).

## 4. Desplegar
```bash
npm run build && npx wrangler deploy        # o: npm run deploy
```
Sirve la API y la interfaz desde el mismo Worker (`*.workers.dev` o tu dominio en el panel de Cloudflare → Workers → Domains & Routes). Recomendado además: **reglas WAF / Rate Limiting de Cloudflare** sobre `/api/auth/login`, `/api/auth/pin-login` y `/api/validador/*` (la app ya limita intentos en D1, esto lo refuerza en el borde) y Cloudflare Access si quieres restringir por red.

Verificación posterior: abre la URL, inicia sesión con cada rol, consulta/canjea un cupón de prueba (créalo con el moderador) y revisa que el analista solo vea estadísticas.

## 5. Datos de demostración
`npm run db:seed:local` es **solo local** y se niega con `--remote`. No cargues datos ficticios en producción.

## 6. Respaldo y recuperación
- **Time Travel de D1** (restauración a cualquier minuto de los últimos 30 días, plan Paid): `npx wrangler d1 time-travel info DB` y `npx wrangler d1 time-travel restore DB --timestamp=<ISO>`. Restaurar sobrescribe la base: confirma antes.
- **Exportación manual:** `npx wrangler d1 export DB --remote --output respaldo.sql` antes de migrar. El respaldo contiene datos personales: guárdalo cifrado y fuera del repositorio.
- **Una migración falló a medias:** wrangler aplica cada migración como una transacción; si falla no queda registrada. Corrige el SQL de la migración *nueva* y reintenta; si afectó datos, restaura con Time Travel.
- **Revertir un despliegue del código:** `npx wrangler rollback` (vuelve a la versión anterior del Worker; no toca la base). Las migraciones son aditivas para que la versión anterior siga funcionando.
- **Cuenta comprometida o rotación:** desactiva al usuario (`UPDATE users SET active = 0 …`) y/o `DELETE FROM sessions WHERE user_id = …` para cerrar sesiones al instante.
- **Importación equivocada:** los cupones importados sin canjear se pueden anular uno a uno; los cupones no se borran. Para revertir un lote completo, usa Time Travel.

## 7. Qué NO está verificado hasta que lo hagas en tu cuenta
Ejecución en D1 y Workers de producción (las pruebas usan la emulación local `workerd` + SQLite de Miniflare), rendimiento de PBKDF2 en tu plan, dominio/TLS, reglas WAF, Time Travel.

## 8. Windows
Los scripts de `npm run user:create` y `db:*` funcionan en Windows (PowerShell). Si `npm` dice que la ejecución de scripts está deshabilitada: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
