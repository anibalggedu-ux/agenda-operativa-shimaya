"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { obtenerSesion, exigirCoordinador } from "@/lib/session";
import { hashPassword } from "@/lib/password";
import { tieneAccesoRegistro } from "@/lib/permisos";
import { DIAS_SEMANA } from "@/lib/fechas";
import { geocodificarDireccion } from "@/lib/geocodificar";
import { eliminarFotoMarcacion } from "@/lib/azure-storage";

export async function exigirAccesoRegistro() {
  const sesion = await obtenerSesion();
  if (!sesion) throw new Error("No autorizado.");
  const permitido = await tieneAccesoRegistro(sesion.id, sesion.rol);
  if (!permitido) throw new Error("No autorizado.");
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
  detalle?: string,
  motivo?: string
): Promise<void> {
  try {
    const supabase = supabaseServer();
    const motivoLimpio = motivo?.trim();
    const detalleFinal = motivoLimpio ? `${detalle ?? ""} · Motivo: ${motivoLimpio}` : detalle ?? null;
    await supabase.from("auditoria_cambios").insert({
      usuario_id: sesion.id,
      usuario_nombre: sesion.nombre,
      accion,
      detalle: detalleFinal,
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
  const direccion = String(formData.get("direccion") || "").trim();
  const horaLimiteIngreso = String(formData.get("horaLimiteIngreso") || "").trim();
  const horarioPorDiaRaw = String(formData.get("horarioPorDia") || "").trim();

  if (!nombre || !rol || !credencial) {
    return { exito: false, mensaje: "Completa nombre, rol y credencial." };
  }
  if (!ROLES_VALIDOS.includes(rol)) {
    return { exito: false, mensaje: "Rol inválido." };
  }
  if (diaDescanso && !(DIAS_SEMANA as readonly string[]).includes(diaDescanso)) {
    return { exito: false, mensaje: "Día de descanso inválido." };
  }

  let horarioPorDia: Record<string, string> | null = null;
  if (horarioPorDiaRaw) {
    try {
      const parseado = JSON.parse(horarioPorDiaRaw);
      if (parseado && typeof parseado === "object" && Object.keys(parseado).length > 0) {
        horarioPorDia = parseado;
      }
    } catch {
      // Si por algún motivo el JSON viene corrupto, se ignora el horario
      // mixto en vez de bloquear el registro del usuario.
    }
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

  let ubicacion: { direccion: string; lat: number; lon: number } | null = null;
  if (direccion) {
    const resultado = await geocodificarDireccion(direccion);
    if (resultado) {
      ubicacion = { direccion, lat: resultado.lat, lon: resultado.lon };
    }
  }

  const { error } = await supabase.from("usuarios").insert({
    nombre,
    email: email || null,
    fecha_ingreso: fechaIngreso || null,
    fecha_nacimiento: fechaNacimiento || null,
    rol,
    clave_hash: claveHash,
    dias_descanso: diaDescanso ? [diaDescanso] : null,
    direccion: ubicacion?.direccion ?? (direccion || null),
    lat: ubicacion?.lat ?? null,
    lon: ubicacion?.lon ?? null,
    hora_limite_ingreso: horaLimiteIngreso ? `${horaLimiteIngreso}:00` : null,
    horario_por_dia: horarioPorDia,
  });

  if (error) return { exito: false, mensaje: "No se pudo registrar el usuario." };

  await registrarCambio(sesion, "Registró un nuevo usuario", `${nombre} — rol ${rol}`);

  if (direccion && !ubicacion) {
    return {
      exito: true,
      mensaje: `${nombre} fue registrado(a) correctamente como ${rol}, pero no se encontró la dirección — complétala luego en Dirección de colaboradores.`,
    };
  }

  return { exito: true, mensaje: `${nombre} fue registrado(a) correctamente como ${rol}.` };
}

export type UsuarioConAcceso = {
  id: string;
  nombre: string;
  rol: string;
  puedeRegistrar: boolean;
  activo: boolean;
  fechaNacimiento: string | null;
  fechaIngreso: string | null;
  puntosHeredados: number;
};

export async function obtenerUsuariosConAcceso(): Promise<UsuarioConAcceso[]> {
  await exigirCoordinador();
  const supabase = supabaseServer();

  // Coordinador no se gestiona desde acá. Capacitador sí aparece — nunca
  // puede tener acceso a Registro (ver lib/permisos.ts), así que ese
  // interruptor se oculta para su fila en la UI, pero igual necesita poder
  // darse de baja/reactivarse (suspensiones, renuncias con vuelta, etc.).
  const { data, error } = await supabase
    .from("usuarios")
    .select("id, nombre, rol, puede_registrar, activo, fecha_nacimiento, fecha_ingreso, puntos_heredados")
    .not("rol", "in", "(coordinador)")
    .order("nombre");

  if (error) throw new Error("No se pudo cargar los usuarios.");

  return (data ?? []).map((u) => ({
    id: u.id,
    nombre: u.nombre,
    rol: u.rol,
    puedeRegistrar: !!u.puede_registrar,
    activo: u.activo !== false,
    fechaNacimiento: u.fecha_nacimiento,
    fechaIngreso: u.fecha_ingreso,
    puntosHeredados: u.puntos_heredados ?? 0,
  }));
}

// Edita los datos que solo se cargaban al crear al usuario y después
// quedaban fijos para siempre: nombre, rol, PIN, fecha de nacimiento, fecha
// de ingreso y puntos heredados (para alguien que llega con historial de
// otra sede). El PIN es el único campo realmente sensible: si viene vacío
// no se toca, así no hace falta conocer ni reescribir el actual para
// cambiar cualquier otro dato.
export async function actualizarDatosUsuario(
  usuarioId: string,
  datos: {
    nombre: string;
    rol: string;
    nuevoPin: string;
    fechaNacimiento: string;
    fechaIngreso: string;
    puntosHeredados: string;
  }
): Promise<ResultadoRegistro> {
  const sesion = await exigirCoordinador();

  const nombre = datos.nombre.trim();
  const rol = datos.rol;
  const nuevoPin = datos.nuevoPin.trim();
  const puntosHeredados = datos.puntosHeredados.trim() ? Number(datos.puntosHeredados) : 0;

  if (!nombre || !rol) {
    return { exito: false, mensaje: "Completa nombre y rol." };
  }
  if (!ROLES_VALIDOS.includes(rol)) {
    return { exito: false, mensaje: "Rol inválido." };
  }
  if (Number.isNaN(puntosHeredados) || puntosHeredados < 0) {
    return { exito: false, mensaje: "Los puntos heredados deben ser un número válido." };
  }

  const supabase = supabaseServer();

  const { data: antes } = await supabase
    .from("usuarios")
    .select("nombre, rol")
    .eq("id", usuarioId)
    .maybeSingle();

  const { data: nombreEnUso } = await supabase
    .from("usuarios")
    .select("id")
    .ilike("nombre", nombre)
    .neq("id", usuarioId)
    .maybeSingle();

  if (nombreEnUso) {
    return { exito: false, mensaje: "Ya existe otro usuario registrado con ese nombre." };
  }

  const cambios: {
    nombre: string;
    rol: string;
    fecha_nacimiento: string | null;
    fecha_ingreso: string | null;
    puntos_heredados: number;
    clave_hash?: string;
  } = {
    nombre,
    rol,
    fecha_nacimiento: datos.fechaNacimiento || null,
    fecha_ingreso: datos.fechaIngreso || null,
    puntos_heredados: puntosHeredados,
  };

  if (nuevoPin) {
    const claveHash = hashPassword(nuevoPin);
    const { data: pinEnUso } = await supabase
      .from("usuarios")
      .select("id")
      .eq("clave_hash", claveHash)
      .neq("id", usuarioId)
      .maybeSingle();

    if (pinEnUso) {
      return { exito: false, mensaje: "Ese PIN ya está en uso por otro usuario. Elige uno distinto." };
    }
    cambios.clave_hash = claveHash;
  }

  const { error } = await supabase.from("usuarios").update(cambios).eq("id", usuarioId);
  if (error) return { exito: false, mensaje: "No se pudo guardar los cambios." };

  const detalle =
    antes && (antes.nombre !== nombre || antes.rol !== rol)
      ? `${antes.nombre} (${antes.rol}) → ${nombre} (${rol})${nuevoPin ? " · PIN restablecido" : ""}`
      : `${nombre}${nuevoPin ? " · PIN restablecido" : ""}`;

  await registrarCambio(sesion, "Editó los datos de un colaborador", detalle);

  return { exito: true, mensaje: "Datos actualizados correctamente." };
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
  horaSalida: string | null,
  motivo?: string
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
    `${nombre} — ${antes?.fecha ?? "?"}: ingreso ${antes?.hora_ingreso ?? "—"} → ${horaIngreso ?? "—"}, salida ${antes?.hora_salida ?? "—"} → ${horaSalida ?? "—"}`,
    motivo
  );

  return { exito: true };
}

export async function eliminarAsistencia(id: string, motivo?: string): Promise<ResultadoRegistro> {
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
    `${nombre} — ${antes?.fecha ?? "?"} (ingreso ${antes?.hora_ingreso ?? "—"}, salida ${antes?.hora_salida ?? "—"})`,
    motivo
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

export async function eliminarAsignacionEspecialRegistro(
  id: string,
  motivo?: string
): Promise<ResultadoRegistro> {
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
    `${antes?.tipo ?? "?"} de ${nombre} (${antes?.fecha_inicio ?? "?"} → ${antes?.fecha_fin ?? "?"})`,
    motivo
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

export async function eliminarComunicado(id: string, motivo?: string): Promise<ResultadoRegistro> {
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
    `${antes?.tipo ?? "?"} (${antes?.fecha ?? "?"}): ${(antes?.mensaje ?? "").slice(0, 80)}`,
    motivo
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
    .select("id, fecha, observacion, actividad, tiendas!tienda_id(nombre)")
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
  actividad: string,
  motivo?: string
): Promise<ResultadoRegistro> {
  const sesion = await exigirAccesoRegistro();
  if (!observacion.trim()) {
    return { exito: false, mensaje: "La observación no puede quedar vacía." };
  }

  const supabase = supabaseServer();

  const { data: antes } = await supabase
    .from("rutas_diarias")
    .select("fecha, usuarios(nombre), tiendas!tienda_id(nombre)")
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
    `${nombre} — ${tienda} (${antes?.fecha ?? "?"})`,
    motivo
  );

  return { exito: true };
}

export async function eliminarReporteRegistro(id: string, motivo?: string): Promise<ResultadoRegistro> {
  const sesion = await exigirAccesoRegistro();
  const supabase = supabaseServer();

  const { data: antes } = await supabase
    .from("rutas_diarias")
    .select("fecha, usuarios(nombre), tiendas!tienda_id(nombre)")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("rutas_diarias").delete().eq("id", id);
  if (error) return { exito: false, mensaje: "No se pudo eliminar el reporte." };

  const nombre = (antes as any)?.usuarios?.nombre ?? "—";
  const tienda = (antes as any)?.tiendas?.nombre ?? "—";
  await registrarCambio(
    sesion,
    "Eliminó un reporte de bitácora",
    `${nombre} — ${tienda} (${antes?.fecha ?? "?"})`,
    motivo
  );

  return { exito: true };
}

// ---------------------------------------------------------------------
// Marcación de llegada/salida a UNA tienda en particular (foto + GPS) —
// distinta de "Asistencia (marcaciones GPS)", que corrige el ingreso/salida
// GENERAL del día. Vive en rutas_activas (todavía pendiente de reportar) o
// rutas_diarias (ya reportada), según el caso — se listan ambas juntas.
// "Liberar" borra solo esa marcación puntual (con su foto), dejando intacta
// la asignación o el reporte con su observación, para que la persona pueda
// volver a marcar bien (o, como con los eventos, dejar de aparecer marcado
// en una tienda donde en realidad no estuvo).
// ---------------------------------------------------------------------

export type MarcacionTiendaCorregible = {
  id: string;
  tabla: "rutas_activas" | "rutas_diarias";
  fecha: string;
  tiendaNombre: string;
  estado: "Pendiente" | "Reportado";
  horaLlegada: string | null;
  horaSalida: string | null;
};

export async function obtenerMarcacionesTiendaParaCorregir(
  usuarioId: string,
  desde: string,
  hasta: string
): Promise<MarcacionTiendaCorregible[]> {
  await exigirAccesoRegistro();
  const supabase = supabaseServer();

  const [{ data: activas, error: errorActivas }, { data: diarias, error: errorDiarias }] = await Promise.all([
    supabase
      .from("rutas_activas")
      .select("id, fecha_planificada, hora_llegada, hora_salida, tiendas!tienda_id(nombre)")
      .eq("usuario_id", usuarioId)
      .gte("fecha_planificada", desde)
      .lte("fecha_planificada", hasta),
    supabase
      .from("rutas_diarias")
      .select("id, fecha, hora_llegada, hora_salida, tiendas!tienda_id(nombre)")
      .eq("usuario_id", usuarioId)
      .gte("fecha", desde)
      .lte("fecha", hasta),
  ]);

  if (errorActivas || errorDiarias) throw new Error("No se pudo cargar las marcaciones.");

  const filas: MarcacionTiendaCorregible[] = [
    ...(activas ?? []).map((r: any) => ({
      id: r.id,
      tabla: "rutas_activas" as const,
      fecha: r.fecha_planificada,
      tiendaNombre: r.tiendas?.nombre ?? "—",
      estado: "Pendiente" as const,
      horaLlegada: r.hora_llegada,
      horaSalida: r.hora_salida,
    })),
    ...(diarias ?? []).map((r: any) => ({
      id: r.id,
      tabla: "rutas_diarias" as const,
      fecha: r.fecha,
      tiendaNombre: r.tiendas?.nombre ?? "—",
      estado: "Reportado" as const,
      horaLlegada: r.hora_llegada,
      horaSalida: r.hora_salida,
    })),
  ]
    // Solo interesan acá las que tienen algo marcado que se pueda liberar.
    .filter((f) => f.horaLlegada || f.horaSalida);

  return filas.sort((a, b) => b.fecha.localeCompare(a.fecha));
}

export async function liberarMarcacionTienda(
  tabla: "rutas_activas" | "rutas_diarias",
  id: string,
  parte: "llegada" | "salida",
  motivo?: string
): Promise<ResultadoRegistro> {
  const sesion = await exigirAccesoRegistro();
  if (tabla !== "rutas_activas" && tabla !== "rutas_diarias") {
    return { exito: false, mensaje: "No autorizado." };
  }

  const supabase = supabaseServer();
  const columnaFecha = tabla === "rutas_activas" ? "fecha_planificada" : "fecha";

  const { data: antes } = await (supabase.from(tabla) as any)
    .select(`${columnaFecha}, usuarios(nombre), tiendas!tienda_id(nombre)`)
    .eq("id", id)
    .maybeSingle();

  const cambios =
    parte === "llegada"
      ? { hora_llegada: null, ubicacion_llegada: null, foto_llegada_blob: null }
      : { hora_salida: null, ubicacion_salida: null, foto_salida_blob: null };

  const { error } = await (supabase.from(tabla) as any).update(cambios).eq("id", id);
  if (error) return { exito: false, mensaje: "No se pudo liberar la marcación." };

  const nombre = antes?.usuarios?.nombre ?? "—";
  const tienda = antes?.tiendas?.nombre ?? "—";
  const fecha = antes?.[columnaFecha] ?? "?";
  await registrarCambio(
    sesion,
    `Liberó la marcación de ${parte} de una tienda`,
    `${nombre} — ${tienda} (${fecha})`,
    motivo
  );

  return { exito: true };
}

// ---------------------------------------------------------------------
// Depuración de fotos de marcación (Azure) anteriores a una fecha de corte.
// Borra el archivo real en Azure y limpia SOLO la columna de la foto en
// cada fila que lo referencia -- la hora, la ubicación (link de Maps) y
// todo lo demás del reporte/asignación quedan intactos, así como la
// asistencia general del día. El mismo archivo puede estar referenciado a
// la vez en "asistencia" (si fue la primera llegada o la última salida del
// día) y en la tabla de la tienda o el evento -- se limpia en todas donde
// aparezca. Es IRREVERSIBLE: una vez borrado de Azure no se puede
// recuperar, por eso existe obtenerResumenDepuracionFotos para ver antes
// cuántas fotos se van a borrar.
// ---------------------------------------------------------------------

const LOTE_DEPURACION_FOTOS = 200; // tope por click, para no toparse con el timeout de la función

type TablaConFoto = "asistencia" | "rutas_activas" | "rutas_diarias" | "asistencia_eventos";
type FilaConFoto = { tabla: TablaConFoto; id: string; columna: "foto_ingreso_blob" | "foto_llegada_blob" | "foto_salida_blob"; blob: string };

async function listarFotosAntesDe(
  supabase: ReturnType<typeof supabaseServer>,
  hasta: string
): Promise<FilaConFoto[]> {
  const [asis, activas, diarias, eventos] = await Promise.all([
    supabase.from("asistencia").select("id, fecha, foto_ingreso_blob, foto_salida_blob").lt("fecha", hasta),
    supabase
      .from("rutas_activas")
      .select("id, fecha_planificada, foto_llegada_blob, foto_salida_blob")
      .lt("fecha_planificada", hasta),
    supabase.from("rutas_diarias").select("id, fecha, foto_llegada_blob, foto_salida_blob").lt("fecha", hasta),
    supabase.from("asistencia_eventos").select("id, fecha, foto_llegada_blob, foto_salida_blob").lt("fecha", hasta),
  ]);

  const filas: FilaConFoto[] = [];
  (asis.data ?? []).forEach((r: any) => {
    if (r.foto_ingreso_blob) filas.push({ tabla: "asistencia", id: r.id, columna: "foto_ingreso_blob", blob: r.foto_ingreso_blob });
    if (r.foto_salida_blob) filas.push({ tabla: "asistencia", id: r.id, columna: "foto_salida_blob", blob: r.foto_salida_blob });
  });
  (activas.data ?? []).forEach((r: any) => {
    if (r.foto_llegada_blob) filas.push({ tabla: "rutas_activas", id: r.id, columna: "foto_llegada_blob", blob: r.foto_llegada_blob });
    if (r.foto_salida_blob) filas.push({ tabla: "rutas_activas", id: r.id, columna: "foto_salida_blob", blob: r.foto_salida_blob });
  });
  (diarias.data ?? []).forEach((r: any) => {
    if (r.foto_llegada_blob) filas.push({ tabla: "rutas_diarias", id: r.id, columna: "foto_llegada_blob", blob: r.foto_llegada_blob });
    if (r.foto_salida_blob) filas.push({ tabla: "rutas_diarias", id: r.id, columna: "foto_salida_blob", blob: r.foto_salida_blob });
  });
  (eventos.data ?? []).forEach((r: any) => {
    if (r.foto_llegada_blob) filas.push({ tabla: "asistencia_eventos", id: r.id, columna: "foto_llegada_blob", blob: r.foto_llegada_blob });
    if (r.foto_salida_blob) filas.push({ tabla: "asistencia_eventos", id: r.id, columna: "foto_salida_blob", blob: r.foto_salida_blob });
  });

  return filas;
}

export type ResumenDepuracionFotos = { totalFotos: number };

export async function obtenerResumenDepuracionFotos(hasta: string): Promise<ResumenDepuracionFotos> {
  await exigirAccesoRegistro();
  if (!hasta) return { totalFotos: 0 };
  const supabase = supabaseServer();
  const filas = await listarFotosAntesDe(supabase, hasta);
  return { totalFotos: new Set(filas.map((f) => f.blob)).size };
}

export type ResultadoDepuracionFotos = ResultadoRegistro & { borradas?: number; pendientes?: number };

export async function depurarFotosMarcacion(hasta: string, motivo?: string): Promise<ResultadoDepuracionFotos> {
  const sesion = await exigirAccesoRegistro();
  if (!hasta) return { exito: false, mensaje: "Indica la fecha de corte." };

  const supabase = supabaseServer();
  const filas = await listarFotosAntesDe(supabase, hasta);

  const blobsUnicos = Array.from(new Set(filas.map((f) => f.blob)));
  const loteBlobs = blobsUnicos.slice(0, LOTE_DEPURACION_FOTOS);
  const loteSet = new Set(loteBlobs);

  // Se borra cada archivo de Azure -- si uno falla (ej. error de red
  // puntual), se sigue con el resto en vez de abortar todo el lote.
  let borradas = 0;
  for (const blob of loteBlobs) {
    try {
      await eliminarFotoMarcacion(blob);
      borradas++;
    } catch (error) {
      console.error(`No se pudo borrar la foto ${blob} de Azure:`, error);
    }
  }

  // Solo se limpia en la base de datos lo que realmente se intentó borrar
  // en este lote (loteSet), agrupado por tabla+columna para actualizar con
  // un solo UPDATE por grupo en vez de uno por fila.
  const porTablaColumna = new Map<string, string[]>();
  filas
    .filter((f) => loteSet.has(f.blob))
    .forEach((f) => {
      const clave = `${f.tabla}|${f.columna}`;
      const lista = porTablaColumna.get(clave) ?? [];
      lista.push(f.id);
      porTablaColumna.set(clave, lista);
    });

  for (const [clave, ids] of porTablaColumna.entries()) {
    const [tabla, columna] = clave.split("|") as [TablaConFoto, FilaConFoto["columna"]];
    await (supabase.from(tabla) as any).update({ [columna]: null }).in("id", ids);
  }

  const pendientes = blobsUnicos.length - loteBlobs.length;
  await registrarCambio(
    sesion,
    "Depuró fotos de marcación antiguas",
    `${borradas} foto(s) anteriores a ${hasta}${pendientes > 0 ? ` (quedan ${pendientes} pendientes)` : ""}`,
    motivo
  );

  return {
    exito: true,
    mensaje:
      pendientes > 0
        ? `Se borraron ${borradas} foto(s). Quedan ${pendientes} más — vuelve a tocar "Depurar" para seguir.`
        : `Se borraron ${borradas} foto(s).`,
    borradas,
    pendientes,
  };
}

export type AuditoriaCorregible = {
  id: string;
  supervisorNombre: string;
  tiendaNombre: string;
  fecha: string;
  porcentaje: number;
  clasificacion: string;
};

export async function obtenerAuditoriasParaCorregir(): Promise<AuditoriaCorregible[]> {
  await exigirAccesoRegistro();
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("auditorias")
    .select("id, fecha, supervisor_nombre, porcentaje, clasificacion, tiendas(nombre)")
    .order("fecha", { ascending: false });

  if (error) throw new Error("No se pudo cargar las auditorías.");

  return (data ?? []).map((a: any) => ({
    id: a.id,
    supervisorNombre: a.supervisor_nombre,
    tiendaNombre: a.tiendas?.nombre ?? "—",
    fecha: a.fecha,
    porcentaje: a.porcentaje,
    clasificacion: a.clasificacion,
  }));
}

export async function eliminarAuditoriaRegistro(id: string, motivo?: string): Promise<ResultadoRegistro> {
  const sesion = await exigirAccesoRegistro();
  const supabase = supabaseServer();

  const { data: antes } = await supabase
    .from("auditorias")
    .select("fecha, supervisor_nombre, porcentaje, clasificacion, tiendas(nombre)")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("auditorias").delete().eq("id", id);
  if (error) return { exito: false, mensaje: "No se pudo eliminar la auditoría." };

  const tienda = (antes as any)?.tiendas?.nombre ?? "—";
  await registrarCambio(
    sesion,
    "Eliminó una auditoría",
    `${antes?.supervisor_nombre ?? "?"} — ${tienda} (${antes?.fecha ?? "?"}, ${antes?.porcentaje ?? "?"}% ${antes?.clasificacion ?? ""})`,
    motivo
  );

  return { exito: true };
}

export type ChecklistVisitaCorregible = {
  id: string;
  usuarioNombre: string;
  tiendaNombre: string;
  fecha: string;
  porcentaje: number | null;
  clasificacion: string | null;
};

export async function obtenerChecklistsVisitaParaCorregir(): Promise<ChecklistVisitaCorregible[]> {
  await exigirAccesoRegistro();
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("checklists_visita")
    .select("id, fecha, usuario_nombre, porcentaje, clasificacion, tiendas(nombre)")
    .order("fecha", { ascending: false });

  if (error) throw new Error("No se pudo cargar los checklists de visita.");

  return (data ?? []).map((c: any) => ({
    id: c.id,
    usuarioNombre: c.usuario_nombre,
    tiendaNombre: c.tiendas?.nombre ?? "—",
    fecha: c.fecha,
    porcentaje: c.porcentaje,
    clasificacion: c.clasificacion,
  }));
}

export async function eliminarChecklistVisitaRegistro(id: string, motivo?: string): Promise<ResultadoRegistro> {
  const sesion = await exigirAccesoRegistro();
  const supabase = supabaseServer();

  const { data: antes } = await supabase
    .from("checklists_visita")
    .select("fecha, usuario_nombre, porcentaje, clasificacion, tiendas(nombre)")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("checklists_visita").delete().eq("id", id);
  if (error) return { exito: false, mensaje: "No se pudo eliminar el checklist." };

  const tienda = (antes as any)?.tiendas?.nombre ?? "—";
  await registrarCambio(
    sesion,
    "Eliminó un checklist de rutina de visita",
    `${antes?.usuario_nombre ?? "?"} — ${tienda} (${antes?.fecha ?? "?"}, ${antes?.porcentaje ?? "?"}% ${antes?.clasificacion ?? ""})`,
    motivo
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
  esProvincia: boolean;
};

export async function obtenerTiendasConUbicacion(): Promise<TiendaUbicacion[]> {
  await exigirAccesoRegistro();
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("tiendas")
    .select("id, nombre, direccion, lat, lon, es_provincia")
    .order("nombre");
  if (error) throw new Error("No se pudo cargar las tiendas.");

  return (data ?? []).map((t) => ({
    id: t.id,
    nombre: t.nombre,
    direccion: t.direccion,
    lat: t.lat === null ? null : Number(t.lat),
    lon: t.lon === null ? null : Number(t.lon),
    esProvincia: t.es_provincia,
  }));
}

// Tiendas fuera de Lima (Chiclayo, Arequipa, etc.): se viaja en avión y se
// hospeda cerca, así que la distancia real en auto no aplica — se marcan
// aparte para que el kilometraje las trate distinto (ver kilometros-actions.ts
// y el correo de "nueva ruta asignada" en coordinador/actions.ts).
export async function actualizarEsProvincia(id: string, valor: boolean): Promise<ResultadoRegistro> {
  const sesion = await exigirAccesoRegistro();

  const supabase = supabaseServer();
  const { data: tienda } = await supabase.from("tiendas").select("nombre").eq("id", id).maybeSingle();

  const { error } = await supabase.from("tiendas").update({ es_provincia: valor }).eq("id", id);
  if (error) return { exito: false, mensaje: "No se pudo guardar el cambio." };

  await registrarCambio(
    sesion,
    valor ? "Marcó una tienda como de provincia" : "Desmarcó una tienda como de provincia",
    tienda?.nombre ?? id
  );

  return { exito: true };
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

export async function actualizarNombreTienda(id: string, nombre: string): Promise<ResultadoRegistro> {
  const sesion = await exigirAccesoRegistro();

  const nombreLimpio = nombre.trim().toUpperCase();
  if (!nombreLimpio) {
    return { exito: false, mensaje: "El nombre de la tienda es obligatorio." };
  }

  const supabase = supabaseServer();

  const { data: antes } = await supabase.from("tiendas").select("nombre").eq("id", id).maybeSingle();

  const { data: enUso } = await supabase
    .from("tiendas")
    .select("id")
    .ilike("nombre", nombreLimpio)
    .neq("id", id)
    .maybeSingle();
  if (enUso) {
    return { exito: false, mensaje: "Ya existe otra tienda con ese nombre." };
  }

  const { error } = await supabase.from("tiendas").update({ nombre: nombreLimpio }).eq("id", id);
  if (error) return { exito: false, mensaje: "No se pudo renombrar la tienda." };

  await registrarCambio(sesion, "Renombró una tienda", `${antes?.nombre ?? id} → ${nombreLimpio}`);

  return { exito: true, mensaje: "Tienda renombrada correctamente." };
}

// Solo se puede eliminar una tienda que nunca se usó (sin reportes, rutas,
// auditorías ni checklists) — la base de datos lo garantiza con una llave
// foránea que bloquea el borrado (error 23503) en vez de arrastrar consigo
// historial real de visitas. Para una tienda que cerró pero sí tiene
// historial, la opción es no volver a asignarle rutas, no eliminarla.
export async function eliminarTienda(id: string): Promise<ResultadoRegistro> {
  const sesion = await exigirAccesoRegistro();
  const supabase = supabaseServer();

  const { data: tienda } = await supabase.from("tiendas").select("nombre").eq("id", id).maybeSingle();

  const { error } = await supabase.from("tiendas").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      return {
        exito: false,
        mensaje:
          "No se puede eliminar: esta tienda ya tiene reportes, rutas, auditorías o checklists registrados. Solo se pueden eliminar tiendas que nunca se usaron.",
      };
    }
    return { exito: false, mensaje: "No se pudo eliminar la tienda." };
  }

  await registrarCambio(sesion, "Eliminó una tienda", tienda?.nombre ?? id);

  return { exito: true, mensaje: "Tienda eliminada correctamente." };
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
// Horario de ingreso personalizado: para quienes tienen un turno diferido
// del resto de su rol (ver lib/puntualidad.ts) y por eso no sumaban puntos
// ni figuraban como puntuales aunque llegaran a tiempo con su propio horario.
// ---------------------------------------------------------------------

const ROLES_CON_PUNTUALIDAD = ["capacitador", "supervisor", "coordinador"];

export type UsuarioConHorario = {
  id: string;
  nombre: string;
  rol: string;
  horaLimiteIngreso: string | null;
  horarioPorDia: Record<string, string> | null;
  diasDescanso: string[];
};

export async function obtenerUsuariosConHorario(): Promise<UsuarioConHorario[]> {
  await exigirAccesoRegistro();
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("usuarios")
    .select("id, nombre, rol, hora_limite_ingreso, horario_por_dia, dias_descanso")
    .in("rol", ROLES_CON_PUNTUALIDAD)
    .eq("activo", true)
    .order("nombre");

  if (error) throw new Error("No se pudo cargar los usuarios.");

  return (data ?? []).map((u) => ({
    id: u.id,
    nombre: u.nombre,
    rol: u.rol,
    horaLimiteIngreso: u.hora_limite_ingreso,
    horarioPorDia: u.horario_por_dia as Record<string, string> | null,
    diasDescanso: u.dias_descanso ?? [],
  }));
}

// Horario mixto: distinta hora límite según el día de la semana (ej. alguien
// que entra a las 12pm miércoles/jueves pero a la 1pm el viernes). Tiene
// prioridad sobre la hora límite plana de arriba para el día que especifique
// — ver resolverHoraLimite en lib/puntualidad.ts.
export async function actualizarHorarioPorDia(
  usuarioId: string,
  horarioPorDia: Record<string, string> | null
): Promise<ResultadoRegistro> {
  const sesion = await exigirAccesoRegistro();
  const supabase = supabaseServer();

  const { data: usuario } = await supabase
    .from("usuarios")
    .select("nombre")
    .eq("id", usuarioId)
    .maybeSingle();

  const { error } = await supabase
    .from("usuarios")
    .update({ horario_por_dia: horarioPorDia })
    .eq("id", usuarioId);

  if (error) return { exito: false, mensaje: "No se pudo actualizar el horario mixto." };

  const detalle =
    horarioPorDia && Object.keys(horarioPorDia).length > 0
      ? Object.entries(horarioPorDia)
          .map(([dia, hora]) => `${dia} ${hora}`)
          .join(", ")
      : null;

  await registrarCambio(
    sesion,
    detalle ? "Configuró un horario mixto por día" : "Quitó el horario mixto por día",
    `${usuario?.nombre ?? usuarioId}${detalle ? ` — ${detalle}` : ""}`
  );

  return { exito: true };
}

export async function actualizarHoraLimiteIngreso(
  usuarioId: string,
  horaLimite: string | null
): Promise<ResultadoRegistro> {
  const sesion = await exigirAccesoRegistro();
  const supabase = supabaseServer();

  const { data: usuario } = await supabase
    .from("usuarios")
    .select("nombre")
    .eq("id", usuarioId)
    .maybeSingle();

  const { error } = await supabase
    .from("usuarios")
    .update({ hora_limite_ingreso: horaLimite })
    .eq("id", usuarioId);

  if (error) return { exito: false, mensaje: "No se pudo actualizar el horario." };

  await registrarCambio(
    sesion,
    horaLimite ? "Configuró un horario de ingreso personalizado" : "Quitó el horario de ingreso personalizado",
    `${usuario?.nombre ?? usuarioId}${horaLimite ? ` — límite ${horaLimite}` : ""}`
  );

  return { exito: true };
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
    // created_at es timestamptz: sin la zona explícita, Postgres interpretaba
    // estos límites como UTC y se perdían los cambios hechos entre las 19:00
    // y la medianoche hora Perú del último día del rango.
    .gte("created_at", desde + "T00:00:00-05:00")
    .lte("created_at", hasta + "T23:59:59-05:00")
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
