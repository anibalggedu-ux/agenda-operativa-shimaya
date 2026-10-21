"use client";

import { useCallback, useEffect, useState } from "react";
import { WifiOff, RefreshCw, ImageOff } from "lucide-react";
import {
  marcarLlegadaTienda,
  marcarSalidaTienda,
  enviarReporte,
  responderObservacionTiendaFija,
  marcarObservacionLeida,
} from "./supervisor/actions";
import { marcarLlegadaEvento, marcarSalidaEvento } from "./anuncios-actions";
import { marcarSalidaBreak, marcarEntradaBreak } from "./break-actions";
import { guardarChecklistVisita } from "./checklist-visita-actions";
import { subirFotoEvidencia } from "./evidencias-actions";
import { crearAuditoria } from "./auditorias/actions";
import { obtenerUbicacionActual } from "@/lib/geolocalizacion";
import {
  obtenerMarcacionesPendientes,
  quitarMarcacionPendiente,
  suscribirseACambiosDeCola,
  obtenerTodasLasFotosPendientes,
  borrarFotoPendientePorClave,
  suscribirseACambiosDeFotosPendientes,
  type MarcacionPendiente,
  type FotoPendienteTienda,
} from "@/lib/cola-marcaciones";
import {
  obtenerChecklistsPendientes,
  quitarChecklistPendiente,
  suscribirseACambiosDeColaChecklists,
  type ChecklistPendiente,
} from "@/lib/cola-checklists";
import {
  obtenerEvidenciasPendientes,
  quitarEvidenciaPendiente,
  suscribirseACambiosDeColaEvidencias,
  type FotoEvidenciaPendiente,
} from "@/lib/cola-evidencias";
import {
  obtenerAuditoriasPendientes,
  quitarAuditoriaPendiente,
  suscribirseACambiosDeColaAuditorias,
  construirFormData,
  type AuditoriaPendiente,
} from "@/lib/cola-auditorias";
import {
  obtenerReportesPendientes,
  quitarReportePendiente,
  suscribirseACambiosDeColaReportes,
  type ReportePendiente,
} from "@/lib/cola-reportes";
import {
  obtenerObservacionesPendientes,
  quitarObservacionPendiente,
  suscribirseACambiosDeColaObservaciones,
  type ObservacionPendiente,
} from "@/lib/cola-observaciones";

async function enviarPendiente(item: MarcacionPendiente): Promise<{ exito: boolean }> {
  switch (item.accion) {
    case "llegada-tienda":
      return marcarLlegadaTienda(
        item.rutaActivaId ?? null,
        item.reporteId ?? null,
        item.lat!,
        item.lng!,
        item.foto,
        item.horaCapturadaMs,
        item.justificativoTardanza
      );
    case "salida-tienda":
      return marcarSalidaTienda(
        item.rutaActivaId ?? null,
        item.reporteId ?? null,
        item.lat!,
        item.lng!,
        item.foto,
        item.horaCapturadaMs,
        item.fechaAsistenciaElegida
      );
    case "llegada-evento":
      return marcarLlegadaEvento(item.comunicadoId!, item.lat!, item.lng!, item.foto, item.horaCapturadaMs);
    case "salida-evento":
      return marcarSalidaEvento(item.comunicadoId!, item.lat!, item.lng!, item.foto, item.horaCapturadaMs);
    case "salida-break":
      return marcarSalidaBreak(item.foto, item.horaCapturadaMs);
    case "entrada-break":
      return marcarEntradaBreak(item.breakId!, item.foto, item.horaCapturadaMs);
  }
}

async function enviarChecklistPendiente(item: ChecklistPendiente): Promise<{ exito: boolean }> {
  const resultado = await guardarChecklistVisita(item.tiendaId, item.fecha, item.respuestas);
  return { exito: resultado.exito };
}

async function enviarEvidenciaPendiente(item: FotoEvidenciaPendiente): Promise<{ exito: boolean }> {
  const resultado = await subirFotoEvidencia(item.tipo, item.registroId, item.dataUrl, item.pie, item.miniDataUrl);
  return { exito: resultado.exito };
}

async function enviarAuditoriaPendiente(item: AuditoriaPendiente): Promise<{ exito: boolean }> {
  const resultado = await crearAuditoria({ exito: false }, construirFormData(item.datos));
  return { exito: resultado.exito };
}

async function enviarReportePendiente(item: ReportePendiente): Promise<{ exito: boolean }> {
  const formData = new FormData();
  formData.set("rutaActivaId", item.rutaActivaId);
  formData.set("tiendaId", item.tiendaId);
  formData.set("observacion", item.observacion);
  formData.set("actividad", item.actividad);
  const resultado = await enviarReporte({ exito: false }, formData);
  return { exito: resultado.exito };
}

async function enviarObservacionPendiente(item: ObservacionPendiente): Promise<{ exito: boolean }> {
  if (item.tipo === "leido") {
    const resultado = await marcarObservacionLeida(item.reporteId);
    return { exito: resultado.exito };
  }
  const formData = new FormData();
  formData.set("reporteId", item.reporteId);
  formData.set("respuesta", item.respuesta ?? "");
  const resultado = await responderObservacionTiendaFija({ exito: false }, formData);
  return { exito: resultado.exito };
}

// Reintento genérico de una foto que quedó en espera de reintento MANUAL
// (GPS falló, o el servidor devolvió un error que no es de conexión) --
// reconstruye la misma llamada que haría la tarjeta de origen (tienda,
// evento o break), sin depender de que esa tarjeta siga montada. Pide GPS
// de nuevo porque, salvo para break, el motivo más común de que haya
// quedado acá es justamente que el GPS falló la primera vez.
async function reintentarFotoPendiente(dato: FotoPendienteTienda): Promise<{ exito: boolean; mensaje?: string }> {
  if (dato.origen === "break") {
    return dato.tipo === "entrada"
      ? marcarEntradaBreak(dato.breakId!, dato.foto, dato.horaCapturadaMs)
      : marcarSalidaBreak(dato.foto, dato.horaCapturadaMs);
  }
  const coords = await obtenerUbicacionActual();
  if (dato.origen === "evento") {
    return dato.tipo === "llegada"
      ? marcarLlegadaEvento(dato.comunicadoId!, coords.lat, coords.lng, dato.foto, dato.horaCapturadaMs)
      : marcarSalidaEvento(dato.comunicadoId!, coords.lat, coords.lng, dato.foto, dato.horaCapturadaMs);
  }
  return dato.tipo === "llegada"
    ? marcarLlegadaTienda(dato.rutaActivaId ?? null, dato.reporteId ?? null, coords.lat, coords.lng, dato.foto, dato.horaCapturadaMs)
    : marcarSalidaTienda(dato.rutaActivaId ?? null, dato.reporteId ?? null, coords.lat, coords.lng, dato.foto, dato.horaCapturadaMs);
}

// Vive montado una sola vez en PanelShell (todos los portales) -- reenvía
// solas cualquier marcación de ingreso/salida y cualquier checklist de
// visita que hayan quedado pendientes por falta de señal (típico en los
// estacionamientos subterráneos de los centros comerciales, o en tiendas
// con poca cobertura), apenas el celular recupera la conexión. La
// marcación usa la hora que el propio celular capturó al momento del
// intento, no la hora en que por fin logra sincronizar -- ver
// lib/cola-marcaciones.ts y lib/cola-checklists.ts.
export default function SincronizadorOffline() {
  const [pendientes, setPendientes] = useState<MarcacionPendiente[]>([]);
  const [checklistsPendientes, setChecklistsPendientes] = useState<ChecklistPendiente[]>([]);
  const [evidenciasPendientes, setEvidenciasPendientes] = useState<FotoEvidenciaPendiente[]>([]);
  const [auditoriasPendientes, setAuditoriasPendientes] = useState<AuditoriaPendiente[]>([]);
  const [reportesPendientes, setReportesPendientes] = useState<ReportePendiente[]>([]);
  const [observacionesPendientes, setObservacionesPendientes] = useState<ObservacionPendiente[]>([]);
  const [fotosPendientes, setFotosPendientes] = useState<{ clave: string; dato: FotoPendienteTienda }[]>([]);
  const [sincronizando, setSincronizando] = useState(false);
  const [reintentandoClave, setReintentandoClave] = useState<string | null>(null);

  const actualizar = useCallback(() => {
    setPendientes(obtenerMarcacionesPendientes());
    setChecklistsPendientes(obtenerChecklistsPendientes());
    setEvidenciasPendientes(obtenerEvidenciasPendientes());
    setAuditoriasPendientes(obtenerAuditoriasPendientes());
    setReportesPendientes(obtenerReportesPendientes());
    setObservacionesPendientes(obtenerObservacionesPendientes());
    setFotosPendientes(obtenerTodasLasFotosPendientes());
  }, []);

  // A diferencia de la cola de arriba, estas fotos NO se reintentan solas --
  // puede ser un rechazo real del servidor, no solo falta de señal -- pero sí
  // tienen que quedar siempre visibles, sin importar en qué tienda/evento/
  // pantalla esté la persona ahora mismo (ver lib/cola-marcaciones.ts, caso
  // Elizabeth Vera).
  async function reintentarFoto(clave: string, dato: FotoPendienteTienda) {
    setReintentandoClave(clave);
    try {
      const resultado = await reintentarFotoPendiente(dato);
      if (resultado?.exito) {
        borrarFotoPendientePorClave(clave);
        actualizar();
      }
    } catch {
      // Sigue sin poder enviarse -- se deja tal cual para otro intento.
    } finally {
      setReintentandoClave(null);
    }
  }

  const sincronizar = useCallback(async () => {
    const lista = obtenerMarcacionesPendientes();
    const listaChecklists = obtenerChecklistsPendientes();
    const listaEvidencias = obtenerEvidenciasPendientes();
    const listaAuditorias = obtenerAuditoriasPendientes();
    const listaReportes = obtenerReportesPendientes();
    const listaObservaciones = obtenerObservacionesPendientes();
    if (
      lista.length === 0 &&
      listaChecklists.length === 0 &&
      listaEvidencias.length === 0 &&
      listaAuditorias.length === 0 &&
      listaReportes.length === 0 &&
      listaObservaciones.length === 0
    )
      return;
    setSincronizando(true);
    for (const item of lista) {
      try {
        const resultado = await enviarPendiente(item);
        if (resultado?.exito) {
          quitarMarcacionPendiente(item.id);
        }
      } catch {
        // Sigue sin señal -- se deja en la cola para el próximo intento.
        break;
      }
    }
    for (const item of listaChecklists) {
      try {
        const resultado = await enviarChecklistPendiente(item);
        if (resultado?.exito) {
          quitarChecklistPendiente(item.id);
        }
      } catch {
        break;
      }
    }
    for (const item of listaEvidencias) {
      try {
        const resultado = await enviarEvidenciaPendiente(item);
        if (resultado?.exito) {
          quitarEvidenciaPendiente(item.id);
        }
      } catch {
        break;
      }
    }
    for (const item of listaAuditorias) {
      try {
        const resultado = await enviarAuditoriaPendiente(item);
        if (resultado?.exito) {
          quitarAuditoriaPendiente(item.id);
        }
      } catch {
        break;
      }
    }
    for (const item of listaReportes) {
      try {
        const resultado = await enviarReportePendiente(item);
        if (resultado?.exito) {
          quitarReportePendiente(item.id);
        }
      } catch {
        break;
      }
    }
    for (const item of listaObservaciones) {
      try {
        const resultado = await enviarObservacionPendiente(item);
        if (resultado?.exito) {
          quitarObservacionPendiente(item.id);
        }
      } catch {
        break;
      }
    }
    setSincronizando(false);
    actualizar();
  }, [actualizar]);

  useEffect(() => {
    actualizar();
    const desuscribir = suscribirseACambiosDeCola(actualizar);
    const desuscribirChecklists = suscribirseACambiosDeColaChecklists(actualizar);
    const desuscribirEvidencias = suscribirseACambiosDeColaEvidencias(actualizar);
    const desuscribirAuditorias = suscribirseACambiosDeColaAuditorias(actualizar);
    const desuscribirReportes = suscribirseACambiosDeColaReportes(actualizar);
    const desuscribirObservaciones = suscribirseACambiosDeColaObservaciones(actualizar);
    const desuscribirFotos = suscribirseACambiosDeFotosPendientes(actualizar);
    window.addEventListener("online", sincronizar);
    // Reintento periódico además del evento "online" -- en varios celulares
    // (sobre todo iOS) ese evento no siempre dispara al recuperar señal.
    const intervalo = setInterval(sincronizar, 30000);
    sincronizar();
    return () => {
      desuscribir();
      desuscribirChecklists();
      desuscribirEvidencias();
      desuscribirAuditorias();
      desuscribirReportes();
      desuscribirObservaciones();
      desuscribirFotos();
      window.removeEventListener("online", sincronizar);
      clearInterval(intervalo);
    };
  }, [actualizar, sincronizar]);

  const total =
    pendientes.length +
    checklistsPendientes.length +
    evidenciasPendientes.length +
    auditoriasPendientes.length +
    reportesPendientes.length +
    observacionesPendientes.length +
    fotosPendientes.length;
  if (total === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-1.5">
      {fotosPendientes.length > 0 && (
        <div className="flex w-[min(92vw,22rem)] flex-col gap-1 rounded-[3px] border border-amber-500/50 bg-marca-superficie p-2 shadow-lg">
          {fotosPendientes.map(({ clave, dato }) => (
            <div key={clave} className="flex items-center gap-2">
              <ImageOff className="w-3.5 h-3.5 shrink-0 text-amber-400" />
              <p className="min-w-0 flex-1 truncate text-[11px] font-bold text-amber-300">{dato.etiqueta}</p>
              <button
                type="button"
                onClick={() => reintentarFoto(clave, dato)}
                disabled={reintentandoClave === clave}
                className="shrink-0 rounded-full bg-amber-500/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-amber-400 disabled:opacity-50"
              >
                {reintentandoClave === clave ? "Enviando..." : "Reintentar"}
              </button>
            </div>
          ))}
        </div>
      )}
      {(pendientes.length > 0 ||
        checklistsPendientes.length > 0 ||
        evidenciasPendientes.length > 0 ||
        auditoriasPendientes.length > 0 ||
        reportesPendientes.length > 0 ||
        observacionesPendientes.length > 0) && (
        <div className="flex items-center gap-2 rounded-full border border-amber-500/50 bg-marca-superficie py-1.5 pl-3 pr-1.5 shadow-lg">
          <WifiOff className="w-3.5 h-3.5 shrink-0 text-amber-400" />
          {(() => {
            const n =
              pendientes.length +
              checklistsPendientes.length +
              evidenciasPendientes.length +
              auditoriasPendientes.length +
              reportesPendientes.length +
              observacionesPendientes.length;
            return (
              <p className="text-[11px] font-bold text-amber-300">
                {n} pendiente{n === 1 ? "" : "s"} por enviar
              </p>
            );
          })()}
          <button
            type="button"
            onClick={sincronizar}
            disabled={sincronizando}
            aria-label="Reintentar ahora"
            className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/15 text-amber-400 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${sincronizando ? "animate-spin" : ""}`} />
          </button>
        </div>
      )}
    </div>
  );
}
