# Agente de QA (los 4 roles explorando solos)

Abre la app de verdad en un navegador (Playwright) apuntando a un proyecto
Supabase **de prueba**, separado del real, inicia sesión como cada uno de
los 4 roles (`supervisor`, `capacitador`, `coordinador`, `gerente`) y deja
que Claude decida qué tocar en cada paso — como alguien nuevo explorando el
sistema por primera vez — en vez de seguir un guion fijo de pasos. Junta lo
que va encontrando (errores de consola, respuestas fallidas del servidor, y
lo que el propio Claude marque como raro) en un reporte Markdown.

Corre **a pedido** — nadie lo programó para correr solo. Se dispara a mano
cuando quieras probar algo, por ejemplo antes de un deploy grande.

## Por qué un proyecto Supabase separado

El agente va a crear/editar datos libremente (tiendas, marcaciones,
checklists, historias...) mientras explora. Nunca corre contra el proyecto
real (`vcxedfrldesstgbvkhcf`) — `env.ts` aborta con un error si
`QA_SUPABASE_URL` llega a apuntar ahí por error.

El proyecto de prueba vigente es **`agenda-shimaya-qa-agentes`**
(`xqgwnpbyrqxchboeqzhu`), en la misma organización de Supabase. Si Supabase
lo pausó por inactividad (plan gratis, se duerme tras ~1 semana sin uso),
hay que reactivarlo primero desde el dashboard de Supabase o pidiéndole a
Claude que lo haga (`restore_project`).

## Preparación (una vez, o cada vez que se reclone el esquema)

1. **Esquema**: el proyecto de prueba necesita las mismas tablas que
   producción. No hay un script para esto todavía porque se hizo una vez a
   mano reconstruyendo el DDL desde los catálogos de Postgres de
   producción (no hay `supabase/migrations/*.sql` en este repo — todas las
   migraciones históricas se aplicaron directo vía MCP). Si el proyecto de
   prueba queda vacío otra vez, hay que repetir ese proceso antes de seguir.
2. **Credenciales**: copiá `.env.qa.example` a `.env.qa.local` (en esta
   misma carpeta, ya está en `.gitignore`) y completá:
   - `QA_SUPABASE_URL` / `QA_SUPABASE_SERVICE_ROLE_KEY` — del proyecto de
     prueba (panel de Supabase → Project Settings → API).
   - `QA_SESSION_SECRET` — cualquier cadena larga random
     (`openssl rand -base64 32`), no tiene que ser la real.
   - Las 4 `QA_CLAVE_*` si querés credenciales de login específicas (si no,
     usa las de por defecto).
3. **Navegador**: Playwright necesita Chromium. Si ya corriste
   `npx playwright install chromium` antes (o tu máquina ya lo tiene, como
   este contenedor), no hace falta de nuevo.
4. **Sembrar los 4 usuarios de prueba + tiendas**:
   ```bash
   npm run qa:seed
   ```
   Es seguro re-correrlo — borra primero cualquier fila `QA ` que haya
   quedado de una corrida anterior.

## Correrlo

```bash
npm run qa:agente                              # los 4 roles, 20 pasos cada uno
npm run qa:agente -- --roles=supervisor         # un solo rol
npm run qa:agente -- --roles=supervisor,gerente --steps=10
npm run qa:agente -- --headed                   # ver el navegador en vivo (por defecto corre sin cabeza)
```

El script levanta `next dev` solo (en el puerto `QA_APP_PORT`, 3100 por
defecto, para no pisar un `npm run dev` normal en 3000) con las variables de
entorno apuntando a la base de prueba, espera a que esté listo, corre la
exploración, y al final apaga todo solo.

Modelo por defecto: `claude-opus-5-5`. Cada paso es una llamada a la API con
una imagen — en una corrida de los 4 roles × 20 pasos eso son ~80 llamadas
con imagen. Para una corrida más barata/rápida mientras se prueba el script
en sí: `CLAUDE_QA_MODEL=claude-sonnet-5-5 npm run qa:agente -- --steps=8`.

## El reporte

Queda en `scripts/agente-qa/reportes/<fecha>.md` (ignorado por git — son
corridas de prueba, no algo para versionar). Un hallazgo puede venir de:

- **Claude reportándolo** mientras explora (botón que no responde, mensaje
  confuso, dato que no cierra).
- **Errores de consola / excepciones JS** capturados automáticamente,
  aunque Claude no los haya notado en pantalla.
- **Respuestas HTTP ≥400** de cualquier request mientras navegaba.

No todo hallazgo es necesariamente un bug real — Claude puede malinterpretar
una pantalla, o un error de consola puede ser de una librería externa sin
impacto real. Revisar antes de salir corriendo a arreglar.

## Límites conocidos de esta primera versión

- El login se hace siempre por la interfaz real (nunca con una cookie
  fabricada a mano) — así cualquier error ahí también se detecta.
- La lista de "elementos interactivos" que Claude ve en cada paso solo
  incluye lo que entra en el viewport actual (como un celular, 390×844) —
  tiene una herramienta `desplazar` para bajar/subir y ver más.
- Cuando Claude toca un botón de "tomar foto"/"elegir foto", Playwright
  intercepta el selector de archivos nativo y le pasa siempre la misma foto
  de prueba genérica (`fixtures/foto-prueba.jpg`, un cuadro rojo generado
  con ffmpeg) — nunca una foto real. Sirve para probar que el flujo de
  subida funciona, no para detectar problemas específicos de una foto en
  particular.
- Un solo navegador a la vez, un rol detrás del otro — no corre los 4 en
  paralelo (más simple de leer en los logs, pero una corrida completa tarda
  varios minutos).
