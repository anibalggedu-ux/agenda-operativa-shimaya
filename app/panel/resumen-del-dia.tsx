"use client";

import { useEffect, useState } from "react";
import {
  obtenerResumenPersonal,
  obtenerResumenOperativo,
  type ResumenPersonal,
  type ResumenOperativo,
} from "./resumen-dia-actions";
import { formatearFechaLegible } from "@/lib/fechas";

function Tarjeta({
  icono,
  etiqueta,
  valor,
  extra,
  valorClase,
  destacada,
}: {
  icono: string;
  etiqueta: string;
  valor: string;
  extra?: string;
  valorClase?: string;
  destacada?: boolean;
}) {
  return (
    <div
      className={`rounded-[3px] p-4 border ${
        destacada ? "bg-marca-rojo/10 border-marca-rojo/40" : "bg-marca-superficie border-marca-borde"
      }`}
    >
      <p className="text-lg mb-2 leading-none">{icono}</p>
      <p className="text-marca-tenue text-[10px] uppercase font-bold mb-1">{etiqueta}</p>
      <p className={`font-display text-xl font-semibold ${valorClase ?? "text-marca-textofuerte"}`}>{valor}</p>
      {extra && <p className="text-marca-tenue text-[11px] mt-1">{extra}</p>}
    </div>
  );
}

function TarjetaAncha({ icono, etiqueta, valor }: { icono: string; etiqueta: string; valor: string }) {
  return (
    <div className="sm:col-span-2 lg:col-span-4 bg-marca-superficie border border-marca-borde rounded-[3px] p-4 flex items-center justify-between flex-wrap gap-2">
      <span className="text-marca-tenue text-[11px] uppercase font-bold flex items-center gap-2">
        {icono} {etiqueta}
      </span>
      <span className="text-marca-textofuerte font-bold text-sm capitalize">{valor}</span>
    </div>
  );
}

export default function ResumenDelDia({ nombre, rol }: { nombre: string; rol: string }) {
  const esOperativo = rol === "coordinador" || rol === "gerente";
  const [personal, setPersonal] = useState<ResumenPersonal | null>(null);
  const [operativo, setOperativo] = useState<ResumenOperativo | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    setCargando(true);
    const promesa = esOperativo ? obtenerResumenOperativo() : obtenerResumenPersonal();
    promesa
      .then((r: any) => (esOperativo ? setOperativo(r) : setPersonal(r)))
      .catch(() => {})
      .finally(() => setCargando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esOperativo]);

  const primerNombre = nombre.split(" ")[0];
  const [saludo, setSaludo] = useState("Hola");
  const [fechaHoy, setFechaHoy] = useState("");

  useEffect(() => {
    const hora = new Date().getHours();
    setSaludo(hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches");
    setFechaHoy(
      new Date().toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    );
  }, []);

  if (cargando) {
    return <div className="mb-6 h-28 bg-marca-superficie border border-marca-borde rounded-[3px] animate-pulse" />;
  }

  return (
    <div className="mb-6">
      <div className="mb-3">
        <h2 className="font-display text-2xl font-semibold text-marca-textofuerte">
          {saludo}, <span className="text-marca-rojoclaro italic">{primerNombre}</span> 👋
        </h2>
        <p className="text-marca-tenue text-xs capitalize">{fechaHoy}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {esOperativo && operativo && (
          <>
            <Tarjeta
              icono="🚨"
              etiqueta="Tiendas en acción inmediata"
              valor={String(operativo.tiendasCriticas.length)}
              valorClase={operativo.tiendasCriticas.length > 0 ? "text-marca-rojoclaro" : undefined}
              destacada={operativo.tiendasCriticas.length > 0}
              extra={
                operativo.tiendasCriticas.length > 0
                  ? operativo.tiendasCriticas
                      .slice(0, 2)
                      .map((t) => `${t.nombre} — ${t.porcentaje}%`)
                      .join(" · ")
                  : "Ninguna por ahora"
              }
            />
            <Tarjeta
              icono="📍"
              etiqueta="Visitas de hoy"
              valor={`${operativo.visitasHoy}/${operativo.totalTiendas}`}
              extra="tiendas visitadas hasta ahora"
            />
            <Tarjeta
              icono="🌴"
              etiqueta="Asignación especial hoy"
              valor={String(operativo.asignacionesEspecialesHoyTotal)}
              extra={
                operativo.asignacionEspecialHoy
                  ? `${operativo.asignacionEspecialHoy.nombre} — ${operativo.asignacionEspecialHoy.tipo}`
                  : "Nadie hoy"
              }
            />
            <Tarjeta
              icono="📣"
              etiqueta="Comunicados (7 días)"
              valor={String(operativo.comunicadosSemana)}
              extra="enviados al equipo"
            />
            {operativo.rachaTop && (
              <TarjetaAncha
                icono="🔥"
                etiqueta="Racha más alta del equipo"
                valor={`${operativo.rachaTop.nombre} — ${operativo.rachaTop.racha} día${
                  operativo.rachaTop.racha === 1 ? "" : "s"
                }`}
              />
            )}
          </>
        )}

        {!esOperativo && personal && (
          <>
            {personal.climaActual && (
              <div
                className={`rounded-[3px] p-4 border ${
                  personal.climaActual.riesgo
                    ? "bg-amber-950/20 border-amber-500/40"
                    : "bg-marca-superficie border-marca-borde"
                }`}
              >
                <p className="text-lg mb-2 leading-none">{personal.climaActual.icono}</p>
                <p className="text-marca-tenue text-[10px] uppercase font-bold mb-1">
                  Clima {personal.climaActual.tempActual !== null ? "ahora" : "hoy"} ·{" "}
                  {personal.climaActual.zonaNombre}
                </p>
                <p
                  className={`font-display text-xl font-semibold ${
                    personal.climaActual.riesgo ? "text-amber-400" : "text-marca-textofuerte"
                  }`}
                >
                  {personal.climaActual.tempActual !== null
                    ? `${personal.climaActual.tempActual}°C`
                    : `${personal.climaActual.tempMax}° / ${personal.climaActual.tempMin}°`}
                </p>
                <p className="text-marca-tenue text-[11px] mt-1">
                  {personal.climaActual.avisoTexto ?? personal.climaActual.descripcion}
                </p>
              </div>
            )}
            <div
              className={`rounded-[3px] p-4 border ${
                personal.rutaHoyEstado === "pendiente"
                  ? "bg-marca-rojo/10 border-marca-rojo/40"
                  : "bg-marca-superficie border-marca-borde"
              }`}
            >
              <p className="text-lg mb-2 leading-none">📍</p>
              <p className="text-marca-tenue text-[10px] uppercase font-bold mb-1">Tu ruta de hoy</p>
              {personal.rutaHoyNombre ? (
                <>
                  <p className="font-display text-lg font-semibold text-marca-textofuerte">
                    {personal.rutaHoyNombre}
                  </p>
                  {personal.rutaHoyExtra > 0 && (
                    <p className="text-marca-tenue text-[11px]">+{personal.rutaHoyExtra} más</p>
                  )}
                  <span
                    className={`inline-block mt-2 text-[11px] font-bold px-2.5 py-1 rounded-full ${
                      personal.rutaHoyEstado === "pendiente"
                        ? "bg-amber-950/30 text-amber-400"
                        : "bg-emerald-950/30 text-emerald-400"
                    }`}
                  >
                    {personal.rutaHoyEstado === "pendiente" ? "⏳ Pendiente de reportar" : "✅ Reportado"}
                  </span>
                </>
              ) : (
                <p className="text-marca-tenue text-sm italic">Sin asignación para hoy</p>
              )}
            </div>
            <Tarjeta
              icono="✏️"
              etiqueta="Reportes editables"
              valor={String(personal.reportesEditables)}
              extra="dentro de las 48h de asignación"
            />
            <Tarjeta
              icono="🔥"
              etiqueta="Racha de puntualidad"
              valor={personal.rachaActual > 0 ? `${personal.rachaActual} día${personal.rachaActual === 1 ? "" : "s"}` : "—"}
              valorClase={personal.rachaActual > 0 ? "text-emerald-400" : undefined}
              extra={personal.rachaActual > 0 ? "sigue así" : "marca a tiempo para empezar"}
            />
            <Tarjeta
              icono="📣"
              etiqueta="Comunicados recientes"
              valor={String(personal.comunicadosRecientes)}
              extra={personal.ultimoComunicadoTipo ?? "sin novedades"}
            />
            {personal.proximoEvento && (
              <TarjetaAncha
                icono="📅"
                etiqueta="Próximo en tu calendario"
                valor={`${personal.proximoEvento.etiqueta} — ${formatearFechaLegible(personal.proximoEvento.fecha)}`}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
