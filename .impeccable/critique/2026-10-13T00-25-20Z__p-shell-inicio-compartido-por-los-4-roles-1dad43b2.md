---
target: Shell + Inicio (panel-shell.tsx, resumen-del-dia.tsx) -- compartido por los 4 roles
total_score: 21
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:/home/user/agenda-operativa-shimaya/app/panel/panel-shell.tsx + app/panel/resumen-del-dia.tsx (app shell + Inicio, compartido por los 4 roles)"
timestamp: 2026-10-13T00-25-20Z
slug: p-shell-inicio-compartido-por-los-4-roles-1dad43b2
---
#### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Esqueleto de carga genérico (una sola barra pulsante) sin indicar cuánto contenido viene ni qué rol lo está cargando |
| 2 | Match System / Real World | 3 | Lenguaje de puntualidad/racha/bitácora encaja con el dominio; "Camino a [tienda]" + Maps/Waze coincide con cómo navega el equipo real |
| 3 | User Control and Freedom | 2 | "Atendido" en una alerta de puntualidad no tiene deshacer ni confirmación |
| 4 | Consistency and Standards | 2 | Colores de estado (amber/emerald) están codificados a mano, fuera del sistema de tokens `marca-*` que sí respeta el resto de la app |
| 5 | Error Prevention | 2 | Un solo toque suprime permanentemente una alerta real de tardanza de un empleado nombrado, sin confirmación |
| 6 | Recognition Rather Than Recall | 3 | Las tarjetas muestran etiqueta + valor juntos; el chevron ▲/▼ comunica el estado sin exigir memoria |
| 7 | Flexibility and Efficiency | 1 | Sin atajos para quien revisa Inicio varias veces al día; la barra flotante limita a 4 botones + "Más" sin ruta rápida para usuarios frecuentes |
| 8 | Aesthetic and Minimalist Design | 3 | Paleta contenida en general, pero el modo Halloween apila telarañas + murciélago + chispas sobre una pantalla ya cargada de alertas |
| 9 | Error Recovery | 2 | Los errores se muestran, pero como texto plano sin botón de reintentar en la mayoría de los casos |
| 10 | Help and Documentation | 1 | Sin onboarding ni tooltips para tarjetas expandibles, el overflow "Más", o qué significa el borde dorado pulsante |
| **Total** | | **21/40** | **Aceptable — mejoras significativas necesarias antes de que el equipo esté cómodo** |

#### Design Specificity Verdict

**Evaluación LLM**: No es una plantilla de dashboard genérica — hay especificidad real de producto: la paleta "Torre de Control" roja/negra/dorada ligada a la marca, saludos conscientes de la hora de Perú, un carrusel horizontal en vez de grid (decisión explícita documentada en el propio código porque un grid "ocupaba 2 o 3 filas completas en el celular"), ETA por GPS con recálculo en vivo, lenguaje de puntualidad específico de operaciones de campo, y toda una capa estacional de Halloween condicionada por fecha. El español suena natural, no traducido. Dicho esto, la capa de Halloween (sonidos de fantasma, chispas, murciélago, "truco" diario) es mucha superficie para una pantalla operativa seria — se siente como un agregado personal encima de una herramienta de trabajo, con riesgo de sentirse fuera de lugar para un gerente revisando alertas de tardanza en el campo.

**Escaneo determinístico**: El detector automático (`impeccable detect`) encontró 1 hallazgo en los archivos objetivo y 4 en total al ampliar a todo `app/panel`: el patrón `side-tab` ("borde de acento de un solo lado", la marca más reconocible de interfaces generadas por IA) en `panel-shell.tsx:306` (`border-r-2 border-r-marca-oro/70` en la barra de título de sección) y en 3 botones más (`boton-apoyos.tsx:12`, `boton-libro.tsx:12`, `boton-propinas.tsx:11`, todos con `border-l-2`, importados dentro de Central Analítica). El propio subagente de evidencia marcó una posible falsa alarma parcial: el caso de `panel-shell.tsx:306` es un acento de 2px en una píldora redondeada ya con borde completo, no el clásico "franja de color en todo el borde izquierdo de una tarjeta" — vale la pena mirarlo igual, pero es un caso más leve que el patrón típico de "slop".

Otros hallazgos estáticos del mismo subagente: cero colores hex sueltos fuera del sistema de tokens (bien), cero `console.log` olvidados, y todos los botones de solo-ícono en los dos archivos objetivo sí tienen `aria-label`. Pero sí hay bloques de clases Tailwind duplicadas verbatim (2 veces en `resumen-del-dia.tsx` para cajas de alerta, 3 veces para filas de lista) que sugieren componentes que todavía no se extrajeron.

**Overlays visuales**: no disponibles — no hay herramienta de navegador en esta sesión, y el servidor de desarrollo no puede levantar acá (faltan `SESSION_SECRET`/`SUPABASE_URL` en este entorno). La revisión se basó en código fuente, no en captura en vivo.

#### Overall Impression

El shell y el Inicio tienen una identidad visual real y decisiones de producto pensadas para el contexto (campo, celular, Perú) — no es una plantilla genérica. Pero la pantalla que todos los roles ven primero, todos los días, carga demasiadas alertas con el mismo peso visual al mismo tiempo, y el camino de "control de usuario" en la interacción de mayor riesgo (silenciar una alerta de tardanza de un empleado real) tiene menos fricción que acciones de mucho menor riesgo en otras partes de la app. La mayor oportunidad: diferenciar visualmente "esto es serio, sobre una persona real" de "esto es un detalle de temporada", y agregar una red de seguridad a la única acción de la pantalla que de verdad puede ocultar un problema real.

#### What's Working

1. **Tarjeta de ETA consciente del contexto** (`resumen-del-dia.tsx:704-758`): recalcula con GPS en vivo, distingue con claridad "(desde tu ubicación actual)" vs "(tráfico en tiempo real desde tu domicilio)", y nunca pide permiso de ubicación solo por abrir Inicio.
2. **Reversión honesta en la confirmación optimista** (`resumen-del-dia.tsx:180-203`): al marcar una alerta como atendida, la UI la quita de inmediato pero la restaura y muestra un error con nombre si el servidor falla — mejor que la mayoría de apps, que dejan fallar el toque en silencio.
3. **Sistema de colores por tokens centralizado** (`globals.css`, `tailwind.config.ts`): variables `--marca-*` mapeadas a Tailwind con `rgb(var(--x)/<alpha-value>)` es un patrón limpio y mantenible que la mayoría de la interfaz sí respeta.

#### Priority Issues

**[P0] Silenciar una alerta de tardanza no tiene deshacer ni confirmación**
- **Por qué importa**: Un solo toque en "Atendido" (`resumen-del-dia.tsx:456-462`) suprime para siempre una alerta real sobre un empleado nombrado, en una lista densa donde el botón está a muy poca distancia (`gap-1`) del texto — el escenario típico de un toque accidental con el celular en la mano, caminando. Es la interacción de más riesgo de toda la pantalla y la que menos protección tiene.
- **Fix**: Agregar confirmación (o una ventana corta de "deshacer" tipo toast) antes de marcar como atendida, igual de seria que la protección que ya existe en otras partes de la app para acciones de menor riesgo.
- **Suggested command**: `/impeccable harden`

**[P1] Si falla la carga de datos, Inicio queda vacío en silencio**
- **Por qué importa**: `obtenerResumenPersonal()`/`obtenerResumenOperativo()` usan `.catch(() => {})` (`resumen-del-dia.tsx:168`) — si la petición falla, no hay mensaje de error ni botón de reintentar, solo una pantalla sin tarjetas que parece decir "no tienes nada hoy". Esto es justo el escenario de "mala señal en tienda" que el resto de la app sí resuelve con colas offline — Inicio es la excepción que no tiene esa red de seguridad.
- **Fix**: Mostrar un estado de error con botón de reintentar en vez de tragarse el fallo.
- **Suggested command**: `/impeccable harden`

**[P1] Colores de estado codificados a mano rompen el tema claro**
- **Por qué importa**: `amber-950/20`, `amber-500/40`, `emerald-950/30`, `emerald-400`, etc. aparecen repetidos (`resumen-del-dia.tsx:427-434, 534, 545, 579-580, 601, 655`) por fuera del sistema `--marca-*`/`data-theme="light"` que gobierna el resto de la interfaz. Nunca se probaron contra el tema claro — justo el que más usaría un supervisor con el celular bajo el sol, donde la legibilidad del color de estado (tarde vs. a tiempo) es lo que más importa.
- **Fix**: Mover esos estados a tokens de marca con su propia variante clara/oscura, igual que el resto del sistema.
- **Suggested command**: `/impeccable layout`

**[P1] Ningún elemento interactivo muestra el foco de teclado**
- **Por qué importa**: No hay `focus-visible`/`focus:ring`/`outline` en ninguno de los dos archivos — cada botón (pestañas, cerrar el drawer, cambiar tema, tarjetas expandibles, Maps/Waze) depende del foco por defecto del navegador, que el reset de Tailwind suele apagar o adelgazar. Alguien navegando con teclado no puede saber dónde está parado.
- **Fix**: Agregar un anillo de foco visible y consistente a todos los elementos interactivos del shell e Inicio.
- **Suggested command**: `/impeccable audit`

**[P2] Demasiados avisos compiten por el mismo peso visual arriba de la pantalla**
- **Por qué importa**: El banner de "truco o trato" de Halloween, el de pedir ubicación, y la alerta personal de puntualidad pueden aparecer los tres al mismo tiempo (`resumen-del-dia.tsx:373-438`), todos con cajas rojas/ámbar casi idénticas. No hay forma de distinguir de un vistazo "esto es en broma" de "esto es sobre tu trabajo", justo en la pantalla pensada para un vistazo de 10 segundos entre tareas.
- **Fix**: Dar jerarquía visual distinta a lo serio (puntualidad) vs. lo decorativo (temporada); considerar que lo estacional nunca compita en la misma fila que una alerta real.
- **Suggested command**: `/impeccable distill`

#### Persona Red Flags

**Casey (usuaria móvil distraída, una sola mano)**: Los botones de la barra flotante inferior son círculos de `w-9 h-9` (36px) con un ícono de 18px adentro — por debajo del mínimo recomendado de ~44px — y se angostan más cuantos más ítems hay visibles. El botón "Atendido" además está a solo `gap-1` del texto de la alerta: exactamente el tipo de toque fino que falla caminando con el celular en la mano.

**Sam (depende de lector de pantalla / navegación por teclado)**: Cero `focus-visible` en todo el shell e Inicio bloquea la navegación por teclado básica. Además, las tarjetas expandibles (`Tarjeta`, líneas 65-86) nunca declaran `aria-expanded`, así que un lector de pantalla no tiene forma de saber que tocar la tarjeta revela contenido debajo, ni dónde.

**Riley (prueba casos borde)**: Si `obtenerResumenPersonal()`/`obtenerResumenOperativo()` fallan, el `.catch(() => {})` deja la pantalla vacía sin ningún aviso — justo el escenario de "tienda con mala señal" que CLAUDE.md documenta como un problema ya resuelto en otras partes de la app (colas offline), pero no en Inicio.

#### Minor Observations

- El saludo y la fecha usan `new Date().getHours()` / `toLocaleDateString()` directo (`resumen-del-dia.tsx:238-242`) en vez de `horaPeru()`/`hoyPeru()`, que es la convención que el propio CLAUDE.md del proyecto exige para toda lógica de fecha/hora — podría mostrar "Buenas noches" a alguien en Lima con el reloj del celular mal configurado.
- `window.location.reload()` en "Recargar página" (`panel-shell.tsx:262`) es un recargo completo sin confirmación, que pierde cualquier tarjeta abierta o formulario sin guardar.
- Estrategias de truncado inconsistentes: la etiqueta de `BotonBarra` usa `truncate` pero el valor de `TarjetaAncha` no, con riesgo de desbordar en nombres largos de tienda/comunicado.
- Las chispas de "toca para encender" usan `Date.now() + i` como key de React (`resumen-del-dia.tsx:267`) — funciona hoy, pero es frágil si dos toques caen en el mismo milisegundo.
- Clases Tailwind duplicadas verbatim en `resumen-del-dia.tsx` (cajas de alerta en líneas 387/441, filas de lista en 650/672/688) sugieren que conviene extraer esos patrones a un componente compartido.

#### Questions to Consider

- Si el huso horario del celular de un supervisor está mal (común en equipos heredados), ¿alguien probó esta pantalla con un dispositivo fuera de la zona de Perú?
- ¿La decoración de Halloween se validó con coordinadores/gerentes reales, o es una decisión solo del equipo de desarrollo?
- ¿Por qué silenciar una alerta de puntualidad sobre un empleado nombrado toma un solo toque sin confirmación, cuando recuperarse de una foto que no subió en otra parte de la app sí justificó todo un sistema de colas offline?
