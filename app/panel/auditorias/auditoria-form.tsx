"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  crearAuditoria,
  obtenerPlantillaParaFormulario,
  obtenerTiendasAuditoria,
  type ItemFormulario,
  type TiendaBasicaAuditoria,
  type ResultadoAuditoria,
} from "./actions";
import { hoyPeru } from "@/lib/fechas";

const ALERTAS = [
  "Riesgo sanitario",
  "Falta grave de protocolo",
  "Equipos inoperativos",
  "Falta de personal crítico",
  "Incumplimiento reiterativo de estándares",
  "Reclamos recurrentes sin solución",
];

const FILAS_COMPROMISOS = [0, 1, 2, 3, 4];

const estadoInicial: ResultadoAuditoria = { exito: false };

const clasesInput =
  "w-full p-2.5 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro";

function BotonEnviar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 text-marca-textofuerte font-black py-3 rounded-[3px] text-xs tracking-widest uppercase transition"
    >
      {pending ? "Guardando..." : "Guardar auditoría"}
    </button>
  );
}

export default function AuditoriaForm({ onGuardado }: { onGuardado: () => void }) {
  const [items, setItems] = useState<ItemFormulario[]>([]);
  const [tiendas, setTiendas] = useState<TiendaBasicaAuditoria[]>([]);
  const [cargando, setCargando] = useState(true);
  const [estado, formAction] = useFormState(crearAuditoria, estadoInicial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    Promise.all([obtenerPlantillaParaFormulario(), obtenerTiendasAuditoria()])
      .then(([its, tds]) => {
        setItems(its);
        setTiendas(tds);
      })
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    if (estado.exito) {
      formRef.current?.reset();
      onGuardado();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  const categorias = Array.from(new Set(items.map((i) => i.categoria)));

  if (cargando) {
    return <p className="text-marca-tenue text-sm animate-pulse">Cargando checklist...</p>;
  }
  if (items.length === 0) {
    return (
      <p className="text-marca-tenue text-sm italic">
        Todavía no hay ítems en la plantilla de auditoría. Pídele a quien tenga acceso a Registro
        que la complete.
      </p>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-6">
      <div className="bg-marca-superficie border border-marca-rojo/25 rounded-[3px] p-5 space-y-4">
        <h3 className="text-xs font-black tracking-widest text-marca-tenue">DATOS GENERALES</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">Sede</label>
            <select name="tiendaId" required defaultValue="" className={clasesInput}>
              <option value="" disabled>
                Selecciona...
              </option>
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
              name="fecha"
              required
              defaultValue={hoyPeru()}
              max={hoyPeru()}
              className={clasesInput}
            />
          </div>
          <div>
            <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
              Líder de turno
            </label>
            <input
              type="text"
              name="lider"
              placeholder="Nombre de quien lideraba la cocina"
              className={clasesInput}
            />
          </div>
        </div>
      </div>

      {categorias.map((cat, catIndex) => (
        <div
          key={cat}
          className="bg-marca-superficie border border-marca-borde rounded-[3px] p-5 space-y-3"
        >
          <h3 className="text-xs font-black tracking-widest text-marca-tenue">{cat.toUpperCase()}</h3>
          <div className="space-y-2">
            {items
              .filter((i) => i.categoria === cat)
              .map((it) => (
                <div
                  key={it.id}
                  className="flex flex-wrap items-center justify-between gap-2 bg-marca-fondo border border-marca-borde rounded-[3px] p-3"
                >
                  <span className="text-marca-texto text-sm flex-1 min-w-[180px]">{it.item}</span>
                  <div className="flex items-center gap-3 shrink-0">
                    <label className="flex items-center gap-1 text-[11px] text-emerald-400 font-bold cursor-pointer">
                      <input type="radio" name={`item_${it.id}`} value="2" required className="accent-emerald-500" />
                      Cumple
                    </label>
                    <label className="flex items-center gap-1 text-[11px] text-amber-400 font-bold cursor-pointer">
                      <input type="radio" name={`item_${it.id}`} value="1" className="accent-amber-500" />
                      Parcial
                    </label>
                    <label className="flex items-center gap-1 text-[11px] text-marca-rojoclaro font-bold cursor-pointer">
                      <input type="radio" name={`item_${it.id}`} value="0" className="accent-marca-rojo" />
                      No cumple
                    </label>
                  </div>
                </div>
              ))}
          </div>
          <div>
            <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
              Observaciones
            </label>
            <textarea name={`obs_${catIndex}`} rows={2} className={clasesInput} />
          </div>
        </div>
      ))}

      <div className="bg-marca-superficie border border-marca-borde rounded-[3px] p-5 space-y-4">
        <h3 className="text-xs font-black tracking-widest text-marca-tenue">PLAN DE ACCIÓN</h3>
        <div>
          <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
            Fortalezas encontradas
          </label>
          <textarea name="fortalezas" rows={2} className={clasesInput} />
        </div>
        <div>
          <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
            Oportunidades de mejora
          </label>
          <textarea name="oportunidades" rows={2} className={clasesInput} />
        </div>
        <div>
          <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-2">
            Compromisos acordados con la sede
          </label>
          <div className="space-y-2">
            {FILAS_COMPROMISOS.map((i) => (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input name={`compromiso_accion_${i}`} placeholder="Acción" className={clasesInput} />
                <input
                  name={`compromiso_responsable_${i}`}
                  placeholder="Responsable"
                  className={clasesInput}
                />
                <input type="date" name={`compromiso_fecha_${i}`} className={clasesInput} />
              </div>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-2">
            Alertas críticas (marcar si aplica)
          </label>
          <div className="space-y-1.5">
            {ALERTAS.map((a) => (
              <label key={a} className="flex items-center gap-2 text-marca-texto text-sm cursor-pointer">
                <input type="checkbox" name="alertas" value={a} className="w-4 h-4 accent-marca-rojo" />
                {a}
              </label>
            ))}
          </div>
        </div>
      </div>

      <BotonEnviar />

      {estado.mensaje && (
        <p
          className={`text-sm font-bold text-center ${
            estado.exito ? "text-emerald-400" : "text-marca-rojoclaro"
          }`}
        >
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}
