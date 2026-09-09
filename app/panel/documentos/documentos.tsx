"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  obtenerDocumentos,
  obtenerUrlDescarga,
  subirDocumento,
  actualizarDocumento,
  eliminarDocumento,
  type Documento,
  type ResultadoAccion,
} from "./actions";

const CATEGORIAS = [
  { id: "checklists", etiqueta: "Checklists" },
  { id: "formatos", etiqueta: "Formatos" },
  { id: "manuales", etiqueta: "Manuales y políticas" },
] as const;

const estadoInicial: ResultadoAccion = { exito: false };

function formatearTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function claseBadge(extension: string): string {
  const ext = extension.toLowerCase();
  if (ext === "pdf") return "bg-rose-600";
  if (ext === "doc" || ext === "docx") return "bg-sky-600";
  if (ext === "xls" || ext === "xlsx") return "bg-emerald-600";
  return "bg-marca-tenue";
}

function CampoTexto({
  etiqueta,
  children,
}: {
  etiqueta: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
        {etiqueta}
      </label>
      {children}
    </div>
  );
}

const clasesInput =
  "w-full p-3 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro";

function BotonSubir() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 text-marca-textofuerte font-black py-3 rounded-[3px] text-xs tracking-widest uppercase transition"
    >
      {pending ? "Subiendo..." : "Subir documento"}
    </button>
  );
}

function ModalCrear({ onClose, onGuardado }: { onClose: () => void; onGuardado: () => void }) {
  const [estado, formAction] = useFormState(subirDocumento, estadoInicial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado.exito) {
      onGuardado();
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center p-5 z-50"
      onClick={onClose}
    >
      <form
        ref={formRef}
        action={formAction}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-marca-superficie border border-marca-borde rounded-[3px] p-5 space-y-4"
      >
        <h3 className="text-xs font-black tracking-widest text-marca-tenue">SUBIR DOCUMENTO</h3>

        <CampoTexto etiqueta="Nombre visible">
          <input name="nombre" required className={clasesInput} placeholder="Ej. Checklist de apertura" />
        </CampoTexto>

        <CampoTexto etiqueta="Categoría">
          <select name="categoria" required defaultValue="" className={clasesInput}>
            <option value="" disabled>
              Selecciona...
            </option>
            {CATEGORIAS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.etiqueta}
              </option>
            ))}
          </select>
        </CampoTexto>

        <CampoTexto etiqueta="Archivo (PDF, Word o Excel — máx. 20 MB)">
          <input
            type="file"
            name="archivo"
            required
            accept=".pdf,.doc,.docx,.xls,.xlsx"
            className="w-full text-marca-tenue text-xs file:mr-3 file:py-2 file:px-3 file:rounded-[3px] file:border-0 file:bg-marca-rojo file:text-marca-textofuerte file:text-xs file:font-bold"
          />
        </CampoTexto>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-marca-superficie2 border border-marca-borde text-marca-tenue py-3 rounded-[3px] text-xs font-bold uppercase hover:text-marca-texto transition"
          >
            Cancelar
          </button>
          <div className="flex-1">
            <BotonSubir />
          </div>
        </div>

        {estado.mensaje && !estado.exito && (
          <p className="text-marca-rojoclaro text-xs font-bold text-center">{estado.mensaje}</p>
        )}
      </form>
    </div>
  );
}

function ModalEditar({
  doc,
  onClose,
  onGuardado,
}: {
  doc: Documento;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [nombre, setNombre] = useState(doc.nombre);
  const [categoria, setCategoria] = useState<string>(doc.categoria);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGuardar() {
    if (!nombre.trim()) {
      setError("El nombre no puede quedar vacío.");
      return;
    }
    setGuardando(true);
    setError(null);
    const fd = new FormData();
    fd.set("id", doc.id);
    fd.set("nombre", nombre.trim());
    fd.set("categoria", categoria);
    if (archivo) fd.set("archivo", archivo);

    const resultado = await actualizarDocumento(fd);
    setGuardando(false);
    if (resultado.exito) {
      onGuardado();
      onClose();
    } else {
      setError(resultado.mensaje || "No se pudo guardar.");
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center p-5 z-50"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-marca-superficie border border-marca-borde rounded-[3px] p-5 space-y-4"
      >
        <h3 className="text-xs font-black tracking-widest text-marca-tenue">EDITAR DOCUMENTO</h3>

        <CampoTexto etiqueta="Nombre visible">
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className={clasesInput}
          />
        </CampoTexto>

        <CampoTexto etiqueta="Categoría">
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className={clasesInput}
          >
            {CATEGORIAS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.etiqueta}
              </option>
            ))}
          </select>
        </CampoTexto>

        <div className="border border-dashed border-marca-borde rounded-[3px] p-3 space-y-2 bg-marca-fondo">
          <p className="text-marca-tenue text-xs">
            Archivo actual: <strong className="text-marca-texto font-data">{doc.nombre}.{doc.extension}</strong>
          </p>
          <label className="inline-flex items-center gap-2 text-xs font-bold text-marca-rojoclaro cursor-pointer">
            📎 Reemplazar archivo
            <input
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx"
              className="hidden"
              onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            />
          </label>
          {archivo && (
            <p className="text-emerald-400 text-[11px] font-data">
              ✓ {archivo.name} — se guardará al confirmar
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-marca-superficie2 border border-marca-borde text-marca-tenue py-3 rounded-[3px] text-xs font-bold uppercase hover:text-marca-texto transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleGuardar}
            disabled={guardando}
            className="flex-1 bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 text-marca-textofuerte font-black py-3 rounded-[3px] text-xs tracking-widest uppercase transition"
          >
            {guardando ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>

        {error && <p className="text-marca-rojoclaro text-xs font-bold text-center">{error}</p>}
      </div>
    </div>
  );
}

export default function Documentos({ esAdmin }: { esAdmin: boolean }) {
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>("todos");
  const [descargandoId, setDescargandoId] = useState<string | null>(null);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [modal, setModal] = useState<{ modo: "crear" } | { modo: "editar"; doc: Documento } | null>(
    null
  );

  function cargar() {
    setCargando(true);
    obtenerDocumentos()
      .then(setDocumentos)
      .catch((e) => setError(e.message || "No se pudo cargar los documentos."))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, []);

  async function handleDescargar(doc: Documento) {
    setDescargandoId(doc.id);
    const resultado = await obtenerUrlDescarga(doc.id);
    setDescargandoId(null);
    if (resultado.url) {
      window.open(resultado.url, "_blank");
    } else {
      setError(resultado.error || "No se pudo descargar el archivo.");
    }
  }

  async function handleEliminar(doc: Documento) {
    if (!window.confirm(`¿Eliminar "${doc.nombre}"? Esta acción no se puede deshacer.`)) return;
    setEliminandoId(doc.id);
    const resultado = await eliminarDocumento(doc.id);
    setEliminandoId(null);
    if (resultado.exito) {
      cargar();
    } else {
      setError(resultado.mensaje || "No se pudo eliminar el documento.");
    }
  }

  const filtrados = documentos.filter((d) => {
    const coincideCategoria = categoriaFiltro === "todos" || d.categoria === categoriaFiltro;
    const coincideBusqueda = d.nombre.toLowerCase().includes(busqueda.trim().toLowerCase());
    return coincideCategoria && coincideBusqueda;
  });

  if (cargando) return <p className="text-marca-tenue text-sm animate-pulse">Cargando documentos...</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setCategoriaFiltro("todos")}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wide transition ${
              categoriaFiltro === "todos"
                ? "bg-marca-rojo text-marca-textofuerte"
                : "bg-marca-superficie2 border border-marca-borde text-marca-tenue hover:border-marca-rojo/40"
            }`}
          >
            Todos
          </button>
          {CATEGORIAS.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategoriaFiltro(c.id)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wide transition ${
                categoriaFiltro === c.id
                  ? "bg-marca-rojo text-marca-textofuerte"
                  : "bg-marca-superficie2 border border-marca-borde text-marca-tenue hover:border-marca-rojo/40"
              }`}
            >
              {c.etiqueta}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar un documento..."
            className="p-2.5 bg-marca-superficie border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro w-56"
          />
          {esAdmin && (
            <button
              onClick={() => setModal({ modo: "crear" })}
              className="bg-marca-rojo hover:bg-marca-rojoclaro text-marca-textofuerte px-4 py-2.5 rounded-[3px] text-xs font-black uppercase tracking-widest transition whitespace-nowrap"
            >
              + Subir
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-marca-rojoclaro text-xs font-bold">{error}</p>}

      {filtrados.length === 0 ? (
        <p className="text-marca-tenue text-sm italic">No se encontraron documentos.</p>
      ) : (
        CATEGORIAS.map((cat) => {
          const docsCategoria = filtrados.filter((d) => d.categoria === cat.id);
          if (docsCategoria.length === 0) return null;
          return (
            <div key={cat.id}>
              <div className="flex items-baseline gap-2 mb-2">
                <h3 className="text-xs font-black tracking-widest text-marca-tenue">
                  {cat.etiqueta.toUpperCase()}
                </h3>
                <span className="text-marca-tenue text-[11px] font-data">
                  {docsCategoria.length} archivo{docsCategoria.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="bg-marca-superficie border border-marca-borde rounded-[3px] overflow-hidden">
                {docsCategoria.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-marca-borde last:border-b-0"
                  >
                    <div
                      className={`flex-none w-9 h-9 rounded-[6px] flex items-center justify-center text-[10px] font-black text-white ${claseBadge(
                        doc.extension
                      )}`}
                    >
                      {doc.extension.slice(0, 3).toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-[180px]">
                      <p className="text-marca-textofuerte font-semibold text-sm">{doc.nombre}</p>
                      <p className="text-marca-tenue text-[11px] font-data">
                        {formatearTamano(doc.tamanoBytes)} · Actualizado {formatearFecha(doc.actualizadoEn)} · Subido por{" "}
                        {doc.subidoPor}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-none">
                      {esAdmin && (
                        <>
                          <button
                            onClick={() => setModal({ modo: "editar", doc })}
                            title="Editar"
                            className="w-8 h-8 rounded-[3px] border border-marca-borde text-marca-tenue hover:text-marca-texto transition flex items-center justify-center"
                          >
                            ✎
                          </button>
                          <button
                            onClick={() => handleEliminar(doc)}
                            disabled={eliminandoId === doc.id}
                            title="Eliminar"
                            className="w-8 h-8 rounded-[3px] border border-marca-borde text-marca-tenue hover:text-marca-rojoclaro hover:border-marca-rojo/50 transition flex items-center justify-center disabled:opacity-50"
                          >
                            🗑
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleDescargar(doc)}
                        disabled={descargandoId === doc.id}
                        className="bg-marca-rojo/15 border border-marca-rojo/40 text-marca-textofuerte px-3 py-1.5 rounded-[3px] text-xs font-bold hover:bg-marca-rojo hover:text-marca-textofuerte transition disabled:opacity-50 whitespace-nowrap"
                      >
                        {descargandoId === doc.id ? "..." : "⬇ Descargar"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}

      {modal?.modo === "crear" && (
        <ModalCrear onClose={() => setModal(null)} onGuardado={cargar} />
      )}
      {modal?.modo === "editar" && (
        <ModalEditar doc={modal.doc} onClose={() => setModal(null)} onGuardado={cargar} />
      )}
    </div>
  );
}
