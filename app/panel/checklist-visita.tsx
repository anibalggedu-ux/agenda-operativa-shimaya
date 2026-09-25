"use client";

import { useEffect, useState } from "react";
import { ClipboardList, Check, FileDown } from "lucide-react";
import {
  obtenerPlantillaChecklistVisita,
  guardarChecklistVisita,
  type SeccionChecklist,
  type ItemChecklist,
  type RespuestasChecklist,
  type ClasificacionChecklist,
} from "./checklist-visita-actions";
import { obtenerTodasLasTiendas, type TiendaBasicaBitacora } from "./supervisor/actions";
import { generarPdfChecklistVisita, type SeccionChecklistVisitaPdf } from "@/lib/generar-pdf";
import { hoyPeru } from "@/lib/fechas";
import { textoPuntajesArea, type PuntajesArea } from "@/lib/checklist-puntaje";
import {
  AvisoFotosPendientes,
  fotosPendientesParaPdf,
  SelectorFotosEvidencia,
  subirFotosEvidencia,
  type FotoPendiente,
} from "./fotos-evidencia";

const clasesInput =
  "w-full p-2.5 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro";

function claseColorClasificacion(clasificacion: ClasificacionChecklist | null): string {
  switch (clasificacion) {
    case "Excelente":
      return "text-emerald-400";
    case "Bueno":
      return "text-sky-400";
    case "Requiere mejora":
      return "text-amber-400";
    default:
      return "text-marca-rojoclaro";
  }
}

function BotonOpcion({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition border ${
        activo
          ? "bg-marca-rojo border-marca-rojo text-marca-textofuerte"
          : "bg-marca-superficie2 border-marca-borde text-marca-tenue hover:border-marca-rojo/40"
      }`}
    >
      {children}
    </button>
  );
}

function CampoItem({
  item,
  valor,
  onChange,
}: {
  item: ItemChecklist;
  valor: string | number | null;
  onChange: (valor: string | number | null) => void;
}) {
  return (
    <div>
      <label className="block text-marca-tenue text-[11px] font-bold mb-1.5">{item.etiqueta}</label>
      {item.tipo === "escala_5" && (
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <BotonOpcion key={n} activo={valor === n} onClick={() => onChange(n)}>
              {n}
            </BotonOpcion>
          ))}
        </div>
      )}
      {item.tipo === "si_no" && (
        <div className="flex gap-1.5">
          <BotonOpcion activo={valor === "true"} onClick={() => onChange("true")}>
            Sí
          </BotonOpcion>
          <BotonOpcion activo={valor === "false"} onClick={() => onChange("false")}>
            No
          </BotonOpcion>
        </div>
      )}
      {item.tipo === "opciones" && (
        <div className="flex flex-wrap gap-1.5">
          {(item.opciones ?? []).map((op) => (
            <BotonOpcion key={op} activo={valor === op} onClick={() => onChange(op)}>
              {op}
            </BotonOpcion>
          ))}
        </div>
      )}
      {item.tipo === "numero" && (
        <input
          type="number"
          value={valor ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          className={clasesInput}
        />
      )}
      {item.tipo === "texto" && (
        <textarea
          value={(valor as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className={clasesInput}
        />
      )}
    </div>
  );
}

function SeccionForm({
  seccion,
  respuestas,
  onCambiar,
}: {
  seccion: SeccionChecklist;
  respuestas: RespuestasChecklist;
  onCambiar: (seccionClave: string, itemClave: string, valor: string | number | null) => void;
}) {
  const [abierta, setAbierta] = useState(false);
  return (
    <div className="bg-marca-fondo border border-marca-borde rounded-[3px] overflow-hidden">
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-marca-superficie2 transition"
      >
        <span className="text-marca-textofuerte font-bold text-sm">{seccion.titulo}</span>
        <span className={`text-marca-tenue text-[10px] transition-transform ${abierta ? "rotate-180" : ""}`}>▾</span>
      </button>
      {abierta && (
        <div className="px-3 pb-3.5 pt-1 border-t border-marca-borde space-y-3">
          {seccion.items.map((item) => (
            <CampoItem
              key={item.clave}
              item={item}
              valor={respuestas[seccion.clave]?.[item.clave] ?? null}
              onChange={(valor) => onCambiar(seccion.clave, item.clave, valor)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ChecklistVisita({ nombreUsuario, rol }: { nombreUsuario: string; rol: string }) {
  const [secciones, setSecciones] = useState<SeccionChecklist[]>([]);
  const [tiendas, setTiendas] = useState<TiendaBasicaBitacora[]>([]);
  const [cargando, setCargando] = useState(true);
  const [tiendaId, setTiendaId] = useState("");
  const [fecha, setFecha] = useState(hoyPeru());
  const [respuestas, setRespuestas] = useState<RespuestasChecklist>({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [fotos, setFotos] = useState<FotoPendiente[]>([]);
  const [registroId, setRegistroId] = useState<string | null>(null);
  const [subiendoFotos, setSubiendoFotos] = useState(false);
  const [fotosFallidas, setFotosFallidas] = useState(0);
  const [resultado, setResultado] = useState<{
    porcentaje: number | null;
    clasificacion: ClasificacionChecklist | null;
    areas: PuntajesArea | null;
  } | null>(null);

  useEffect(() => {
    Promise.all([obtenerPlantillaChecklistVisita(), obtenerTodasLasTiendas()])
      .then(([s, t]) => {
        setSecciones(s);
        setTiendas(t);
      })
      .catch((e) => setError(e.message || "No se pudo cargar el checklist."))
      .finally(() => setCargando(false));
  }, []);

  function handleCambiar(seccionClave: string, itemClave: string, valor: string | number | null) {
    setRespuestas((prev) => ({
      ...prev,
      [seccionClave]: { ...prev[seccionClave], [itemClave]: valor },
    }));
  }

  function handleNuevo() {
    setRespuestas({});
    setFotos([]);
    setRegistroId(null);
    setFotosFallidas(0);
    setGuardado(false);
    setResultado(null);
    setError(null);
  }

  async function handleGuardar() {
    if (!tiendaId) {
      setError("Selecciona la tienda.");
      return;
    }
    setGuardando(true);
    setError(null);
    const resp = await guardarChecklistVisita(tiendaId, fecha, respuestas);
    setGuardando(false);
    if (resp.exito) {
      setGuardado(true);
      setResultado({
        porcentaje: resp.porcentaje ?? null,
        clasificacion: resp.clasificacion ?? null,
        areas: resp.areas ?? null,
      });
      if (resp.id && fotos.length > 0) {
        setRegistroId(resp.id);
        await subirFotos(resp.id);
      }
    } else {
      setError(resp.mensaje || "No se pudo guardar el checklist.");
    }
  }

  async function subirFotos(id: string) {
    setSubiendoFotos(true);
    const fallidas = await subirFotosEvidencia("checklist", id, fotos, setFotos);
    setFotosFallidas(fallidas);
    setSubiendoFotos(false);
  }

  async function handleDescargarPdf() {
    const tienda = tiendas.find((t) => t.id === tiendaId);
    const seccionesPdf: SeccionChecklistVisitaPdf[] = secciones.map((s) => ({
      titulo: s.titulo,
      items: s.items.map((it) => ({
        etiqueta: it.etiqueta,
        tipo: it.tipo,
        valor: respuestas[s.clave]?.[it.clave] ?? null,
      })),
    }));
    await generarPdfChecklistVisita({
      tiendaNombre: tienda?.nombre ?? "—",
      fecha,
      usuarioNombre: nombreUsuario,
      rol,
      secciones: seccionesPdf,
      porcentaje: resultado?.porcentaje ?? null,
      clasificacion: resultado?.clasificacion ?? null,
      areas: resultado?.areas ?? null,
      fotos: fotosPendientesParaPdf(fotos),
    });
  }

  if (cargando) return <p className="text-marca-tenue text-sm animate-pulse">Cargando checklist...</p>;

  return (
    <div className="bg-marca-superficie border border-marca-rojo/25 rounded-[3px] p-5 space-y-4">
      <div>
        <h3 className="flex items-center gap-1.5 text-xs font-black tracking-widest text-marca-tenue">
          <ClipboardList className="w-3.5 h-3.5 text-marca-rojoclaro" /> CHECKLIST DE RUTINA DE VISITA
        </h3>
        <p className="text-marca-tenue text-[11px] mt-1">
          Opcional — aparte de tu reporte normal. Se puede descargar en PDF para dejárselo al
          encargado de la tienda, y se ve en Central Analítica.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">Tienda</label>
          <select
            value={tiendaId}
            onChange={(e) => setTiendaId(e.target.value)}
            disabled={guardado}
            className={clasesInput}
          >
            <option value="">Selecciona...</option>
            {tiendas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">Fecha</label>
          <input
            type="date"
            value={fecha}
            max={hoyPeru()}
            disabled={guardado}
            onChange={(e) => setFecha(e.target.value)}
            className={clasesInput}
          />
        </div>
      </div>

      {secciones.length === 0 ? (
        <p className="text-marca-tenue text-sm italic">
          Todavía no hay preguntas configuradas — se agregan desde Registro.
        </p>
      ) : (
        <fieldset disabled={guardado} className="space-y-2">
          {secciones.map((s) => (
            <SeccionForm key={s.clave} seccion={s} respuestas={respuestas} onCambiar={handleCambiar} />
          ))}
        </fieldset>
      )}

      {secciones.length > 0 && (
        <SelectorFotosEvidencia fotos={fotos} onCambiar={setFotos} bloqueado={guardado || guardando} />
      )}

      {error && <p className="text-marca-rojoclaro text-xs font-bold">{error}</p>}

      {!guardado ? (
        <button
          type="button"
          onClick={handleGuardar}
          disabled={guardando || secciones.length === 0}
          className="w-full bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 text-marca-textofuerte font-black py-3 rounded-[3px] text-xs tracking-widest uppercase transition"
        >
          {guardando ? "Guardando..." : "Guardar checklist"}
        </button>
      ) : (
        <div className="space-y-2">
          <p className="flex items-center justify-center gap-1.5 text-emerald-400 text-xs font-bold text-center">
            <Check className="w-3.5 h-3.5" /> Checklist guardado — ya se puede ver en Central Analítica.
          </p>
          {subiendoFotos && (
            <p className="text-marca-tenue text-xs text-center animate-pulse">
              Subiendo fotos ({fotos.filter((f) => f.estado === "subida").length} de {fotos.length})... no cierres la app.
            </p>
          )}
          {!subiendoFotos && registroId && (
            <AvisoFotosPendientes
              fallidas={fotosFallidas}
              reintentando={subiendoFotos}
              onReintentar={() => subirFotos(registroId)}
            />
          )}
          {resultado?.porcentaje !== null && resultado?.porcentaje !== undefined && (
            <p className={`text-center font-display text-2xl font-bold ${claseColorClasificacion(resultado.clasificacion)}`}>
              {resultado.porcentaje}%{" "}
              <span className="text-sm font-bold">({resultado.clasificacion})</span>
            </p>
          )}
          {textoPuntajesArea(resultado?.areas) && (
            <p className="text-center text-marca-tenue text-xs font-bold">{textoPuntajesArea(resultado?.areas)}</p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDescargarPdf}
              className="flex-1 flex items-center justify-center gap-1.5 bg-marca-rojo hover:bg-marca-rojoclaro text-marca-textofuerte font-black py-2.5 rounded-[3px] text-[11px] tracking-widest uppercase transition"
            >
              <FileDown className="w-3.5 h-3.5" /> Descargar PDF
            </button>
            <button
              type="button"
              onClick={handleNuevo}
              disabled={subiendoFotos}
              className="flex-1 disabled:opacity-50 border border-marca-borde text-marca-tenue hover:text-marca-texto font-black py-2.5 rounded-[3px] text-[11px] tracking-widest uppercase transition"
            >
              + Nuevo checklist
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
