"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { obtenerSesion } from "@/lib/session";
import { hashPassword } from "@/lib/password";
import { tieneAccesoRegistro } from "@/lib/permisos";
import { DIAS_SEMANA } from "@/lib/fechas";
import { geocodificarDireccion } from "@/lib/geocodificar";

async function exigirAccesoRegistro() {
  const sesion = await obtenerSesion();
  if (!sesion) throw new Error("No autorizado.");
  const permitido = await tieneAccesoRegistro(sesion.id, sesion.rol);
  if (!permitido) throw new Error("No autorizado.");
  return sesion;
}

async function exigirCoordinador() {
  const sesion = await obtenerSesion();
  if (!sesion || sesion.rol !== "coordinador") throw new Error("No autorizado.");
  return sesion;
}

// ---------------------------------------------------------------------
// Bitácora de auditoría: deja constancia de quién hizo qué corrección o
// eliminación manual desde Registro y cuándo — por transparencia, para que
// nadie tenga que "confiar" en que los datos no se alteraron sin motivo.
// Nunca debe romper la acción principal si el registro falla.
// ---------------------------------------------------------------------

async function registrarCambio(
  sesion: { id: string; nombre: string },
  accion: string,
  detalle?: string
): Promise<void> {
  try {
    const supabase = supabaseServer();
    await supabase.from("auditoria_cambios").insert({
      usuario_id: sesion.id,
      usuario_nombre: sesion.nombre,
      accion,
      detalle: detalle ?? null,
    });
  } catch (error) {
    console.error("No se pudo registrar el cambio en la bitácora de auditoría:", error);
  }
}

const ROLES_VALIDOS = ["capacitador", "supervisor", "coordinador", "gerente"];

export type ResultadoRegistro = { exito: boolean; mensaje?: string };

export async function crearUsuario(
  _prevState: ResultadoRegistro,
  formData: FormData
): Promise<ResultadoRegistro> {
  const sesion = await exigirAccesoRegistro();

  const nombre = String(formData.get("nombre") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const fechaIngreso = String(formData.get("fechaIngreso") || "").trim();
  const fechaNacimiento = String(formData.get("fechaNacimiento") || "").trim();
  const rol = String(formData.get("rol") || "");
  const credencial = String(formData.get("credencial") || "");
  const diaDescanso = String(formData.get("diaDescanso") || "").trim();

  if (!nombre || !rol || !credencial) {
    return { exito: false, mensaje: "Completa nombre, rol y credencial." };
  }
  if (!ROLES_VALIDOS.includes(rol)) {
    return { exito: false, mensaje: "Rol inválido." };
  }
  if (diaDescanso && !(DIAS_SEMANA as readonly string[]).includes(diaDescanso)) {
    return { exito: false, mensaje: "Día de descanso inválido." };
  }

  const supabase = supabaseServer();

  const { data: existente, error: errorExistente } = await supabase
    .from("usuarios")
    .select("id")
    .ilike("nombre", nombre)
    .maybeSingle();

  if (errorExistente) return { exito: false, mensaje: "No se pudo verificar el nombre." };
  if (existente) {
    return { exito: false, mensaje: "Ya existe un usuario registrado con ese nombre." };
  }

  // El login ahora identifica solo por la credencial (sin elegir nombre), así
  // que dos personas no pueden compartir la misma clave — si pasara, no
  // habría forma de saber a cuál de las dos pertenece el inicio de sesión.
  const claveHash = hashPassword(credencial);
  const { data: claveEnUso, error: errorClave } = await supabase
    .from("usuarios")
    .select("id")
    .eq("clave_hash", claveHash)
    .maybeSingle();

  if (errorClave) return { exito: false, mensaje: "No se pudo verificar la credencial." };
  if (claveEnUso) {
    return { exito: false, mensaje: "Esa credencial ya está en uso por otro usuario. Elige una distinta." };
  }

  const { error } = await supabase.from("usuarios").insert({
    nombre,
    email: email || null,
    fecha_ingreso: fechaIngreso || null,
    fecha_nacimiento: fechaNacimiento || null,
    rol,
    clave_hash: claveHash,
    dias_descanso: diaDescanso ? [diaDescanso] : null,
  });

  if (error) return { exito: false, mensaje: "No se pudo registrar el usuario." };

  await registrarCambio(sesion, "Registró un nuevo usuario", `${nombre} — rol ${rol}`);

  return { exito: true, mensaje: `${nombre} fue registrado(a) correctamente como ${rol}.` };
}

export type UsuarioConAcceso = {
  id: string;
  nombre: string;
  rol: string;
  puedeRegistrar: boolean;
  activo: boolean;
};

export async function obtenerUsuariosConAcceso(): Promise<UsuarioConAcceso[]> {
  await exigirCoordinador();
  const supabase = supabaseServer();

  // Los capacitadores nunca pueden tener acceso a Registro (ver
  // lib/permisos.ts), así que se excluyen de esta lista para no mostrar un
  // interruptor que en realidad no tendría ningún efecto.
  const { data, error } = await supabase
    .from("usuarios")
    .select("id, nombre, rol, puede_registrar, activo")
    .not("rol", "in", "(coordinador,capacitador)")
    .order("nombre");

  if (error) throw new Error("No se pudo cargar los usuarios.");

  return (data ?? []).map((u) => ({
    id: u.id,
    nombre: u.nombre,
    rol: u.rol,
    puedeRegistrar: !!u.puede_registrar,
    activo: u.activo !== false,
  }));
}

export async function actualizarAccesoRegistro(
  usuarioId: string,
  valor: boolean
): Promise<ResultadoRegistro> {
  const sesion = await exigirCoordinador();
  const supabase = supabaseServer();

  const { data: usuario } = await supabase.from("usuarios").select("nombre").eq("id", usuarioId).maybeSingle();

  const { error } = await supabase
    .from("usuarios")
    .update({ puede_registrar: valor })
    .eq("id", usuarioId);

  if (error) return { exito: false, mensaje: "No se pudo actualizar el acceso." };

  await registrarCambio(
    sesion,
    valor ? "Activó acceso a Registro" : "Desactivó acceso a Registro",
    usuario?.nombre ?? usuarioId
  );

  return { exito: true };
}

// Dar de baja no borra al usuario (sus reportes, marcaciones y puntos
// históricos quedan intactos) — solo le impide iniciar sesión y lo saca de
// la lista de acceso a Registro. Se puede reactivar en cualquier momento.
export async function actualizarEstadoUsuario(
  usuarioId: string,
  activo: boolean
): Promise<ResultadoRegistro> {
  const sesion = await exigirCoordinador();

  if (!activo && usuarioId === sesion.id) {
    return { exito: false, mensaje: "No puedes darte de baja a ti mismo(a)." };
  }

  const supabase = supabaseServer();
  const { data: usuario } = await supabase.from("usuarios").select("nombre").eq("id", usuarioId).maybeSingle();

  const { error } = await supabase
    .from("usuarios")
    .update({ activo })
    .eq("id", usuarioId);

  if (error) return { exito: false, mensaje: "No se pudo actualizar el estado del usuario." };

  await registrarCambio(
    sesion,
    activo ? "Reactivó a un usuario" : "Dio de baja a un usuario",
    usuario?.nombre ?? usuarioId
  );

  return { exito: true };
}

// ---------------------------------------------------------------------
// Mantenimiento de datos: corregir marcaciones mal registradas y limpiar
// información de prueba. Disponible para cualquiera con acceso a Registro
// (no solo Coordinador), igual que el resto de este archivo.
// ---------------------------------------------------------------------

export type UsuarioBasicoRegistro = { id: string; nombre: string; rol: string };

export async function obtenerUsuariosBasicos(): Promise<UsuarioBasicoRegistro[]> {
  await exigirAccesoRegistro();
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("usuarios")
    .select("id, nombre, rol")
    .order("nombre");

  if (error) throw new Error("No se pudo cargar los usuarios.");
  return data ?? [];
}

export type AsistenciaCorregible = {
  id: string;
  fecha: string;
  horaIngreso: string | null;
  horaSalida: string | null;
};

export async function obtenerAsistenciaParaCorregir(
  usuarioId: string,
  desde: string,
  hasta: string
): Promise<AsistenciaCorregible[]> {
  await exigirAccesoRegistro();
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("asistencia")
    .select("id, fecha, hora_ingreso, hora_salida")
    .eq("usuario_id", usuarioId)
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: false });

  if (error) throw new Error("No se pudo cargar las marcaciones.");

  return (data ?? []).map((a) => ({
    id: a.id,
    fecha: a.fecha,
    horaIngreso: a.hora_ingreso,
    horaSalida: a.hora_salida,
  }));
}

export async function actualizarAsistencia(
  id: string,
  horaIngreso: string | null,
  horaSalida: string | null
): Promise<ResultadoRegistro> {
  const sesion = await exigirAccesoRegistro();
  const supabase = supabaseServer();

  const { data: antes } = await supabase
    .from("asistencia")
    .select("fecha, hora_ingreso, hora_salida, usuarios(nombre)")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("asistencia")
    .update({ hora_ingreso: horaIngreso, hora_salida: horaSalida })
    .eq("id", id);

  if (error) return { exito: false, mensaje: "No se pudo actualizar la marcación." };

  const nombre = (antes as any)?.usuarios?.nombre ?? "—";
  await registrarCambio(
    sesion,
    "Corrigió una marcación de asistencia",
    `${nombre} — ${antes?.fecha ?? "?"}: ingreso ${antes?.hora_ingreso ?? "—"} → ${horaIngreso ?? "—"}, salida ${antes?.hora_salida ?? "—"} → ${horaSalida ?? "—"}`
  );

  return { exito: true };
}

export async function eliminarAsistencia(id: string): Promise<ResultadoRegistro> {
  const sesion = await exigirAccesoRegistro();
  const supabase = supabaseServer();

  const { data: antes } = await supabase
    .from("asistencia")
    .select("fecha, hora_ingreso, hora_salida, usuarios(nombre)")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("asistencia").delete().eq("id", id);
  if (error) return { exito: false, mensaje: "No se pudo eliminar la marcación." };

  const nombre = (antes as any)?.usuarios?.nombre ?? "—";
  await registrarCambio(
    sesion,
    "Eliminó una marcación de asistencia",
    `${nombre} — ${antes?.fecha ?? "?"} (ingreso ${antes?.hora_ingreso ?? "—"}, salida ${antes?.hora_salida ?? "—"})`
  );

  return { exito: true };
}

export type AsignacionEspecialCorregible = {
  id: string;
  usuarioNombre: string;
  tipo: string;
  fechaInicio: string;
  fechaFin: string;
  motivo: string | null;
};

export async function obtenerAsignacionesEspecialesParaCorregir(): Promise<
  AsignacionEspecialCorregible[]
> {
  await exigirAccesoRegistro();
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("asignaciones_especiales")
    .select("id, tipo, fecha_inicio, fecha_fin, motivo, usuarios(nombre)")
    .order("fecha_inicio", { ascending: false });

  if (error) throw new Error("No se pudo cargar las asignaciones especiales.");

  return (data ?? []).map((a: any) => ({
    id: a.id,
    usuarioNombre: a.usuarios?.nombre ?? "—",
    tipo: a.tipo,
    fechaInicio: a.fecha_inicio,
    fechaFin: a.fecha_fin,
    motivo: a.motivo,
  }));
}

export async function eliminarAsignacionEspecialRegistro(id: string): Promise<ResultadoRegistro> {
  const sesion = await exigirAccesoRegistro();
  const supabase = supabaseServer();

  const { data: antes } = await supabase
    .from("asignaciones_especiales")
    .select("tipo, fecha_inicio, fecha_fin, usuarios(nombre)")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("asignaciones_especiales").delete().eq("id", id);
  if (error) return { exito: false, mensaje: "No se pudo eliminar la asignación especial." };

  const nombre = (antes as any)?.usuarios?.nombre ?? "—";
  await registrarCambio(
    sesion,
    "Eliminó una asignación especial",
    `${antes?.tipo ?? "?"} de ${nombre} (${antes?.fecha_inicio ?? "?"} → ${antes?.fecha_fin ?? "?"})`
  );

  return { exito: true };
}

export type ComunicadoCorregible = {
  id: string;
  tipo: string;
  mensaje: string;
  fecha: string;
  autor: string | null;
};

export async function obtenerComunicadosParaCorregir(): Promise<ComunicadoCorregible[]> {
  await exigirAccesoRegistro();
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("comunicados")
    .select("id, tipo, mensaje, fecha, autor")
    .order("fecha", { ascending: false });

  if (error) throw new Error("No se pudo cargar los comunicados.");
  return data ?? [];
}

export async function eliminarComunicado(id: string): Promise<ResultadoRegistro> {
  const sesion = await exigirAccesoRegistro();
  const supabase = supabaseServer();

  const { data: antes } = await supabase
    .from("comunicados")
    .select("tipo, mensaje, fecha")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("comunicados").delete().eq("id", id);
  if (error) return { exito: false, mensaje: "No se pudo eliminar el comunicado." };

  await registrarCambio(
    sesion,
    "Eliminó un comunicado",
    `${antes?.tipo ?? "?"} (${antes?.fecha ?? "?"}): ${(antes?.mensaje ?? "").slice(0, 80)}`
  );

  return { exito: true };
}

export type ReporteCorregible = {
  id: string;
  fecha: string;
  tiendaNombre: string;
  observacion: string;
  actividad: string | null;
};

export async function obtenerReportesParaCorregir(
  usuarioId: string,
  desde: string,
  hasta: string
): Promise<ReporteCorregible[]> {
  await exigirAccesoRegistro();
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("rutas_diarias")
    .select("id, fecha, observacion, actividad, tiendas(nombre)")
    .eq("usuario_id", usuarioId)
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: false });

  if (error) throw new Error("No se pudo cargar los reportes.");

  return (data ?? []).map((r: any) => ({
    id: r.id,
    fecha: r.fecha,
    tiendaNombre: r.tiendas?.nombre ?? "—",
    observacion: r.observacion,
    actividad: r.actividad,
  }));
}

export async function actualizarReporteRegistro(
  id: string,
  observacion: string,
  actividad: string
): Promise<ResultadoRegistro> {
  const sesion = await exigirAccesoRegistro();
  if (!observacion.trim()) {
    return { exito: false, mensaje: "La observación no puede quedar vacía." };
  }

  const supabase = supabaseServer();

  const { data: antes } = await supabase
    .from("rutas_diarias")
    .select("fecha, usuarios(nombre), tiendas(nombre)")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("rutas_diarias")
    .update({ observacion: observacion.trim(), actividad: actividad.trim() || null })
    .eq("id", id);

  if (error) return { exito: false, mensaje: "No se pudo actualizar el reporte." };

  const nombre = (antes as any)?.usuarios?.nombre ?? "—";
  const tienda = (antes as any)?.tiendas?.nombre ?? "—";
  await registrarCambio(
    sesion,
    "Corrigió un reporte de bitácora",
    `${nombre} — ${tienda} (${antes?.fecha ?? "?"})`
  );

  return { exito: true };
}

export async function eliminarReporteRegistro(id: string): Promise<ResultadoRegistro> {
  const sesion = await exigirAccesoRegistro();
  const supabase = supabaseServer();

  const { data: antes } = await supabase
    .from("rutas_diarias")
    .select("fecha, usuarios(nombre), tiendas(nombre)")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("rutas_diarias").delete().eq("id", id);
  if (error) return { exito: false, mensaje: "No se pudo eliminar el reporte." };

  const nombre = (antes as any)?.usuarios?.nombre ?? "—";
  const tienda = (antes as any)?.tiendas?.nombre ?? "—";
  await registrarCambio(
    sesion,
    "Eliminó un reporte de bitácora",
    `${nombre} — ${tienda} (${antes?.fecha ?? "?"})`
  );

  return { exito: true };
}

// ---------------------------------------------------------------------
// Auditorías: quién puede llenarlas (activación puntual, sin fecha fija) y
// la plantilla del checklist (editable por si hay que ampliarla).
// ---------------------------------------------------------------------

export type SupervisorConAuditoria = { id: string; nombre: string; puedeAuditar: boolean };

export async function obtenerSupervisoresConAuditoria(): Promise<SupervisorConAuditoria[]> {
  await exigirAccesoRegistro();
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("usuarios")
    .select("id, nombre, puede_auditar")
    .eq("rol", "supervisor")
    .eq("activo", true)
    .order("nombre");

  if (error) throw new Error("No se pudo cargar los supervisores.");

  return (data ?? []).map((u) => ({
    id: u.id,
    nombre: u.nombre,
    puedeAuditar: !!u.puede_auditar,
  }));
}

export async function actualizarAccesoAuditoria(
  usuarioId: string,
  valor: boolean
): Promise<ResultadoRegistro> {
  const sesion = await exigirAccesoRegistro();
  const supabase = supabaseServer();

  const { data: usuario } = await supabase.from("usuarios").select("nombre").eq("id", usuarioId).maybeSingle();

  const { error } = await supabase
    .from("usuarios")
    .update({ puede_auditar: valor })
    .eq("id", usuarioId);

  if (error) return { exito: false, mensaje: "No se pudo actualizar el acceso." };

  await registrarCambio(
    sesion,
    valor ? "Activó auditoría para un supervisor" : "Desactivó auditoría para un supervisor",
    usuario?.nombre ?? usuarioId
  );

  return { exito: true };
}

export type ItemPlantillaAuditoria = { id: string; categoria: string; item: string; orden: number };

export async function obtenerPlantillaAuditoriaAdmin(): Promise<ItemPlantillaAuditoria[]> {
  await exigirAccesoRegistro();
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("plantilla_auditoria_items")
    .select("id, categoria, item, orden")
    .order("categoria")
    .order("orden");

  if (error) throw new Error("No se pudo cargar la plantilla de auditoría.");
  return data ?? [];
}

export async function agregarItemPlantilla(
  categoria: string,
  item: string
): Promise<ResultadoRegistro> {
  const sesion = await exigirAccesoRegistro();
  const categoriaLimpia = categoria.trim();
  const itemLimpio = item.trim();
  if (!categoriaLimpia || !itemLimpio) {
    return { exito: false, mensaje: "Completa la categoría y el ítem." };
  }

  const supabase = supabaseServer();

  const { data: existentes } = await supabase
    .from("plantilla_auditoria_items")
    .select("orden")
    .eq("categoria", categoriaLimpia)
    .order("orden", { ascending: false })
    .limit(1);

  const siguienteOrden = (existentes?.[0]?.orden ?? 0) + 1;

  const { error } = await supabase
    .from("plantilla_auditoria_items")
    .insert({ categoria: categoriaLimpia, item: itemLimpio, orden: siguienteOrden });

  if (error) return { exito: false, mensaje: "No se pudo agregar el ítem." };

  await registrarCambio(sesion, "Agregó un ítem a la plantilla de auditoría", `${categoriaLimpia}: ${itemLimpio}`);

  return { exito: true };
}

export async function actualizarItemPlantilla(
  id: string,
  categoria: string,
  item: string
): Promise<ResultadoRegistro> {
  const sesion = await exigirAccesoRegistro();
  const categoriaLimpia = categoria.trim();
  const itemLimpio = item.trim();
  if (!categoriaLimpia || !itemLimpio) {
    return { exito: false, mensaje: "Completa la categoría y el ítem." };
  }

  const supabase = supabaseServer();

  const { data: antes } = await supabase
    .from("plantilla_auditoria_items")
    .select("categoria, item")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("plantilla_auditoria_items")
    .update({ categoria: categoriaLimpia, item: itemLimpio })
    .eq("id", id);

  if (error) return { exito: false, mensaje: "No se pudo actualizar el ítem." };

  await registrarCambio(
    sesion,
    "Editó un ítem de la plantilla de auditoría",
    `"${antes?.item ?? "?"}" → "${itemLimpio}"`
  );

  return { exito: true };
}

export async function eliminarItemPlantilla(id: string): Promise<ResultadoRegistro> {
  const sesion = await exigirAccesoRegistro();
  const supabase = supabaseServer();

  const { data: antes } = await supabase
    .from("plantilla_auditoria_items")
    .select("categoria, item")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("plantilla_auditoria_items").delete().eq("id", id);
  if (error) return { exito: false, mensaje: "No se pudo eliminar el ítem." };

  await registrarCambio(
    sesion,
    "Eliminó un ítem de la plantilla de auditoría",
    `${antes?.categoria ?? "?"}: ${antes?.item ?? "?"}`
  );

  return { exito: true };
}

// ---------------------------------------------------------------------
// Nueva tienda: se crea con su dirección de una vez (geocodificada
// automáticamente igual que en "Ubicación de tiendas"), para no tener que
// cargarla por SQL cada vez que se abre un local nuevo.
// ---------------------------------------------------------------------

export async function crearTienda(
  nombre: string,
  direccion: string
): Promise<ResultadoRegistro> {
  const sesion = await exigirAccesoRegistro();

  const nombreLimpio = nombre.trim().toUpperCase();
  if (!nombreLimpio) {
    return { exito: false, mensaje: "El nombre de la tienda es obligatorio." };
  }

  const supabase = supabaseServer();

  const { data: existente } = await supabase
    .from("tiendas")
    .select("id")
    .ilike("nombre", nombreLimpio)
    .maybeSingle();
  if (existente) {
    return { exito: false, mensaje: "Ya existe una tienda con ese nombre." };
  }

  let ubicacion: { direccion: string; lat: number; lon: number } | null = null;
  if (direccion.trim()) {
    const resultado = await geocodificarDireccion(direccion.trim());
    if (resultado) {
      ubicacion = { direccion: direccion.trim(), lat: resultado.lat, lon: resultado.lon };
    }
  }

  const { error } = await supabase.from("tiendas").insert({
    nombre: nombreLimpio,
    direccion: ubicacion?.direccion ?? (direccion.trim() || null),
    lat: ubicacion?.lat ?? null,
    lon: ubicacion?.lon ?? null,
  });

  if (error) return { exito: false, mensaje: "No se pudo crear la tienda." };

  await registrarCambio(sesion, "Creó una nueva tienda", nombreLimpio);

  if (direccion.trim() && !ubicacion) {
    return {
      exito: true,
      mensaje: "Tienda creada, pero no se encontró la dirección — complétala en Ubicación de tiendas.",
    };
  }
  return { exito: true, mensaje: "Tienda creada correctamente." };
}

// ---------------------------------------------------------------------
// Ubicación de tiendas (para el clima): lat/lon opcional por tienda,
// necesario solo una vez para que aparezca el pronóstico en Bitácora,
// Resumen del Día y el portal del Coordinador.
// ---------------------------------------------------------------------

export type TiendaUbicacion = {
  id: string;
  nombre: string;
  direccion: string | null;
  lat: number | null;
  lon: number | null;
};

export async function obtenerTiendasConUbicacion(): Promise<TiendaUbicacion[]> {
  await exigirAccesoRegistro();
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("tiendas")
    .select("id, nombre, direccion, lat, lon")
    .order("nombre");
  if (error) throw new Error("No se pudo cargar las tiendas.");

  return (data ?? []).map((t) => ({
    id: t.id,
    nombre: t.nombre,
    direccion: t.direccion,
    lat: t.lat === null ? null : Number(t.lat),
    lon: t.lon === null ? null : Number(t.lon),
  }));
}

export async function actualizarUbicacionTienda(
  id: string,
  lat: number | null,
  lon: number | null
): Promise<ResultadoRegistro> {
  const sesion = await exigirAccesoRegistro();

  if ((lat === null) !== (lon === null)) {
    return { exito: false, mensaje: "Ingresa latitud y longitud, o deja ambas vacías." };
  }
  if (lat !== null && (lat < -90 || lat > 90)) {
    return { exito: false, mensaje: "Latitud fuera de rango." };
  }
  if (lon !== null && (lon < -180 || lon > 180)) {
    return { exito: false, mensaje: "Longitud fuera de rango." };
  }

  const supabase = supabaseServer();
  const { data: tienda } = await supabase.from("tiendas").select("nombre").eq("id", id).maybeSingle();

  const { error } = await supabase.from("tiendas").update({ lat, lon }).eq("id", id);
  if (error) return { exito: false, mensaje: "No se pudo guardar la ubicación." };

  await registrarCambio(sesion, "Actualizó la ubicación manual de una tienda", tienda?.nombre ?? id);

  return { exito: true };
}

// Busca la dirección escrita con Nominatim (OpenStreetMap) y guarda las
// coordenadas encontradas — evita que el administrador tenga que buscar
// manualmente en Google Maps y copiar lat/lon.
export async function geocodificarUbicacionTienda(
  id: string,
  direccion: string
): Promise<ResultadoRegistro & { lat?: number; lon?: number; direccionEncontrada?: string }> {
  const sesion = await exigirAccesoRegistro();

  if (!direccion.trim()) {
    return { exito: false, mensaje: "Escribe una dirección." };
  }

  const resultado = await geocodificarDireccion(direccion.trim());
  if (!resultado) {
    return {
      exito: false,
      mensaje: "No se encontró esa dirección. Prueba siendo más específico, o ingresa las coordenadas manualmente.",
    };
  }

  const supabase = supabaseServer();
  const { data: tienda } = await supabase.from("tiendas").select("nombre").eq("id", id).maybeSingle();

  const { error } = await supabase
    .from("tiendas")
    .update({ direccion: direccion.trim(), lat: resultado.lat, lon: resultado.lon })
    .eq("id", id);

  if (error) return { exito: false, mensaje: "No se pudo guardar la ubicación." };

  await registrarCambio(
    sesion,
    "Actualizó la dirección de una tienda",
    `${tienda?.nombre ?? id}: ${direccion.trim()}`
  );

  return {
    exito: true,
    mensaje: "Ubicación encontrada y guardada.",
    lat: resultado.lat,
    lon: resultado.lon,
    direccionEncontrada: resultado.direccionEncontrada,
  };
}

// ---------------------------------------------------------------------
// Dirección de vivienda de los colaboradores — para usarla a futuro como
// base de un contador de kilómetros (distancia entre su domicilio y la
// tienda asignada). Por ahora solo se captura y geocodifica; no se usa en
// ningún cálculo todavía.
// ---------------------------------------------------------------------

export type ColaboradorDireccion = {
  id: string;
  nombre: string;
  rol: string;
  direccion: string | null;
  lat: number | null;
  lon: number | null;
};

export async function obtenerColaboradoresConDireccion(): Promise<ColaboradorDireccion[]> {
  await exigirAccesoRegistro();
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("usuarios")
    .select("id, nombre, rol, direccion, lat, lon")
    .order("nombre");
  if (error) throw new Error("No se pudo cargar los colaboradores.");

  return (data ?? []).map((u) => ({
    id: u.id,
    nombre: u.nombre,
    rol: u.rol,
    direccion: u.direccion,
    lat: u.lat === null ? null : Number(u.lat),
    lon: u.lon === null ? null : Number(u.lon),
  }));
}

export async function geocodificarDireccionColaborador(
  id: string,
  direccion: string
): Promise<ResultadoRegistro & { lat?: number; lon?: number; direccionEncontrada?: string }> {
  const sesion = await exigirAccesoRegistro();

  if (!direccion.trim()) {
    return { exito: false, mensaje: "Escribe una dirección." };
  }

  const resultado = await geocodificarDireccion(direccion.trim());
  if (!resultado) {
    return {
      exito: false,
      mensaje: "No se encontró esa dirección. Prueba siendo más específico (calle, número, distrito).",
    };
  }

  const supabase = supabaseServer();
  const { data: colaborador } = await supabase.from("usuarios").select("nombre").eq("id", id).maybeSingle();

  const { error } = await supabase
    .from("usuarios")
    .update({ direccion: direccion.trim(), lat: resultado.lat, lon: resultado.lon })
    .eq("id", id);

  if (error) return { exito: false, mensaje: "No se pudo guardar la dirección." };

  await registrarCambio(
    sesion,
    "Actualizó la dirección de un colaborador",
    `${colaborador?.nombre ?? id}: ${direccion.trim()}`
  );

  return {
    exito: true,
    mensaje: "Dirección encontrada y guardada.",
    lat: resultado.lat,
    lon: resultado.lon,
    direccionEncontrada: resultado.direccionEncontrada,
  };
}

// ---------------------------------------------------------------------
// Bitácora de auditoría: consulta de solo lectura de todo lo registrado
// arriba, para transparencia — cualquiera con acceso a Registro puede ver
// quién corrigió o eliminó qué y cuándo.
// ---------------------------------------------------------------------

export type CambioAuditoria = {
  id: string;
  usuarioNombre: string;
  accion: string;
  detalle: string | null;
  fecha: string;
};

export async function obtenerHistorialCambios(desde: string, hasta: string): Promise<CambioAuditoria[]> {
  await exigirAccesoRegistro();
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("auditoria_cambios")
    .select("id, usuario_nombre, accion, detalle, created_at")
    .gte("created_at", desde + "T00:00:00")
    .lte("created_at", hasta + "T23:59:59")
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) throw new Error("No se pudo cargar el historial de cambios.");

  return (data ?? []).map((c) => ({
    id: c.id,
    usuarioNombre: c.usuario_nombre,
    accion: c.accion,
    detalle: c.detalle,
    fecha: c.created_at,
  }));
}
