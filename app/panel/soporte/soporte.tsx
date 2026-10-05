"use client";

import { useEffect, useState } from "react";
import { LifeBuoy, Send, ChevronDown, ChevronUp, CircleCheck, Inbox } from "lucide-react";
import {
  crearTicketSoporte,
  obtenerMisTickets,
  obtenerEsCreadorApp,
  obtenerBandejaSoporte,
  responderTicket,
  cerrarTicketSoporte,
  type TicketSoporte,
  type TipoTicket,
} from "./actions";
import { formatearFechaLegible, formatearHora } from "@/lib/fechas";

const ETIQUETA_TIPO: Record<TipoTicket, string> = { duda: "Duda", sugerencia: "Sugerencia", falla: "Falla" };
const COLOR_TIPO: Record<TipoTicket, string> = {
  duda: "text-sky-400 border-sky-500/40 bg-sky-950/20",
  sugerencia: "text-amber-400 border-amber-500/40 bg-amber-950/20",
  falla: "text-marca-rojoclaro border-marca-rojo/40 bg-marca-rojo/10",
};
const ETIQUETA_ESTADO: Record<TicketSoporte["estado"], string> = {
  abierto: "Pendiente",
  respondido: "Respondido",
  cerrado: "Cerrado",
};
const COLOR_ESTADO: Record<TicketSoporte["estado"], string> = {
  abierto: "text-amber-400",
  respondido: "text-emerald-400",
  cerrado: "text-marca-tenue",
};

function fechaHora(iso: string): string {
  const fecha = iso.slice(0, 10);
  const hora = iso.slice(11, 19);
  return `${formatearFechaLegible(fecha)} · ${formatearHora(hora)}`;
}

function HiloTicket({
  ticket,
  esCreador,
  onActualizado,
}: {
  ticket: TicketSoporte;
  esCreador: boolean;
  onActualizado: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [respuesta, setRespuesta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function enviar() {
    const limpio = respuesta.trim();
    if (!limpio) return;
    setEnviando(true);
    setMensaje(null);
    const resultado = await responderTicket(ticket.id, limpio);
    setEnviando(false);
    if (resultado.exito) {
      setRespuesta("");
      onActualizado();
    } else {
      setMensaje(resultado.mensaje ?? "No se pudo enviar.");
    }
  }

  async function cerrar() {
    setEnviando(true);
    await cerrarTicketSoporte(ticket.id);
    setEnviando(false);
    onActualizado();
  }

  const ultimo = ticket.mensajes[ticket.mensajes.length - 1];

  return (
    <div className="bg-marca-superficie border border-marca-borde rounded-[3px] overflow-hidden">
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-marca-superficie2/60 transition"
      >
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${COLOR_TIPO[ticket.tipo]}`}>
              {ETIQUETA_TIPO[ticket.tipo]}
            </span>
            <span className={`text-[10.5px] font-bold ${COLOR_ESTADO[ticket.estado]}`}>{ETIQUETA_ESTADO[ticket.estado]}</span>
            {esCreador && (
              <span className="text-[10.5px] text-marca-tenue">— {ticket.usuarioNombre} ({ticket.rol})</span>
            )}
          </div>
          <p className="text-marca-texto text-sm truncate">{ultimo?.mensaje}</p>
          <p className="text-marca-tenue text-[10.5px]">{fechaHora(ticket.actualizadoEn)}</p>
        </div>
        {abierto ? <ChevronUp className="w-4 h-4 text-marca-tenue shrink-0 mt-1" /> : <ChevronDown className="w-4 h-4 text-marca-tenue shrink-0 mt-1" />}
      </button>

      {abierto && (
        <div className="border-t border-marca-borde p-4 space-y-3">
          <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
            {ticket.mensajes.map((m) => (
              <div
                key={m.id}
                className={`rounded-[3px] p-3 text-sm ${
                  m.esAdmin ? "bg-marca-rojo/10 border border-marca-rojo/25 ml-6" : "bg-marca-superficie2 mr-6"
                }`}
              >
                <p className="text-marca-texto whitespace-pre-wrap break-words">{m.mensaje}</p>
                <p className="text-marca-tenue text-[10px] mt-1.5">
                  {m.esAdmin ? "Anibal (creador)" : m.autorNombre} · {fechaHora(m.creadoEn)}
                </p>
              </div>
            ))}
          </div>

          {ticket.estado !== "cerrado" && (
            <div className="space-y-2">
              <textarea
                value={respuesta}
                onChange={(e) => setRespuesta(e.target.value)}
                rows={2}
                placeholder="Escribe una respuesta..."
                className="w-full p-2.5 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro resize-none"
              />
              {mensaje && <p className="text-marca-rojoclaro text-[11px] font-bold">{mensaje}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={enviar}
                  disabled={enviando || !respuesta.trim()}
                  className="flex-1 min-h-[38px] flex items-center justify-center gap-1.5 bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 text-white text-xs font-black uppercase tracking-wide rounded-[3px] transition"
                >
                  <Send className="w-3.5 h-3.5" /> Responder
                </button>
                {esCreador && (
                  <button
                    type="button"
                    onClick={cerrar}
                    disabled={enviando}
                    className="min-h-[38px] px-3 flex items-center justify-center gap-1.5 border border-marca-borde text-marca-tenue hover:text-marca-texto text-xs font-bold rounded-[3px] transition disabled:opacity-50"
                  >
                    <CircleCheck className="w-3.5 h-3.5" /> Cerrar
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Soporte() {
  const [tipo, setTipo] = useState<TipoTicket>("duda");
  const [mensaje, setMensaje] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);

  const [misTickets, setMisTickets] = useState<TicketSoporte[] | null>(null);
  const [esCreador, setEsCreador] = useState(false);
  const [bandeja, setBandeja] = useState<TicketSoporte[] | null>(null);
  const [filtroBandeja, setFiltroBandeja] = useState<TicketSoporte["estado"] | "todos">("abierto");

  function cargar() {
    obtenerMisTickets().then(setMisTickets).catch(() => setMisTickets([]));
    obtenerEsCreadorApp().then((si) => {
      setEsCreador(si);
      if (si) obtenerBandejaSoporte().then(setBandeja).catch(() => setBandeja([]));
    });
  }

  useEffect(() => {
    cargar();
  }, []);

  async function enviar() {
    const limpio = mensaje.trim();
    if (!limpio) return;
    setEnviando(true);
    setResultado(null);
    const r = await crearTicketSoporte(tipo, limpio);
    setEnviando(false);
    if (r.exito) {
      setMensaje("");
      setResultado("Enviado. Te avisamos apenas te respondan.");
      cargar();
    } else {
      setResultado(r.mensaje ?? "No se pudo enviar.");
    }
  }

  const bandejaFiltrada = (bandeja ?? []).filter((t) => filtroBandeja === "todos" || t.estado === filtroBandeja);

  return (
    <div className="space-y-6">
      <div className="bg-marca-superficie border border-marca-rojo/25 rounded-[3px] p-5 space-y-4">
        <h3 className="flex items-center gap-1.5 text-xs font-black tracking-widest text-marca-tenue">
          <LifeBuoy className="w-3.5 h-3.5 text-marca-rojoclaro" /> SOPORTE Y SUGERENCIAS
        </h3>
        <p className="text-marca-tenue text-[11px]">
          Escríbele directo a Anibal, el creador de la app: una duda, una sugerencia, o una falla que
          encontraste. Te responde por acá mismo.
        </p>

        <div className="flex gap-2">
          {(Object.keys(ETIQUETA_TIPO) as TipoTicket[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTipo(t)}
              className={`flex-1 text-xs font-black uppercase tracking-wide py-2 rounded-[3px] border transition ${
                tipo === t ? COLOR_TIPO[t] : "border-marca-borde text-marca-tenue hover:text-marca-texto"
              }`}
            >
              {ETIQUETA_TIPO[t]}
            </button>
          ))}
        </div>

        <textarea
          value={mensaje}
          onChange={(e) => setMensaje(e.target.value)}
          rows={3}
          placeholder="Cuéntame qué pasa..."
          className="w-full p-3 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro resize-none"
        />

        {resultado && (
          <p className={`text-[11.5px] font-bold ${resultado.startsWith("Enviado") ? "text-emerald-400" : "text-marca-rojoclaro"}`}>
            {resultado}
          </p>
        )}

        <button
          type="button"
          onClick={enviar}
          disabled={enviando || !mensaje.trim()}
          className="w-full min-h-[44px] flex items-center justify-center gap-2 bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 text-white font-black text-xs uppercase tracking-widest rounded-[3px] transition"
        >
          <Send className="w-4 h-4" /> {enviando ? "Enviando..." : "Enviar"}
        </button>
      </div>

      <div className="space-y-2.5">
        <h4 className="text-xs font-black tracking-widest text-marca-tenue">MIS CONSULTAS</h4>
        {misTickets === null ? (
          <p className="text-marca-tenue text-sm animate-pulse">Cargando...</p>
        ) : misTickets.length === 0 ? (
          <p className="text-marca-tenue text-sm italic">Todavía no escribiste nada por acá.</p>
        ) : (
          misTickets.map((t) => <HiloTicket key={t.id} ticket={t} esCreador={false} onActualizado={cargar} />)
        )}
      </div>

      {esCreador && (
        <div className="space-y-2.5">
          <h4 className="flex items-center gap-1.5 text-xs font-black tracking-widest text-marca-tenue">
            <Inbox className="w-3.5 h-3.5" /> BANDEJA DE SOPORTE (TODO EL EQUIPO)
          </h4>
          <div className="flex gap-2">
            {(["abierto", "respondido", "cerrado", "todos"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFiltroBandeja(f)}
                className={`text-[10.5px] font-black uppercase tracking-wide px-2.5 py-1.5 rounded-full border transition ${
                  filtroBandeja === f
                    ? "border-marca-rojo text-marca-rojoclaro bg-marca-rojo/10"
                    : "border-marca-borde text-marca-tenue hover:text-marca-texto"
                }`}
              >
                {f === "todos" ? "Todos" : ETIQUETA_ESTADO[f]}
              </button>
            ))}
          </div>
          {bandeja === null ? (
            <p className="text-marca-tenue text-sm animate-pulse">Cargando...</p>
          ) : bandejaFiltrada.length === 0 ? (
            <p className="text-marca-tenue text-sm italic">Nada por acá.</p>
          ) : (
            bandejaFiltrada.map((t) => <HiloTicket key={t.id} ticket={t} esCreador onActualizado={cargar} />)
          )}
        </div>
      )}
    </div>
  );
}
