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

// La auditoría es el formulario más largo de la app (40+ ítems). Se guarda
// un borrador en el navegador con cada cambio, porque basta con cambiar de
// pestaña dentro del panel para que el componente se desmonte y se pierda
// todo lo cargado — y lo mismo pasaba si la sesión de 12 horas vencía justo
// al enviar.
const CLAVE_BORRADOR = "shimaya-borrador-auditoria";

type Borrador = Record<string, string | string[]>;

export default function AuditoriaForm({ onGuardado }: { onGuardado: () => void }) {
  const [items, setItems] = useState<ItemFormulario[]>([]);
  const [tiendas, setTiendas] = useState<TiendaBasicaAuditoria[]>([]);
  const [cargando, setCargando] = useState(true);
  const [calificados, setCalificados] = useState(0);
  const [borradorRestaurado, setBorradorRestaurado] = useState(false);
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

  function contarCalificados(form: HTMLFormElement, lista: ItemFormulario[]) {
    const datos = new FormData(form);
    return lista.reduce((n, it) => (datos.get(`item_${it.id}`) !== null ? n + 1 : n), 0);
  }

  function guardarBorrador() {
    const form = formRef.current;
    if (!form) return;
    const borrador: Borrador = {};
    for (const [clave, valor] of new FormData(form).entries()) {
      if (typeof valor !== "string") continue;
      if (clave === "alertas") {
        const previo = borrador[clave];
        borrador[clave] = Array.isArray(previo) ? [...previo, valor] : [valor];
      } else {
        borrador[clave] = valor;
      }
    }
    try {
      localStorage.setItem(CLAVE_BORRADOR, JSON.stringify(borrador));
    } catch {}
    setCalificados(contarCalificados(form, items));
  }

  // Restaura el borrador recién cuando el checklist ya está en pantalla:
  // antes de eso los campos todavía no existen en el DOM.
  useEffect(() => {
    const form = formRef.current;
    if (cargando || items.length === 0 || !form) return;
    try {
      const crudo = localStorage.getItem(CLAVE_BORRADOR);
      if (!crudo) return;
      const borrador: Borrador = JSON.parse(crudo);
      Object.entries(borrador).forEach(([nombre, valor]) => {
        const campos = form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
          `[name="${CSS.escape(nombre)}"]`
        );
        campos.forEach((campo) => {
          if (campo instanceof HTMLInputElement && (campo.type === "radio" || campo.type === "checkbox")) {
            campo.checked = (Array.isArray(valor) ? valor : [valor]).includes(campo.value);
          } else {
            campo.value = String(valor);
          }
        });
      });
      setCalificados(contarCalificados(form, items));
      setBorradorRestaurado(true);
    } catch {}
  }, [cargando, items]);

  useEffect(() => {
    if (estado.exito) {
      formRef.current?.reset();
      try {
        localStorage.removeItem(CLAVE_BORRADOR);
      } catch {}
      setCalificados(0);
      setBorradorRestaurado(false);
      onGuardado();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  // Aviso del navegador al cerrar o recargar con la auditoría a medio llenar.
  useEffect(() => {
    if (calificados === 0) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [calificados]);

  const categorias = Array.from(new Set(items.map((i) => i.categoria)));
  const faltan = items.length - calificados;

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
    <form ref={formRef} action={formAction} onChange={guardarBorrador} className="space-y-6">
      {borradorRestaurado && (
        <div className="bg-marca-superficie border border-marca-borde rounded-[3px] p-3 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-marca-tenue text-xs">
            📝 Se recuperó lo que habías cargado antes de salir.
          </p>
          <button
            type="button"
            onClick={() => {
              formRef.current?.reset();
              try {
                localStorage.removeItem(CLAVE_BORRADOR);
              } catch {}
              setCalificados(0);
              setBorradorRestaurado(false);
            }}
            className="text-marca-rojoclaro text-[11px] font-black uppercase tracking-widest min-h-[32px] px-2"
          >
            Empezar de cero
          </button>
        </div>
      )}

      {/* Los ítems que este formulario llegó a mostrar. Si alguien edita la
          plantilla mientras el supervisor la está llenando, el servidor sabe
          cuáles pedirle y cuáles ignorar por haber aparecido después — antes
          reclamaba un ítem que no estaba en pantalla y dejaba el formulario
          trabado, sin forma de guardar. */}
      <input type="hidden" name="items_presentes" value={items.map((i) => i.id).join(",")} />

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

      {categorias.map((cat) => (
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
                  className="bg-marca-fondo border border-marca-borde rounded-[3px] p-3 space-y-2"
                >
                  <span className="text-marca-texto text-sm block">{it.item}</span>
                  {/* Área de toque de 44px por opción: antes eran tres radios
                      diminutos pegados, difíciles de acertar desde el celular. */}
                  <div className="flex items-stretch gap-2">
                    <label className="flex-1 flex items-center justify-center gap-1.5 min-h-[44px] px-2 rounded-[3px] border border-marca-borde cursor-pointer hover:border-emerald-500/50 transition">
                      <input
                        type="radio"
                        name={`item_${it.id}`}
                        value="2"
                        required
                        className="peer w-4 h-4 shrink-0 accent-emerald-500"
                      />
                      <span className="text-[11px] font-bold text-marca-tenue peer-checked:text-emerald-400">
                        Cumple
                      </span>
                    </label>
                    <label className="flex-1 flex items-center justify-center gap-1.5 min-h-[44px] px-2 rounded-[3px] border border-marca-borde cursor-pointer hover:border-amber-500/50 transition">
                      <input
                        type="radio"
                        name={`item_${it.id}`}
                        value="1"
                        className="peer w-4 h-4 shrink-0 accent-amber-500"
                      />
                      <span className="text-[11px] font-bold text-marca-tenue peer-checked:text-amber-400">
                        Parcial
                      </span>
                    </label>
                    <label className="flex-1 flex items-center justify-center gap-1.5 min-h-[44px] px-2 rounded-[3px] border border-marca-borde cursor-pointer hover:border-marca-rojo/50 transition">
                      <input
                        type="radio"
                        name={`item_${it.id}`}
                        value="0"
                        className="peer w-4 h-4 shrink-0 accent-marca-rojo"
                      />
                      <span className="text-[11px] font-bold text-marca-tenue peer-checked:text-marca-rojoclaro">
                        No cumple
                      </span>
                    </label>
                  </div>
                </div>
              ))}
          </div>
          <div>
            <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
              Observaciones
            </label>
            {/* Se identifica por nombre de categoría, no por posición: si
                cambiaba el orden o el nombre en la plantilla, la observación
                quedaba guardada bajo la categoría equivocada. */}
            <textarea name={`obs_${cat}`} rows={2} className={clasesInput} />
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

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-marca-tenue font-bold">
            {calificados} de {items.length} ítems calificados
          </span>
          {faltan > 0 ? (
            <span className="text-amber-400 font-bold">
              Falta{faltan === 1 ? "" : "n"} {faltan}
            </span>
          ) : (
            <span className="text-emerald-400 font-bold">Checklist completo ✓</span>
          )}
        </div>
        <div className="h-1.5 bg-marca-fondo border border-marca-borde rounded-full overflow-hidden">
          <div
            className="h-full bg-marca-rojo transition-all"
            style={{ width: `${items.length > 0 ? (calificados / items.length) * 100 : 0}%` }}
          />
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
