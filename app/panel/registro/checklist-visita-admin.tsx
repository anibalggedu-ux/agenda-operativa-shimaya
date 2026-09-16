"use client";

import { useEffect, useState } from "react";
import { obtenerPlantillaChecklistVisita, type SeccionChecklist, type ItemChecklist, type TipoItemChecklist } from "../checklist-visita-actions";
import {
  actualizarItemChecklistPlantilla,
  agregarItemChecklistPlantilla,
  eliminarItemChecklistPlantilla,
} from "./checklist-visita-admin-actions";

const clasesInput =
  "w-full p-2.5 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro";

const ETIQUETAS_TIPO: Record<TipoItemChecklist, string> = {
  escala_5: "Escala 1 a 5",
  si_no: "Sí / No",
  opciones: "Opción múltiple",
  texto: "Texto libre",
  numero: "Número",
};

function FilaItemAdmin({
  seccionClave,
  item,
  onCambio,
}: {
  seccionClave: string;
  item: ItemChecklist;
  onCambio: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [etiqueta, setEtiqueta] = useState(item.etiqueta);
  const [opcionesTexto, setOpcionesTexto] = useState((item.opciones ?? []).join(", "));
  const [guardando, setGuardando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGuardar() {
    if (!etiqueta.trim()) return;
    setGuardando(true);
    setError(null);
    const opciones =
      item.tipo === "opciones"
        ? opcionesTexto.split(",").map((o) => o.trim()).filter(Boolean)
        : undefined;
    if (item.tipo === "opciones" && (!opciones || opciones.length < 2)) {
      setError("Necesita al menos 2 opciones separadas por coma.");
      setGuardando(false);
      return;
    }
    const resultado = await actualizarItemChecklistPlantilla(seccionClave, item.clave, {
      etiqueta: etiqueta.trim(),
      opciones,
    });
    setGuardando(false);
    if (resultado.exito) {
      setEditando(false);
      onCambio();
    } else {
      setError(resultado.mensaje || "No se pudo guardar.");
    }
  }

  async function handleEliminar() {
    if (!window.confirm(`¿Eliminar la pregunta "${item.etiqueta}"?`)) return;
    setEliminando(true);
    await eliminarItemChecklistPlantilla(seccionClave, item.clave);
    setEliminando(false);
    onCambio();
  }

  if (editando) {
    return (
      <div className="py-2 border-b border-marca-borde last:border-b-0 space-y-2">
        <input
          value={etiqueta}
          onChange={(e) => setEtiqueta(e.target.value)}
          className={clasesInput}
          placeholder="Etiqueta de la pregunta"
        />
        {item.tipo === "opciones" && (
          <input
            value={opcionesTexto}
            onChange={(e) => setOpcionesTexto(e.target.value)}
            className={clasesInput}
            placeholder="Opciones separadas por coma"
          />
        )}
        {error && <p className="text-marca-rojoclaro text-[11px] font-bold">{error}</p>}
        <div className="flex items-center gap-3">
          <button
            onClick={handleGuardar}
            disabled={guardando}
            className="text-emerald-400 text-[11px] font-bold uppercase"
          >
            {guardando ? "..." : "Guardar"}
          </button>
          <button
            onClick={() => {
              setEditando(false);
              setEtiqueta(item.etiqueta);
              setOpcionesTexto((item.opciones ?? []).join(", "));
              setError(null);
            }}
            className="text-marca-tenue text-[11px] font-bold uppercase"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b border-marca-borde last:border-b-0">
      <div className="min-w-0">
        <span className="text-marca-texto text-sm">{item.etiqueta}</span>
        <span className="text-marca-tenue text-[10px] uppercase ml-2">({ETIQUETAS_TIPO[item.tipo]})</span>
        {item.tipo === "opciones" && (
          <p className="text-marca-tenue text-[10.5px] mt-0.5 truncate">{(item.opciones ?? []).join(" · ")}</p>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={() => setEditando(true)}
          className="text-marca-tenue hover:text-marca-texto text-[11px] font-bold uppercase"
        >
          Editar
        </button>
        <button
          onClick={handleEliminar}
          disabled={eliminando}
          className="text-marca-rojoclaro hover:text-marca-rojo text-[11px] font-bold uppercase"
        >
          {eliminando ? "..." : "Eliminar"}
        </button>
      </div>
    </div>
  );
}

function FormularioNuevaPregunta({
  seccionClave,
  onAgregada,
}: {
  seccionClave: string;
  onAgregada: () => void;
}) {
  const [etiqueta, setEtiqueta] = useState("");
  const [tipo, setTipo] = useState<TipoItemChecklist>("opciones");
  const [opcionesTexto, setOpcionesTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  function generarClave(texto: string): string {
    return (
      texto
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "") || `pregunta_${Date.now()}`
    );
  }

  async function handleAgregar() {
    if (!etiqueta.trim()) {
      setMensaje("Escribe la etiqueta de la pregunta.");
      return;
    }
    const opciones =
      tipo === "opciones" ? opcionesTexto.split(",").map((o) => o.trim()).filter(Boolean) : undefined;
    if (tipo === "opciones" && (!opciones || opciones.length < 2)) {
      setMensaje("Necesita al menos 2 opciones separadas por coma.");
      return;
    }
    setGuardando(true);
    setMensaje(null);
    const resultado = await agregarItemChecklistPlantilla(seccionClave, {
      clave: generarClave(etiqueta),
      etiqueta: etiqueta.trim(),
      tipo,
      opciones,
    });
    setGuardando(false);
    if (resultado.exito) {
      setEtiqueta("");
      setOpcionesTexto("");
      onAgregada();
    } else {
      setMensaje(resultado.mensaje || "No se pudo agregar.");
    }
  }

  return (
    <div className="bg-marca-superficie2 border border-dashed border-marca-borde rounded-[3px] p-3 space-y-2 mt-2">
      <div className="flex flex-wrap gap-2">
        <input
          value={etiqueta}
          onChange={(e) => setEtiqueta(e.target.value)}
          placeholder="Etiqueta de la pregunta nueva"
          className={clasesInput + " flex-1 min-w-[160px]"}
        />
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoItemChecklist)}
          className={clasesInput + " w-auto"}
        >
          {(Object.keys(ETIQUETAS_TIPO) as TipoItemChecklist[]).map((t) => (
            <option key={t} value={t}>
              {ETIQUETAS_TIPO[t]}
            </option>
          ))}
        </select>
      </div>
      {tipo === "opciones" && (
        <input
          value={opcionesTexto}
          onChange={(e) => setOpcionesTexto(e.target.value)}
          placeholder="Opciones separadas por coma (ej. Bueno, Regular, Malo)"
          className={clasesInput}
        />
      )}
      <button
        type="button"
        onClick={handleAgregar}
        disabled={guardando}
        className="bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 text-marca-textofuerte font-black py-2 px-4 rounded-[3px] text-[11px] tracking-widest uppercase transition"
      >
        {guardando ? "Agregando..." : "+ Agregar pregunta"}
      </button>
      {mensaje && <p className="text-marca-rojoclaro text-[11px] font-bold">{mensaje}</p>}
    </div>
  );
}

function GrupoSeccionAdmin({
  seccion,
  onCambio,
}: {
  seccion: SeccionChecklist;
  onCambio: () => void;
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <div className="bg-marca-fondo border border-marca-borde rounded-[3px] overflow-hidden">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-marca-superficie2 transition"
      >
        <span className="text-marca-rojoclaro text-[11px] font-black uppercase tracking-wide">
          {seccion.titulo} ({seccion.items.length} preguntas)
        </span>
        <span className={`text-marca-tenue text-[10px] transition-transform ${abierto ? "rotate-180" : ""}`}>▾</span>
      </button>
      {abierto && (
        <div className="px-3 pb-3 border-t border-marca-borde">
          {seccion.items.map((it) => (
            <FilaItemAdmin key={it.clave} seccionClave={seccion.clave} item={it} onCambio={onCambio} />
          ))}
          <FormularioNuevaPregunta seccionClave={seccion.clave} onAgregada={onCambio} />
        </div>
      )}
    </div>
  );
}

export default function ChecklistVisitaAdmin() {
  const [secciones, setSecciones] = useState<SeccionChecklist[]>([]);
  const [cargando, setCargando] = useState(true);

  function cargar() {
    setCargando(true);
    obtenerPlantillaChecklistVisita()
      .then(setSecciones)
      .finally(() => setCargando(false));
  }

  useEffect(cargar, []);

  if (cargando) return <p className="text-marca-tenue text-sm animate-pulse">Cargando plantilla...</p>;

  return (
    <>
      <p className="text-marca-tenue text-[11px] mb-3">
        Puedes editar el texto de cada pregunta, sus opciones (si es de opción múltiple), y agregar o
        quitar preguntas dentro de cada sección. El tipo de pregunta (escala, sí/no, opción múltiple,
        texto, número) no se puede cambiar una vez creada — elimínala y agrega una nueva con el tipo
        correcto si hace falta.
      </p>
      <div className="space-y-2">
        {secciones.map((s) => (
          <GrupoSeccionAdmin key={s.clave} seccion={s} onCambio={cargar} />
        ))}
      </div>
    </>
  );
}
