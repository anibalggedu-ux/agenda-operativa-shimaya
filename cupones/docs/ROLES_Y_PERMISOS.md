# Roles y permisos

Los permisos se comprueban en el servidor en cada endpoint (`requireRole` en `src/worker/auth.ts`). Ocultar botones en la interfaz es solo comodidad. Un acceso denegado devuelve 403 y queda en la auditoría (`access_denied`); sin sesión, 401.

## Matriz

| Capacidad | Validador | Moderador | Analista |
|---|:-:|:-:|:-:|
| Iniciar / cerrar sesión | ✔ (con el PIN de su tienda) | ✔ | ✔ |
| Consultar un cupón (campaña, beneficio, zona, vigencia, estado) | ✔ | ✘ | ✘ |
| Confirmar canje | ✔ | ✘ | ✘ |
| Registrar contacto del canje que acaba de hacer (30 min) | ✔ | ✘ | ✘ |
| Ver historial de canjes (con datos del cliente si existen) | ✘ | ✔ | ✘ |
| Ver clientes con consentimiento | ✘ | ✔ | ✘ |
| Estadísticas agregadas y gráficos | ✘ | ✔ | ✔ |
| Crear / editar campañas y sus zonas | ✘ | ✔ | ✘ |
| Eliminar campaña (solo si no tiene cupones canjeados ni anulados) | ✘ | ✔ | ✘ |
| Crear cupón individual / importar CSV | ✘ | ✔ | ✘ |
| Anular cupón no canjeado (con motivo) | ✘ | ✔ | ✘ |
| Crear tiendas, ver/generar PIN nuevos, activar o desactivar tiendas | ✘ | ✔ | ✘ |
| Consultar auditoría e importaciones | ✘ | ✔ | ✘ |
| Gestionar usuarios o roles (por interfaz) | ✘ | ✘ | ✘ |

Endpoints: validador → `/api/validador/*`; moderador → `/api/admin/*`; estadísticas → `/api/analytics/*` (moderador y analista). Esta matriz está automatizada en `test/worker/seguridad.test.ts` (cada endpoint × cada rol, más sin sesión).

## Garantías por rol

- **Validador:** nunca recibe datos del cliente ni quién/cuándo canjeó un cupón usado. No puede listar ni buscar clientes.
- **Moderador:** no puede reabrir un cupón canjeado o anulado (lo impide la API *y* un trigger de la base). El historial (canjes, consentimientos, auditoría) es append-only: triggers rechazan `UPDATE`/`DELETE`. No existe endpoint que devuelva contraseñas, hashes ni tokens.
- **Analista:** las consultas de `analytics.ts` solo seleccionan agregados; no se envían datos personales al navegador para ocultarlos después. Sin nombres, teléfonos, correos, códigos, ids de cliente/canje/trabajador ni métricas de contactos. Hay pruebas que serializan la respuesta y verifican la ausencia de esos datos.

Separación de funciones: el moderador **no** puede canjear, y el validador no ve nada administrativo.

## Cupones por tienda

Cada cupón pertenece a una tienda: el código `0001` de Minka y el `0001` de El Polo son cupones distintos y cada uno se canjea una sola vez. El validador solo alcanza los cupones de **su** tienda (la tienda sale de su sesión, no de lo que envíe el navegador). El moderador elige la tienda al crear un cupón o importar un CSV, y puede filtrar el listado por tienda. Los cupones creados antes de esta función no tienen tienda y siguen valiendo en cualquier tienda; si una tienda tiene un cupón con el mismo código que uno sin tienda, el de la tienda tiene prioridad. Un cupón no puede cambiar de tienda (lo impide la base de datos).

**Campañas que reinician el 1 al 1000:** un código es único por tienda *y campaña*; una campaña nueva puede volver a usar los mismos números. Si en una tienda coinciden varios cupones con el mismo número, el validador canjea el que está disponible hoy (la campaña vigente), luego el de la tienda sobre el que no tiene tienda, y por último el de la campaña más reciente. El cupón impreso no distingue campañas por sí solo: el líder debe comparar la campaña y el beneficio que muestra la pantalla con lo que dice el cupón. Evita dejar dos campañas vigentes a la vez con los mismos números en una misma tienda.

**Zonas por rango de número:** cada campaña puede definir zonas con un rango de números de cupón (ej. del 1 al 200 "Comercios menores", del 201 al 400 "Oficinas") en *Campañas → Zonas*. Los rangos valen para todas las tiendas y no pueden cruzarse. La zona se calcula con el número del cupón (0001 = 1) y no se guarda en el cupón: cambiar un rango se aplica de inmediato. El validador ve la zona al consultar y al canjear; el moderador la ve en el listado de cupones; las estadísticas (también para el analista) muestran emitidos, canjeados y tasa por zona. Los números fuera de todo rango aparecen como "Sin zona".

## Acceso de las tiendas con PIN

Cada tienda es un validador con su propio PIN de 6 números; no hay correos ni contraseñas personales de tienda. El moderador las crea en **Tiendas y PIN** (por lote, una por línea): el sistema genera los PIN al azar y los muestra **una sola vez** (con descarga en CSV). Solo se guarda su hash (PBKDF2, igual que las contraseñas), nunca el PIN. El líder abre `/validar`, elige su tienda y escribe el PIN; el canje queda registrado a nombre de la tienda.

- Protección contra adivinar el PIN: 10 intentos fallidos por tienda y 20 por IP cada 15 minutos (en ambos casos devuelve 429 aunque luego se escriba el PIN correcto). Un atacante podría agotar los intentos de una tienda y bloquearla 15 minutos, pero no entrar.
- **PIN nuevo** invalida el anterior y cierra las sesiones abiertas de esa tienda. **Desactivar** corta el acceso de inmediato y la oculta de la lista pública.
- La lista pública de tiendas (`GET /api/auth/tiendas`) solo devuelve id y nombre de las tiendas activas.
- La cuenta interna de cada tienda no tiene contraseña utilizable: no se puede entrar por correo.

## Gestión de usuarios (fuera de la interfaz)

No hay registro público ni autoasignación de roles. Las tiendas se gestionan en el panel del moderador (ver arriba). Los moderadores y analistas se crean con `scripts/create-user.ts` (ver `DESPLIEGUE.md`) por quien tenga acceso a la cuenta de Cloudflare. Para desactivar una cuenta (pierde acceso de inmediato; no se borra para conservar la trazabilidad):

```sql
UPDATE users SET active = 0 WHERE email = 'persona@shimaya.pe';
```

## Privacidad: pendientes a considerar

La app recopila datos personales (Ley N.º 29733 en Perú). Esta primera versión no implementa revocación de consentimiento ni borrado a pedido; si un cliente lo solicita, hay que atenderlo manualmente en D1 (el contacto y su consentimiento; la restricción de inmutabilidad obliga a un procedimiento explícito del administrador) y definir con asesoría legal el texto final de consentimiento y el plazo de conservación.
