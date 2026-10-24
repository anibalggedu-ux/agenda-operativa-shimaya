# Roles y permisos

Los permisos se comprueban en el servidor en cada endpoint (`requireRole` en `src/worker/auth.ts`). Ocultar botones en la interfaz es solo comodidad. Un acceso denegado devuelve 403 y queda en la auditoría (`access_denied`); sin sesión, 401.

## Matriz

| Capacidad | Validador | Moderador | Analista |
|---|:-:|:-:|:-:|
| Iniciar / cerrar sesión | ✔ | ✔ | ✔ |
| Consultar un cupón (campaña, beneficio, vigencia, estado) | ✔ | ✘ | ✘ |
| Confirmar canje | ✔ | ✘ | ✘ |
| Registrar contacto del canje que acaba de hacer (30 min) | ✔ | ✘ | ✘ |
| Ver historial de canjes (con datos del cliente si existen) | ✘ | ✔ | ✘ |
| Ver clientes con consentimiento | ✘ | ✔ | ✘ |
| Estadísticas agregadas y gráficos | ✘ | ✔ | ✔ |
| Crear / editar campañas | ✘ | ✔ | ✘ |
| Crear cupón individual / importar CSV | ✘ | ✔ | ✘ |
| Anular cupón no canjeado (con motivo) | ✘ | ✔ | ✘ |
| Consultar auditoría e importaciones | ✘ | ✔ | ✘ |
| Gestionar usuarios o roles (por interfaz) | ✘ | ✘ | ✘ |

Endpoints: validador → `/api/validador/*`; moderador → `/api/admin/*`; estadísticas → `/api/analytics/*` (moderador y analista). Esta matriz está automatizada en `test/worker/seguridad.test.ts` (cada endpoint × cada rol, más sin sesión).

## Garantías por rol

- **Validador:** nunca recibe datos del cliente ni quién/cuándo canjeó un cupón usado. No puede listar ni buscar clientes.
- **Moderador:** no puede reabrir un cupón canjeado o anulado (lo impide la API *y* un trigger de la base). El historial (canjes, consentimientos, auditoría) es append-only: triggers rechazan `UPDATE`/`DELETE`. No existe endpoint que devuelva contraseñas, hashes ni tokens.
- **Analista:** las consultas de `analytics.ts` solo seleccionan agregados; no se envían datos personales al navegador para ocultarlos después. Sin nombres, teléfonos, correos, códigos, ids de cliente/canje/trabajador ni métricas de contactos. Hay pruebas que serializan la respuesta y verifican la ausencia de esos datos.

Separación de funciones: el moderador **no** puede canjear, y el validador no ve nada administrativo.

## Gestión de usuarios (fuera de la interfaz)

No hay registro público ni autoasignación de roles. Los usuarios se crean con `scripts/create-user.ts` (ver `DESPLIEGUE.md`) por quien tenga acceso a la cuenta de Cloudflare. Para desactivar una cuenta (pierde acceso de inmediato; no se borra para conservar la trazabilidad):

```sql
UPDATE users SET active = 0 WHERE email = 'persona@shimaya.pe';
```

## Privacidad: pendientes a considerar

La app recopila datos personales (Ley N.º 29733 en Perú). Esta primera versión no implementa revocación de consentimiento ni borrado a pedido; si un cliente lo solicita, hay que atenderlo manualmente en D1 (el contacto y su consentimiento; la restricción de inmutabilidad obliga a un procedimiento explícito del administrador) y definir con asesoría legal el texto final de consentimiento y el plazo de conservación.
