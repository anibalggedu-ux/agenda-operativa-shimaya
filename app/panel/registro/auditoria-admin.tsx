"use client";

import { useEffect, useMemo, useState } from "react";
import {
  obtenerSupervisoresConAuditoria,
  actualizarAccesoAuditoria,
  obtenerPlantillaAuditoriaAdmin,
  agregarItemPlantilla,
  actualizarItemPlantilla,
  eliminarItemPlantilla,
  type SupervisorConAuditoria,
  type ItemPlantillaAuditoria,
} from "./actions";

const clasesInput =
  "w-full p-2.5 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro";

export function AccesoAuditoria() {
  const [supervisores, setSupervisores] = useState<SupervisorConAuditoria[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardandoId, setGuardandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function cargar() {
    setCargando(true);
    obtenerSupervisoresConAuditoria()
      .then(setSupervisores)
      .catch((e) => setError(e.message || "Error al cargar supervisores."))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, []);

  async function handleToggle(sup: SupervisorConAuditoria) {
    const nuevoValor = !sup.puedeAuditar;
    setGuardandoId(sup.id);
    setSupervisores((prev) =>
      prev.map((s) => (s.id === sup.id ? { ...s, puedeAuditar: nuevoValor } : s))
    );
    const resultado = await actualizarAccesoAuditoria(sup.id, nuevoValor);
    if (!resultado.exito) {
      setSupervisores((prev) =>
        prev.map((s) => (s.id === sup.id ? { ...s, puedeAuditar: !nuevoValor } : s))
      );
      setError(resultado.mensaje || "No se pudo actualizar.");
    }
    setGuardandoId(null);
  }

  if (cargando) return <p className="text-marca-tenue text-sm animate-pulse">Cargando supervisores...</p>;

  return (
    <>
      {error && <p className="text-marca-rojoclaro text-xs font-bold mb-2">{error}</p>}
      {supervisores.length === 0 ? (
        <p className="text-marca-tenue text-sm italic">No hay supervisores activos registrados.</p>
      ) : (
        <div className="space-y-1.5">
          {supervisores.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between bg-marca-fondo border border-marca-borde rounded-[3px] px-4 py-3"
            >
              <span className="text-marca-textofuerte font-bold text-sm">{s.nombre}</span>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-marca-tenue text-[10px] uppercase font-bold">
                  Auditoría activa
                </span>
                <input
                  type="checkbox"
                  checked={s.puedeAuditar}
                  disabled={guardandoId === s.id}
                  onChange={() => handleToggle(s)}
                  className="w-4 h-4 accent-marca-rojo"
                />
              </label>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function FilaItem({ item, onCambio }: { item: ItemPlantillaAuditoria; onCambio: () => void }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(item.item);
  const [guardando, setGuardando] = useState(false);
  const [eliminando, setEliminando] = useState(false);

  async function handleGuardar() {
    if (!texto.trim()) return;
    setGuardando(true);
    const resultado = await actualizarItemPlantilla(item.id, item.categoria, texto.trim());
    setGuardando(false);
    if (resultado.exito) {
      setEditando(false);
      onCambio();
    }
  }

  async function handleEliminar() {
    if (!window.confirm(`¿Eliminar el ítem "${item.item}" de la plantilla?`)) return;
    setEliminando(true);
    await eliminarItemPlantilla(item.id);
    setEliminando(false);
    onCambio();
  }

  if (editando) {
    return (
      <div className="flex items-center gap-2 py-1.5">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          className="flex-1 p-2 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
        />
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
            setTexto(item.item);
          }}
          className="text-marca-tenue text-[11px] font-bold uppercase"
        >
          Cancelar
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b border-marca-borde last:border-b-0">
      <span className="text-marca-texto text-sm">{item.item}</span>
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

function FormularioNuevoItem({
  categorias,
  onAgregado,
}: {
  categorias: string[];
  onAgregado: () => void;
}) {
  const [categoria, setCategoria] = useState("");
  const [item, setItem] = useState("");
  const [nuevaCategoria, setNuevaCategoria] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function handleAgregar() {
    const cat = categoria.trim();
    if (!cat || !item.trim()) {
      setMensaje("Completa la categoría y el ítem.");
      return;
    }
    setGuardando(true);
    setMensaje(null);
    const resultado = await agregarItemPlantilla(cat, item.trim());
    setGuardando(false);
    if (resultado.exito) {
      setItem("");
      onAgregado();
    } else {
      setMensaje(resultado.mensaje || "No se pudo agregar.");
    }
  }

  return (
    <div className="bg-marca-fondo border border-dashed border-marca-borde rounded-[3px] p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {!nuevaCategoria ? (
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className={clasesInput + " flex-1 min-w-[160px]"}
          >
            <option value="">Categoría existente...</option>
            {categorias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            placeholder="Nombre de la categoría nueva"
            className={clasesInput + " flex-1 min-w-[160px]"}
          />
        )}
        <button
          type="button"
          onClick={() => {
            setNuevaCategoria((v) => !v);
            setCategoria("");
          }}
          className="text-marca-rojoclaro text-[11px] font-bold uppercase whitespace-nowrap"
        >
          {nuevaCategoria ? "Usar existente" : "+ Categoría nueva"}
        </button>
      </div>
      <input
        value={item}
        onChange={(e) => setItem(e.target.value)}
        placeholder="Texto del nuevo ítem"
        className={clasesInput}
      />
      <button
        type="button"
        onClick={handleAgregar}
        disabled={guardando}
        className="bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 text-marca-textofuerte font-black py-2 px-4 rounded-[3px] text-[11px] tracking-widest uppercase transition"
      >
        {guardando ? "Agregando..." : "+ Agregar ítem"}
      </button>
      {mensaje && <p className="text-marca-rojoclaro text-xs font-bold">{mensaje}</p>}
    </div>
  );
}

function GrupoCategoria({
  categoria,
  items,
  onCambio,
}: {
  categoria: string;
  items: ItemPlantillaAuditoria[];
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
          {categoria} ({items.length} ítems)
        </span>
        <span className={`text-marca-tenue text-[10px] transition-transform ${abierto ? "rotate-180" : ""}`}>▾</span>
      </button>
      {abierto && (
        <div className="px-3 pb-2 border-t border-marca-borde">
          {items.map((it) => (
            <FilaItem key={it.id} item={it} onCambio={onCambio} />
          ))}
        </div>
      )}
    </div>
  );
}

export function PlantillaAuditoria() {
  const [items, setItems] = useState<ItemPlantillaAuditoria[]>([]);
  const [cargando, setCargando] = useState(true);

  function cargar() {
    setCargando(true);
    obtenerPlantillaAuditoriaAdmin()
      .then(setItems)
      .finally(() => setCargando(false));
  }

  useEffect(cargar, []);

  const porCategoria = useMemo(() => {
    const mapa = new Map<string, ItemPlantillaAuditoria[]>();
    items.forEach((it) => {
      const lista = mapa.get(it.categoria) ?? [];
      lista.push(it);
      mapa.set(it.categoria, lista);
    });
    return mapa;
  }, [items]);

  const categorias = Array.from(porCategoria.keys());

  if (cargando) return <p className="text-marca-tenue text-sm animate-pulse">Cargando plantilla...</p>;

  return (
    <>
      <div className="space-y-2">
        {categorias.map((cat) => (
          <GrupoCategoria key={cat} categoria={cat} items={porCategoria.get(cat)!} onCambio={cargar} />
        ))}
      </div>

      <div className="mt-4">
        <FormularioNuevoItem categorias={categorias} onAgregado={cargar} />
      </div>
    </>
  );
}
