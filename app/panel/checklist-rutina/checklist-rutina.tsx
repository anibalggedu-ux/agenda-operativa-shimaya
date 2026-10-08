"use client";

import { useEffect, useState } from "react";
import { ClipboardList, FileDown, ListChecks, NotebookPen } from "lucide-react";
import ChecklistVisita from "../checklist-visita";
import {
  obtenerChecklistsDeTienda,
  obtenerDetalleChecklistVisita,
  marcarFaltaCorregida,
  type ChecklistVisitaResumen,
  type ChecklistVisitaDetalle,
  type SeccionChecklist,
  type FaltaChecklist,
} from "../checklist-visita-actions";
import { obtenerTiendasAsignadasHoy, type TiendaAsignadaHoy } from "../supervisor/actions";
import { formatearFechaLegible } from "@/lib/fechas";
import { puntajeItem, textoPuntajesArea } from "@/lib/checklist-puntaje";
import { generarPdfChecklistVisita, type SeccionChecklistVisitaPdf } from "@/lib/generar-pdf";
import { GaleriaEvidencias, fotosGuardadasParaPdf } from "../fotos-evidencia";

const clasesInput =
  "w-full p-2.5 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro";

function claseBadgeClasificacion(clasificacion: string | null): string {
  switch (clasificacion) {
    case "Excelente":
      return "bg-emerald-950/30 border-emerald-700/40 text-emerald-300";
    case "Bueno":
      return "bg-sky-950/30 border-sky-700/40 text-sky-300";
    case "Requiere mejora":
      return "bg-amber-950/30 border-amber-700/40 text-amber-300";
    case "Acción inmediata":
      return "bg-marca-rojo/15 border-marca-rojo/40 text-marca-rojoclaro";
    default:
      return "border-dashed border-marca-borde text-marca-tenue";
  }
}

function formatearValor(tipo: string, valor: any): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (tipo === "escala_5") return `${valor}/5`;
  if (tipo === "si_no") return valor === "true" || valor === true ? "Sí" : "No";
  return String(valor);
}

// A diferencia de ListaFaltas (de solo lectura, en el informe del PDF), acá
// cada falta se puede marcar como corregida sin tener que llenar otro
// checklist -- es una métrica aparte, independiente del puntaje.
function ListaFaltasEditable({
  checklistId,
  faltas,
  corregidas,
  onCambiar,
}: {
  checklistId: string;
  faltas: FaltaChecklist[];
  corregidas: Set<string>;
  onCambiar: (texto: string, corregido: boolean) => void;
}) {
  if (faltas.length === 0) return null;
  const pendientes = faltas.filter((f) => !corregidas.has(f.texto)).length;
  return (
    <div className="border border-marca-rojo/40 bg-marca-rojo/10 rounded-[3px] p-2.5">
      <p className="text-marca-rojoclaro text-[10px] font-black uppercase tracking-widest mb-1.5">
        Faltas encontradas (−{faltas.reduce((t, f) => t + f.descuento, 0)} puntos) · {pendientes} sin corregir
      </p>
      <ul className="space-y-1">
        {faltas.map((f, i) => {
          const corregido = corregidas.has(f.texto);
          return (
            <li key={i}>
              <label className="flex items-start gap-2 text-[11px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={corregido}
                  onChange={(e) => onCambiar(f.texto, e.target.checked)}
                  className="mt-0.5"
                />
                <span className={corregido ? "text-marca-tenue line-through" : "text-marca-texto"}>
                  {f.texto} <span className="text-marca-rojoclaro font-bold">(−{f.descuento})</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DetalleChecklistTienda({ id, onCerrar }: { id: string; onCerrar: () => void }) {
  const [detalle, setDetalle] = useState<ChecklistVisitaDetalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [generandoPdf, setGenerandoPdf] = useState(false);

  useEffect(() => {
    setCargando(true);
    obtenerDetalleChecklistVisita(id)
      .then(setDetalle)
      .finally(() => setCargando(false));
  }, [id]);

  async function handleCorregido(texto: string, corregido: boolean) {
    setDetalle((prev) =>
      prev ? { ...prev, faltasCorregidas: corregido ? [...prev.faltasCorregidas, texto] : prev.faltasCorregidas.filter((t) => t !== texto) } : prev
    );
    const resultado = await marcarFaltaCorregida(id, texto, corregido).catch(() => ({ exito: false }));
    if (!resultado.exito) {
      // Si falló, se revierte.
      setDetalle((prev) =>
        prev ? { ...prev, faltasCorregidas: corregido ? prev.faltasCorregidas.filter((t) => t !== texto) : [...prev.faltasCorregidas, texto] } : prev
      );
    }
  }

  async function handleDescargar() {
    if (!detalle || generandoPdf) return;
    setGenerandoPdf(true);
    try {
      const seccionesPdf: SeccionChecklistVisitaPdf[] = detalle.secciones.map((s) => ({
        titulo: s.titulo,
        items: s.items.map((it) => {
          const valor = detalle.respuestas[s.clave]?.[it.clave] ?? null;
          return { etiqueta: it.etiqueta, tipo: it.tipo, valor, puntaje: puntajeItem(it, valor) };
        }),
      }));
      await generarPdfChecklistVisita({
        tiendaNombre: detalle.tiendaNombre,
        fecha: detalle.fecha,
        usuarioNombre: detalle.usuarioNombre,
        rol: detalle.rol,
        secciones: seccionesPdf,
        porcentaje: detalle.porcentaje,
        clasificacion: detalle.clasificacion,
        areas: detalle.areas,
        faltas: detalle.faltas,
        fotos: await fotosGuardadasParaPdf(detalle.fotos),
      });
    } finally {
      setGenerandoPdf(false);
    }
  }

  return (
    <div className="bg-marca-fondo border border-marca-rojo/30 rounded-[3px] p-4 mt-2 space-y-3">
      {cargando || !detalle ? (
        <p className="text-marca-tenue text-sm animate-pulse">Cargando detalle...</p>
      ) : (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-marca-textofuerte font-bold text-sm">{detalle.tiendaNombre}</p>
              <p className="text-marca-tenue text-[11px]">
                {formatearFechaLegible(detalle.fecha)} · {detalle.usuarioNombre} ({detalle.rol})
              </p>
              {detalle.editadoPor && detalle.editadoEn && (
                <p className="text-amber-300 text-[10px] font-bold">
                  ✏️ Corregido por {detalle.editadoPor} el{" "}
                  {new Date(detalle.editadoEn).toLocaleString("es-PE", {
                    timeZone: "America/Lima",
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </p>
              )}
              <div className="mt-1.5">
                {detalle.porcentaje === null ? (
                  <span className="text-[11px] text-marca-tenue border border-dashed border-marca-borde px-2.5 py-1 rounded-full">
                    Sin puntaje
                  </span>
                ) : (
                  <span
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-full border whitespace-nowrap ${claseBadgeClasificacion(
                      detalle.clasificacion
                    )}`}
                  >
                    {detalle.porcentaje}% · {detalle.clasificacion}
                  </span>
                )}
              </div>
              {textoPuntajesArea(detalle.areas) && (
                <p className="text-marca-tenue text-[11px] font-bold mt-1">{textoPuntajesArea(detalle.areas)}</p>
              )}
              {detalle.faltas.length > 0 && (
                <div className="mt-2">
                  <ListaFaltasEditable
                    checklistId={detalle.id}
                    faltas={detalle.faltas}
                    corregidas={new Set(detalle.faltasCorregidas)}
                    onCambiar={handleCorregido}
                  />
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={handleDescargar}
                disabled={generandoPdf}
                className="text-marca-rojoclaro hover:text-marca-rojo disabled:opacity-50 text-[11px] font-bold uppercase flex items-center gap-1"
              >
                <FileDown className="w-3.5 h-3.5" /> {generandoPdf ? "Generando..." : "Descargar PDF"}
              </button>
              <button
                onClick={onCerrar}
                className="text-marca-tenue hover:text-marca-texto text-[11px] font-bold uppercase"
              >
                Cerrar
              </button>
            </div>
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {detalle.secciones.map((s) => {
              const respSeccion = detalle.respuestas[s.clave];
              const itemsConValor = s.items.filter(
                (it) => respSeccion?.[it.clave] !== undefined && respSeccion?.[it.clave] !== null && respSeccion?.[it.clave] !== ""
              );
              if (itemsConValor.length === 0) return null;
              return (
                <div key={s.clave}>
                  <p className="text-marca-rojoclaro text-[10.5px] font-black uppercase tracking-wide mb-1">{s.titulo}</p>
                  <div className="space-y-0.5">
                    {itemsConValor.map((it) => (
                      <p key={it.clave} className="text-[12px] flex justify-between gap-2">
                        <span className="text-marca-tenue">{it.etiqueta}</span>
                        <span className="text-marca-texto font-bold text-right">{formatearValor(it.tipo, respSeccion?.[it.clave])}</span>
                      </p>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <GaleriaEvidencias fotos={detalle.fotos} />
        </>
      )}
    </div>
  );
}

function HistorialPorTienda() {
  const [tiendas, setTiendas] = useState<TiendaAsignadaHoy[]>([]);
  const [tiendaId, setTiendaId] = useState("");
  const [cargandoTiendas, setCargandoTiendas] = useState(true);
  const [checklists, setChecklists] = useState<ChecklistVisitaResumen[]>([]);
  const [cargandoChecklists, setCargandoChecklists] = useState(false);
  const [abiertoId, setAbiertoId] = useState<string | null>(null);

  useEffect(() => {
    // Solo tiendas asignadas o autoasignadas hoy -- no toda la lista.
    obtenerTiendasAsignadasHoy()
      .then(setTiendas)
      .finally(() => setCargandoTiendas(false));
  }, []);

  useEffect(() => {
    if (!tiendaId) {
      setChecklists([]);
      return;
    }
    setCargandoChecklists(true);
    setAbiertoId(null);
    obtenerChecklistsDeTienda(tiendaId)
      .then(setChecklists)
      .finally(() => setCargandoChecklists(false));
  }, [tiendaId]);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">Tienda</label>
        <select
          value={tiendaId}
          onChange={(e) => setTiendaId(e.target.value)}
          disabled={cargandoTiendas}
          className={clasesInput}
        >
          <option value="">Selecciona una tienda...</option>
          {tiendas.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </select>
      </div>

      {!cargandoTiendas && tiendas.length === 0 && (
        <p className="text-marca-tenue text-sm italic">No tienes ninguna tienda asignada ni autoasignada para hoy.</p>
      )}

      {!tiendaId && tiendas.length > 0 && (
        <p className="text-marca-tenue text-sm italic">Elige una tienda para ver todos los checklists que se le hicieron.</p>
      )}

      {cargandoChecklists && <p className="text-marca-tenue text-sm animate-pulse">Cargando historial...</p>}

      {!cargandoChecklists && tiendaId && checklists.length === 0 && (
        <p className="text-marca-tenue text-sm italic">Esta tienda todavía no tiene checklists registrados.</p>
      )}

      {!cargandoChecklists && checklists.length > 0 && (
        <div className="space-y-2">
          {checklists.map((c) => (
            <div key={c.id}>
              <button
                type="button"
                onClick={() => setAbiertoId(abiertoId === c.id ? null : c.id)}
                className="w-full flex items-center justify-between gap-2 bg-marca-superficie border border-marca-borde rounded-[3px] px-3 py-2.5 text-left hover:border-marca-rojo/40 transition"
              >
                <span className="min-w-0">
                  <span className="text-marca-texto text-sm font-bold">{formatearFechaLegible(c.fecha)}</span>
                  <span className="text-marca-tenue text-[11px] ml-2">
                    {c.usuarioNombre} ({c.rol})
                  </span>
                </span>
                <span className="flex items-center gap-1.5 shrink-0">
                  {c.faltasTotal > 0 && (
                    <span
                      className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${
                        c.faltasCorregidas === c.faltasTotal
                          ? "bg-emerald-950/30 border-emerald-700/40 text-emerald-300"
                          : "bg-amber-950/30 border-amber-700/40 text-amber-300"
                      }`}
                      title="Faltas corregidas desde entonces"
                    >
                      ✓ {c.faltasCorregidas}/{c.faltasTotal} corregidas
                    </span>
                  )}
                  <span
                    className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${claseBadgeClasificacion(
                      c.clasificacion
                    )}`}
                  >
                    {c.porcentaje === null ? "Sin puntaje" : `${c.porcentaje}% · ${c.clasificacion}`}
                  </span>
                </span>
              </button>
              {abiertoId === c.id && <DetalleChecklistTienda id={c.id} onCerrar={() => setAbiertoId(null)} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ChecklistRutina({ nombreUsuario, rol }: { nombreUsuario: string; rol: string }) {
  const [vista, setVista] = useState<"hacer" | "historial">("hacer");

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setVista("hacer")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-[3px] text-[11px] font-black tracking-widest uppercase transition border ${
            vista === "hacer"
              ? "bg-marca-rojo border-marca-rojo text-marca-textofuerte"
              : "bg-marca-superficie2 border-marca-borde text-marca-tenue hover:border-marca-rojo/40"
          }`}
        >
          <NotebookPen className="w-3.5 h-3.5" /> Hacer checklist
        </button>
        <button
          type="button"
          onClick={() => setVista("historial")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-[3px] text-[11px] font-black tracking-widest uppercase transition border ${
            vista === "historial"
              ? "bg-marca-rojo border-marca-rojo text-marca-textofuerte"
              : "bg-marca-superficie2 border-marca-borde text-marca-tenue hover:border-marca-rojo/40"
          }`}
        >
          <ListChecks className="w-3.5 h-3.5" /> Ver / Imprimir por tienda
        </button>
      </div>

      {vista === "hacer" ? (
        <ChecklistVisita nombreUsuario={nombreUsuario} rol={rol} />
      ) : (
        <div className="bg-marca-superficie border border-marca-rojo/25 rounded-[3px] p-5">
          <h3 className="flex items-center gap-1.5 text-xs font-black tracking-widest text-marca-tenue mb-3">
            <ClipboardList className="w-3.5 h-3.5 text-marca-rojoclaro" /> HISTORIAL DE CHECKLISTS POR TIENDA
          </h3>
          <HistorialPorTienda />
        </div>
      )}
    </div>
  );
}
