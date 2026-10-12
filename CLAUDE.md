# CLAUDE.md

Este archivo le da contexto a Claude Code (claude.ai/code) al trabajar con el código de este repositorio.

## Qué es esto

Agenda Operativa Shimaya — una app de gestión operativa de campo para los supervisores, capacitadores, coordinadores y gerentes de una cadena de restaurantes en Perú. Reemplazó un sistema hecho en Google Apps Script (los comentarios marcados `FIX SEGURIDAD` en todo el código señalan vulnerabilidades puntuales que esa migración corrigió — ej. el rol guardado en `sessionStorage`, editable desde el navegador, ahora es un JWT firmado por el servidor). Next.js 14 (App Router), Supabase (Postgres) como único almacén de datos, desplegado en Vercel.

## Comandos

- `npm run dev` — servidor de desarrollo local
- `npm run build` — build de producción (también corre el chequeo de tipos y el lint como parte de `next build`)
- `npx tsc --noEmit` — solo chequeo de tipos, más rápido que un build completo; correr esto después de cualquier cambio
- `npm run lint` — ESLint (`next lint`)
- Este repositorio no tiene suite de tests.

`npm run build` en local falla en el paso "Collecting page data" con `SESSION_SECRET no esta configurado` a menos que `.env.local` tenga las variables cargadas (ver `.env.example`) — es esperado en un entorno sin esos secretos y no es señal de que el cambio rompió algo; con `npx tsc --noEmit` limpio más "Compiled successfully" en el log del build alcanza para confirmar que el cambio está bien antes de subirlo.

## Arquitectura

### Cuatro roles, un solo middleware, una sola sesión

`supervisor`, `capacitador`, `coordinador`, `gerente` son los únicos roles (`lib/session.ts`). Cada uno tiene su propio portal en `/panel/<rol>` (`app/panel/<rol>/page.tsx` o `panel-tabs.tsx`), armado desde `PanelShell` (`app/panel/panel-shell.tsx`) con un arreglo de `ItemMenuPanel` (id, etiqueta, ícono, contenido) que cada rol arma a su manera. La sesión es un JWT firmado en una cookie httpOnly (`lib/session.ts`); `middleware.ts` revisa el claim `rol` del JWT contra el segmento de la ruta `/panel/<rol>` en cada petición, antes de que cualquier página o Server Action corra — el código del navegador nunca decide el acceso. `Central Analítica`, `Registro`, `Documentos`, `Calendario` y `Auditorías` son rutas compartidas donde el middleware solo exige una sesión válida; el control de acceso fino (quién puede registrar usuarios, ver el calendario de otros, etc.) se vuelve a revisar dentro de la página o la Server Action correspondiente (`lib/permisos.ts`).

Cada Server Action vuelve a validar su propia autorización — `lib/session.ts` exporta `exigirSesion()`, `exigirCoordinador()`, `exigirGerente()`, `exigirGerenteOCoordinador()` como guardas compartidas (antes cada archivo tenía su propia copia duplicada; los guards nuevos van ahí en vez de volver a declararlos).

Supervisor, coordinador y capacitador hacen visitas de campo y comparten los mismos widgets de "Bitácora" (`tieneBitacora()` en `lib/session.ts`): selector de tiendas, reporte con GPS, exportación a PDF. Coordinador y gerente son los roles de "oficina", con acceso de lectura más amplio sobre los datos de todos.

### Acceso a datos

`lib/supabase-server.ts` crea un cliente de Supabase con `service_role` — se salta RLS por completo, así que **solo** se debe importar desde código de servidor (Server Actions, Route Handlers), nunca desde un archivo `"use client"`; si no, la clave viajaría al navegador. El cliente está tipado contra `lib/database.types.ts`, generado desde el esquema real vía las herramientas MCP de Supabase — hay que regenerarlo después de cualquier migración, no editarlo a mano.

Las Server Actions viven en archivos `actions.ts` (o `*-actions.ts`) junto a las páginas/componentes que las llaman, uno por área de funcionalidad (ej. `app/panel/coordinador/actions.ts`, `app/panel/break-actions.ts`). No hay una capa de API entre los componentes y Supabase, más allá de estos archivos.

**`tiendas_permanentes`** (qué tiendas están asignadas de forma fija a quién) se borra en blando: quitar una asignación pone `fecha_fin` en vez de borrar la fila, así que la tabla también sirve de historial. Cualquier consulta contra ella que busque asignaciones "actuales" tiene que filtrar `.is("fecha_fin", null)` — una consulta que no lo hace es un bug (esto pasó repetidas veces en el código: widgets de pantalla, búsqueda de destinatarios de notificaciones por correo, y chequeos de autorización de "¿es esta tu tienda asignada?" necesitaron esta corrección). La única excepción a propósito es `obtenerRotacionTienda` en `app/panel/analitica/actions.ts`, que existe justamente para mostrar el historial completo.

### Manejo de hora de Perú

Toda lógica de "qué día/hora es" debe pasar por `hoyPeru()` / `horaPeru()` / `diaSemanaPeru()` etc. de `lib/fechas.ts`, nunca `new Date()` directo. Los helpers calculan la hora de pared de Perú (UTC-5) corriendo `Date.now()` (un instante absoluto) y leyéndolo de vuelta con getters UTC — no sumando `getTimezoneOffset()`, que es para leer con getters *locales* y duplica el offset en silencio en un celular cuya zona horaria del sistema operativo ya es Perú. `diaLaboralPeru()` además trata las horas antes de las 6am como si todavía fueran "ayer", para los cierres de tienda de capacitador pasada la medianoche.

### Marcaciones offline-first

Las marcaciones de campo pasan en tiendas con mala señal (estacionamientos subterráneos, poca cobertura). `lib/cola-marcaciones.ts` y `lib/cola-checklists.ts` guardan en cola los envíos que fallaron en `localStorage`, y un componente `SincronizadorOffline` (montado en `PanelShell`) los reintenta solo apenas vuelve la conexión. Seguir este mismo patrón para cualquier flujo nuevo donde "no se puede perder esto si se corta la red a mitad del guardado", en vez de solo mostrar un error.

### Almacenamiento de fotos

`lib/blob-storage.ts` es lo único que el resto de la app llama para guardar/leer fotos (marcaciones, historias, perfiles, evidencias, agenda) — arma las rutas con prefijo de carpeta y delega al proveedor que `lib/almacen-fotos.ts` elija según las variables de entorno (Cloudflare R2 de preferencia, Vercel Blob como respaldo), detrás de una interfaz compartida `AlmacenFotos`. Las fotos se leen con enlaces firmados de corta duración, nunca con URLs públicas permanentes. No llamar a los SDK de R2/Vercel Blob directo desde código de funcionalidad.

### Sonido, celebración y ambientación de temporada

`lib/sonido.ts` sintetiza todos los sonidos de la interfaz con osciladores WebAudio (sin archivos de audio); los "paquetes" de sonido elegibles se guardan en `localStorage`. `reproducirSonidoLogro()` también dispara un evento `shimaya:celebracion` en `window`, que un único componente `Celebracion` (montado una vez en `PanelShell`) escucha para dibujar las partículas de confeti cayendo — agregar sonidos de logro nuevos llamando a las funciones ya exportadas, no inventando un disparador de animación en paralelo.

Octubre completo está condicionado en toda la app por `esTemporadaHalloween()` en `lib/fechas.ts` (revisa solo el mes) y agrega detalles decorativos/sonoros encima (brillo en los íconos del menú, confeti de hojas/murciélagos en vez de dorado, favicon de calabaza, el emoji del saludo tocable con chispas, una tarjeta de "truco o trato" una vez al día, la animación de entrada de la mascota re-vestida en `/login`) sin alterar ninguna lógica de fondo — esta es la plantilla a seguir para cualquier otra ambientación de temporada condicionada por fecha.

### Generación de PDF

`lib/generar-pdf.ts` centraliza el uso de jsPDF — encabezado y campos compartidos, constantes de ancho de página y color. Los generadores de PDF específicos de cada funcionalidad (checklists de visita, reportes de no cumplimiento, perfil) viven en el `*-pdf-actions.ts` / `pdf-actions.ts` propio de cada área y llaman a estos helpers compartidos en vez de rehacer el layout.

### Carga perezosa de secciones del panel

`app/panel/panel-lazy.tsx` envuelve cada pestaña pesada del panel (Central Analítica, Documentos, Calendario, etc.) en `next/dynamic` con `ssr: false` y un esqueleto de carga, porque la mayoría del tráfico es desde celular. Las pestañas pesadas nuevas van acá, en vez de importarlas directo en el archivo de página/tabs de cada rol.

### Estilos

Tailwind, pero los valores de color reales son variables CSS personalizadas en `app/globals.css` (`--marca-*`, más un acento de temporada `--calabaza`) mapeadas en `tailwind.config.ts` como `rgb(var(--x) / <alpha-value>)` — así es como funciona el override de `data-theme="light"` en `globals.css`. Los colores de marca/acento nuevos van con el mismo patrón (variable CSS + entrada de color en Tailwind) en vez de hex directo, y hay que respetar `prefers-reduced-motion` (hay un bloque dedicado al final de `globals.css` que desactiva/oculta cada animación propia) al agregar animaciones CSS nuevas.
