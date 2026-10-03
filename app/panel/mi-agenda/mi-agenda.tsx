"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X, Camera, Images, Paperclip, Trash2, AlertTriangle, FileText, Download } from "lucide-react";
import { obtenerAgenda, crearNota, alternarCumplida, eliminarNota, type NotaAgenda, type Prioridad } from "./actions";
import { comprimirFotoComoBase64 } from "@/lib/comprimir-imagen";
import { reproducirSonidoLogro, reproducirSonidoExito } from "@/lib/sonido";
import EstadoVacio from "../estado-vacio";
import NotificacionesToggle from "./notificaciones-toggle";

const TEXTO_MAXIMO = 500;
const TAMANO_MAXIMO_DOCUMENTO_MB = 10;

function TrazoCheck() {
  return (
    <svg className="trazo-check marcado w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
      <path d="M4 12l6 6L20 6" stroke="#1a1310" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// "Hoy, 9:00 a.m." / "Mañana, 3:00 p.m." / "12 oct, 9:00 a.m." -- en la zona
// horaria del Perú, igual que el resto de la app.
function textoRecordatorio(iso: string): string {
  const fecha = new Date(iso);
  const hoy = new Date();
  const manana = new Date(hoy.getTime() + 24 * 60 * 60 * 1000);
  const mismoDia = (a: Date, b: Date) =>
    a.toLocaleDateString("es-PE", { timeZone: "America/Lima" }) ===
    b.toLocaleDateString("es-PE", { timeZone: "America/Lima" });

  const hora = fecha.toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour: "numeric", minute: "2-digit" });
  if (mismoDia(fecha, hoy)) return `Hoy, ${hora}`;
  if (mismoDia(fecha, manana)) return `Mañana, ${hora}`;
  return `${fecha.toLocaleDateString("es-PE", { timeZone: "America/Lima", day: "numeric", month: "short" })}, ${hora}`;
}

function TarjetaNota({
  nota,
  ahora,
  nueva,
  saliendo,
  onAlternar,
  onEliminar,
}: {
  nota: NotaAgenda;
  ahora: number;
  nueva: boolean;
  saliendo: boolean;
  onAlternar: (nota: NotaAgenda) => void;
  onEliminar: (nota: NotaAgenda) => void;
}) {
  const urgente = nota.prioridad === "urgente" && !nota.cumplida;
  const vencida = !!nota.recordatorioEn && !nota.cumplida && new Date(nota.recordatorioEn).getTime() <= ahora;

  return (
    <div
      className={`bg-marca-superficie border rounded-[3px] p-3.5 flex gap-3 ${
        urgente ? "border-marca-rojo/40" : "border-marca-borde"
      } ${nota.cumplida ? "opacity-55" : ""} ${nueva ? "resorte-entrada" : ""} ${saliendo ? "nota-sale" : ""}`}
    >
      <button
        onClick={() => onAlternar(nota)}
        aria-label={nota.cumplida ? "Marcar como pendiente" : "Marcar como cumplida"}
        className={`relative mt-0.5 shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition ${
          nota.cumplida ? "bg-marca-oro border-marca-oro" : "border-marca-tenue"
        }`}
      >
        {nota.cumplida && <TrazoCheck />}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-[13.5px] font-bold text-marca-texto whitespace-pre-line break-words ${nota.cumplida ? "line-through" : ""}`}>
            {nota.texto}
          </p>
          {nota.recordatorioEn && !nota.cumplida && (
            <span
              className={`shrink-0 text-[10px] font-black px-2 py-1 rounded-full whitespace-nowrap ${
                vencida ? "vela-parpadeo" : ""
              } ${urgente || vencida ? "bg-marca-rojo/15 text-marca-rojoclaro" : "bg-marca-oro/15 text-marca-oro"}`}
            >
              ⏰ {textoRecordatorio(nota.recordatorioEn)}
            </span>
          )}
        </div>

        {(nota.fotoUrl || nota.documentoUrl) && (
          <div className="flex gap-2 mt-2.5">
            {nota.fotoUrl && (
              <div className="relative w-9 h-9 shrink-0">
                <a
                  href={nota.fotoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-9 h-9 rounded-[3px] overflow-hidden border border-marca-borde"
                >
                  <img src={nota.fotoUrl} alt="" className="foto-marca w-full h-full object-cover" />
                </a>
                {nota.fotoDescargaUrl && (
                  <a
                    href={nota.fotoDescargaUrl}
                    aria-label="Descargar foto al celular"
                    className="absolute -bottom-1.5 -right-1.5 w-5 h-5 rounded-full bg-marca-rojo border-2 border-marca-superficie flex items-center justify-center"
                  >
                    <Download className="w-2.5 h-2.5 text-white" />
                  </a>
                )}
              </div>
            )}
            {nota.documentoUrl && (
              <a
                href={nota.documentoUrl}
                className="flex items-center gap-1.5 bg-marca-superficie2 border border-marca-borde rounded-[3px] px-2.5 h-9 text-[10.5px] text-marca-tenue font-bold max-w-[160px]"
              >
                <FileText className="w-3.5 h-3.5 shrink-0 text-marca-rojoclaro" />
                <span className="truncate">{nota.documentoNombre || "Adjunto"}</span>
                <Download className="w-3 h-3 shrink-0 ml-auto" />
              </a>
            )}
          </div>
        )}
      </div>

      <button
        onClick={() => onEliminar(nota)}
        aria-label="Eliminar nota"
        className="shrink-0 text-marca-tenue hover:text-marca-rojoclaro p-1 -m-1 self-start"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function Composer({ onCancelar, onCreada }: { onCancelar: () => void; onCreada: () => void }) {
  const [texto, setTexto] = useState("");
  const [prioridad, setPrioridad] = useState<Prioridad>("normal");
  const [recordatorioEn, setRecordatorioEn] = useState("");
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [documento, setDocumento] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const inputCamaraRef = useRef<HTMLInputElement>(null);
  const inputGaleriaRef = useRef<HTMLInputElement>(null);
  const inputDocumentoRef = useRef<HTMLInputElement>(null);

  async function alElegirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setMensaje(null);
    try {
      setFotoPreview(await comprimirFotoComoBase64(archivo, 1000, 0.78));
    } catch (err: any) {
      setMensaje(err?.message || "No se pudo procesar la foto.");
    }
  }

  function alElegirDocumento(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    if (archivo.size > TAMANO_MAXIMO_DOCUMENTO_MB * 1024 * 1024) {
      setMensaje(`El documento supera el límite de ${TAMANO_MAXIMO_DOCUMENTO_MB} MB.`);
      return;
    }
    setMensaje(null);
    setDocumento(archivo);
  }

  async function guardar() {
    if (!texto.trim()) {
      setMensaje("Escribe algo para tu agenda.");
      return;
    }
    setGuardando(true);
    setMensaje(null);

    const formData = new FormData();
    formData.set("texto", texto.trim());
    formData.set("prioridad", prioridad);
    if (recordatorioEn) formData.set("recordatorioEn", new Date(recordatorioEn).toISOString());
    if (fotoPreview) formData.set("fotoDataUrl", fotoPreview);
    if (documento) formData.set("documento", documento);

    const resultado = await crearNota(formData);
    setGuardando(false);
    if (resultado.exito) {
      reproducirSonidoExito();
      onCreada();
    } else {
      setMensaje(resultado.mensaje || "No se pudo guardar la nota.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55" onClick={onCancelar}>
      <div
        className="relative w-full max-w-sm bg-marca-superficie2 border-t border-marca-borde rounded-t-2xl p-5"
        style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <p className="text-marca-textofuerte text-sm font-black">Nueva nota</p>
          <button onClick={onCancelar} aria-label="Cerrar" className="text-marca-tenue hover:text-marca-texto">
            <X className="w-5 h-5" />
          </button>
        </div>

        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value.slice(0, TEXTO_MAXIMO))}
          placeholder="Escribe tu planificación..."
          rows={3}
          autoFocus
          className="w-full bg-marca-fondo border border-marca-borde rounded-[3px] px-3 py-2.5 text-sm text-marca-texto placeholder:text-marca-tenue resize-none"
        />
        <p className="text-right text-[10px] text-marca-tenue -mt-1 mb-2.5">{texto.length}/{TEXTO_MAXIMO}</p>

        <div className="flex gap-1.5 mb-3">
          <button
            type="button"
            onClick={() => setPrioridad("normal")}
            className={`flex-1 py-2 rounded-[3px] text-[11px] font-black uppercase tracking-wide transition ${
              prioridad === "normal" ? "bg-marca-oro/20 border border-marca-oro text-marca-oro" : "bg-marca-fondo border border-marca-borde text-marca-tenue"
            }`}
          >
            Normal
          </button>
          <button
            type="button"
            onClick={() => setPrioridad("urgente")}
            className={`flex-1 py-2 rounded-[3px] text-[11px] font-black uppercase tracking-wide transition ${
              prioridad === "urgente" ? "bg-marca-rojo/15 border border-marca-rojo text-marca-rojoclaro" : "bg-marca-fondo border border-marca-borde text-marca-tenue"
            }`}
          >
            Urgente
          </button>
        </div>

        <input
          ref={inputCamaraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={alElegirFoto}
        />
        <input ref={inputGaleriaRef} type="file" accept="image/*" className="hidden" onChange={alElegirFoto} />
        <input ref={inputDocumentoRef} type="file" className="hidden" onChange={alElegirDocumento} />

        <div className="flex gap-2 mb-3">
          <button
            type="button"
            onClick={() => inputCamaraRef.current?.click()}
            className="flex-1 flex flex-col items-center gap-1 py-2.5 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-tenue"
          >
            <Camera className="w-4 h-4" />
            <span className="text-[10px] font-bold">Cámara</span>
          </button>
          <button
            type="button"
            onClick={() => inputGaleriaRef.current?.click()}
            className="flex-1 flex flex-col items-center gap-1 py-2.5 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-tenue"
          >
            <Images className="w-4 h-4" />
            <span className="text-[10px] font-bold">Galería</span>
          </button>
          <button
            type="button"
            onClick={() => inputDocumentoRef.current?.click()}
            className="flex-1 flex flex-col items-center gap-1 py-2.5 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-tenue"
          >
            <Paperclip className="w-4 h-4" />
            <span className="text-[10px] font-bold">Archivo</span>
          </button>
        </div>

        {(fotoPreview || documento) && (
          <div className="flex gap-2 mb-3">
            {fotoPreview && (
              <div className="relative">
                <img src={fotoPreview} alt="" className="w-12 h-12 rounded-[3px] object-cover border border-marca-borde" />
                <button
                  onClick={() => setFotoPreview(null)}
                  aria-label="Quitar foto"
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-marca-rojo text-white flex items-center justify-center"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            )}
            {documento && (
              <div className="relative flex items-center gap-1.5 bg-marca-fondo border border-marca-borde rounded-[3px] pl-2.5 pr-6 h-12 text-[10.5px] text-marca-tenue font-bold max-w-[180px]">
                <FileText className="w-3.5 h-3.5 shrink-0 text-marca-rojoclaro" />
                <span className="truncate">{documento.name}</span>
                <button
                  onClick={() => setDocumento(null)}
                  aria-label="Quitar documento"
                  className="absolute top-1/2 -translate-y-1/2 right-1.5 w-4 h-4 rounded-full bg-marca-rojo text-white flex items-center justify-center"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            )}
          </div>
        )}

        <label className="flex items-center justify-between gap-2 bg-marca-fondo border border-marca-oro/40 rounded-[3px] px-3 py-2.5 mb-3">
          <span className="text-[11.5px] text-marca-oro font-bold shrink-0">⏰ Recordarme</span>
          <input
            type="datetime-local"
            value={recordatorioEn}
            onChange={(e) => setRecordatorioEn(e.target.value)}
            className="bg-transparent text-marca-texto text-[11px] outline-none text-right min-w-0"
          />
        </label>

        {mensaje && (
          <p className="flex items-center gap-1.5 text-marca-rojoclaro text-[11px] font-bold mb-3">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {mensaje}
          </p>
        )}

        <button
          onClick={guardar}
          disabled={guardando}
          className="w-full min-h-[46px] bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-60 text-marca-textofuerte font-black text-sm rounded-[3px] transition"
        >
          {guardando ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </div>
  );
}

export default function MiAgenda() {
  const [notas, setNotas] = useState<NotaAgenda[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [composerAbierto, setComposerAbierto] = useState(false);
  const [confirmarBorrado, setConfirmarBorrado] = useState<NotaAgenda | null>(null);
  const [recienCreadaId, setRecienCreadaId] = useState<string | null>(null);
  const [saliendoId, setSaliendoId] = useState<string | null>(null);
  // Para que el badge de recordatorio vencido "lata" sin tener que recargar
  // la página -- se refresca solo cada minuto.
  const [ahora, setAhora] = useState(() => Date.now());

  function cargar() {
    return obtenerAgenda()
      .then(setNotas)
      .catch((e) => setError(e.message || "No se pudo cargar tu agenda."))
      .finally(() => setCargando(false));
  }

  useEffect(() => {
    cargar();
  }, []);

  useEffect(() => {
    const intervalo = setInterval(() => setAhora(Date.now()), 60_000);
    return () => clearInterval(intervalo);
  }, []);

  async function alCrearNota() {
    setComposerAbierto(false);
    const lista = await obtenerAgenda().catch(() => null);
    if (!lista) {
      cargar();
      return;
    }
    setNotas(lista);
    setCargando(false);
    // La recién creada queda primera entre las pendientes (más nueva arriba).
    const primera = lista.find((n) => !n.cumplida);
    if (primera) {
      setRecienCreadaId(primera.id);
      setTimeout(() => setRecienCreadaId(null), 550);
    }
  }

  async function alAlternar(nota: NotaAgenda) {
    const nuevoEstado = !nota.cumplida;
    setNotas((prev) =>
      [...prev]
        .map((n) => (n.id === nota.id ? { ...n, cumplida: nuevoEstado } : n))
        .sort((a, b) => Number(a.cumplida) - Number(b.cumplida))
    );
    if (nuevoEstado) reproducirSonidoLogro();
    const resultado = await alternarCumplida(nota.id, nuevoEstado);
    if (!resultado.exito) cargar();
  }

  async function alConfirmarBorrado() {
    if (!confirmarBorrado) return;
    const id = confirmarBorrado.id;
    setConfirmarBorrado(null);
    setSaliendoId(id);
    const [resultado] = await Promise.all([eliminarNota(id), new Promise((r) => setTimeout(r, 280))]);
    setSaliendoId(null);
    if (resultado.exito) setNotas((prev) => prev.filter((n) => n.id !== id));
    else cargar();
  }

  const pendientes = notas.filter((n) => !n.cumplida);
  const cumplidas = notas.filter((n) => n.cumplida);

  return (
    <div className="space-y-4 relative min-h-[60vh]">
      <NotificacionesToggle />
      {cargando && <p className="text-marca-tenue text-sm animate-pulse">Cargando tu agenda...</p>}
      {error && <p className="text-marca-rojoclaro text-sm">{error}</p>}

      {!cargando && !error && (
        <>
          {notas.length === 0 ? (
            <EstadoVacio mensaje="Todavía no tienes nada en tu agenda -- toca el botón + para anotar tu primera planificación." />
          ) : (
            <div className="space-y-2.5">
              {pendientes.map((n) => (
                <TarjetaNota
                  key={n.id}
                  nota={n}
                  ahora={ahora}
                  nueva={n.id === recienCreadaId}
                  saliendo={n.id === saliendoId}
                  onAlternar={alAlternar}
                  onEliminar={setConfirmarBorrado}
                />
              ))}
              {cumplidas.length > 0 && (
                <>
                  <p className="text-marca-tenue text-[10.5px] font-black uppercase tracking-wide pt-2">
                    Cumplidas ({cumplidas.length})
                  </p>
                  {cumplidas.map((n) => (
                    <TarjetaNota
                      key={n.id}
                      nota={n}
                      ahora={ahora}
                      nueva={false}
                      saliendo={n.id === saliendoId}
                      onAlternar={alAlternar}
                      onEliminar={setConfirmarBorrado}
                    />
                  ))}
                </>
              )}
            </div>
          )}
        </>
      )}

      <button
        onClick={() => setComposerAbierto(true)}
        aria-label="Nueva nota"
        className="fixed right-5 z-40 w-14 h-14 rounded-full bg-marca-rojo hover:bg-marca-rojoclaro text-white shadow-lg flex items-center justify-center"
        style={{ bottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}
      >
        <Plus className="w-6 h-6" />
      </button>

      {composerAbierto && <Composer onCancelar={() => setComposerAbierto(false)} onCreada={alCrearNota} />}

      {confirmarBorrado && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setConfirmarBorrado(null)}
        >
          <div
            className="bg-marca-superficie2 border border-marca-borde rounded-[3px] p-4 space-y-3 max-w-xs text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-marca-texto text-sm font-bold">¿Eliminar esta nota?</p>
            <p className="text-marca-tenue text-xs">No se puede deshacer.</p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setConfirmarBorrado(null)}
                className="flex-1 min-h-[40px] border border-marca-borde text-marca-texto text-xs font-bold rounded-[3px]"
              >
                Cancelar
              </button>
              <button
                onClick={alConfirmarBorrado}
                className="flex-1 min-h-[40px] bg-marca-rojo hover:bg-marca-rojoclaro text-marca-textofuerte text-xs font-black rounded-[3px]"
              >
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
