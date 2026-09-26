import { obtenerSesion } from "@/lib/session";
import { redirect } from "next/navigation";
import { Home, MapPin, ClipboardList, Calendar, Car, Sparkles, CalendarClock, Trophy, UserCircle } from "lucide-react";
import SelectorTiendas from "../supervisor/selector-tiendas";
import HistorialPdf from "../supervisor/historial-pdf";
import MisReportes from "../supervisor/mis-reportes";
import AnunciosWidget from "../anuncios-widget";
import EncuestasPendientes from "../encuestas/encuestas-pendientes";
import MisPuntosWidget from "../mis-puntos-widget";
import PerfilBanner from "../perfil-banner";
import { obtenerMiPerfil } from "../supervisor/actions";
import MisSolicitudes from "../supervisor/mis-solicitudes";
import MisMarcaciones from "../supervisor/mis-marcaciones";
import ChecklistVisita from "../checklist-visita";
import EventosDeHoy from "../eventos-hoy";
import RankingCapacitadores from "./ranking-capacitadores";
import KilometrosDelMes from "../analitica/kilometros-del-mes";
import ResumenDelDia from "../resumen-del-dia";
import PanelShell, { type ItemMenuPanel } from "../panel-shell";
import {
  LazyCalendario as Calendario,
  LazyConsultorioIA as ConsultorioIA,
  LazyHistoriasFeed as HistoriasFeed,
  LazyMiPerfil as MiPerfil,
  LazyCampanaNotificaciones as CampanaNotificaciones,
} from "../panel-lazy";
import { hoyPeru } from "@/lib/fechas";
import { obtenerNotificacionesPendientes } from "../historias/social-actions";

export const dynamic = "force-dynamic";

export default async function PanelCapacitador() {
  const sesion = await obtenerSesion();
  if (!sesion || sesion.rol !== "capacitador") redirect("/login");
  const notificacionesPendientes = await obtenerNotificacionesPendientes().catch(() => 0);

  const items: ItemMenuPanel[] = [
    {
      id: "inicio",
      etiqueta: "Inicio",
      icono: <Home className="w-4 h-4" />,
      contenido: (
        <div className="space-y-6">
          <EncuestasPendientes />
          <PerfilBanner cargarPerfil={obtenerMiPerfil} />
          <MisPuntosWidget />
          <AnunciosWidget />
        </div>
      ),
    },
    {
      id: "solicitudes",
      etiqueta: "Solicitudes",
      icono: <CalendarClock className="w-4 h-4" />,
      contenido: <MisSolicitudes />,
    },
    {
      id: "ranking",
      etiqueta: "Ranking",
      icono: <Trophy className="w-4 h-4" />,
      contenido: (
        <div className="space-y-6">
          <RankingCapacitadores />
          <div className="bg-marca-superficie border border-marca-rojo/25 rounded-[3px] p-5 space-y-3">
            <h3 className="flex items-center gap-1.5 text-xs font-black tracking-widest text-marca-tenue">
              <Car className="w-3.5 h-3.5 text-marca-rojoclaro" /> KILÓMETROS DEL MES — CAPACITADORES
            </h3>
            <p className="text-marca-tenue text-[11px]">
              Quién recorrió más distancia este mes, solo entre capacitadores.
            </p>
            <KilometrosDelMes soloRol="capacitador" limite={0} />
          </div>
        </div>
      ),
    },
    {
      id: "bitacora",
      etiqueta: "Bitácora de Campo",
      icono: <MapPin className="w-4 h-4" />,
      contenido: (
        <div className="space-y-6">
          <EventosDeHoy />
          <SelectorTiendas supervisorNombre={sesion.nombre} mostrarDescansoFijo={false} />
          <MisMarcaciones />
          <ChecklistVisita nombreUsuario={sesion.nombre} rol={sesion.rol} />
        </div>
      ),
    },
    {
      id: "reportes",
      etiqueta: "Mis Reportes",
      icono: <ClipboardList className="w-4 h-4" />,
      contenido: (
        <div className="space-y-6">
          <MisReportes />
          <HistorialPdf supervisorNombre={sesion.nombre} />
        </div>
      ),
    },
    {
      id: "calendario",
      etiqueta: "Calendario",
      icono: <Calendar className="w-4 h-4" />,
      contenido: <Calendario modo="propio" hoy={hoyPeru()} />,
    },
    {
      id: "consultorio",
      etiqueta: "Consultorio IA",
      icono: <Sparkles className="w-4 h-4" />,
      contenido: <ConsultorioIA />,
    },
    {
      id: "perfil",
      etiqueta: "Mi Perfil",
      icono: <UserCircle className="w-4 h-4" />,
      contenido: <MiPerfil />,
      badge: notificacionesPendientes,
    },
  ];

  return (
    <PanelShell
      nombre={sesion.nombre}
      tituloPortal="Capacitador"
      items={items}
      defaultId="inicio"
      accionesExtra={<CampanaNotificaciones />}
      encabezado={
        <>
          <h1 className="font-display text-xl sm:text-2xl text-marca-textofuerte tracking-wide mb-4">
            Panel <span className="text-marca-rojoclaro italic">Capacitador</span>
          </h1>
          <ResumenDelDia nombre={sesion.nombre} rol={sesion.rol}>
            <HistoriasFeed miUsuarioId={sesion.id} miRol={sesion.rol} />
          </ResumenDelDia>
        </>
      }
      encabezadoGaleria={
        <>
          <h1 className="font-display text-xl sm:text-2xl text-marca-textofuerte tracking-wide mb-4">
            Panel <span className="text-marca-rojoclaro italic">Capacitador</span>
          </h1>
          <ResumenDelDia nombre={sesion.nombre} rol={sesion.rol} ocultarTarjetas />
        </>
      }
    />
  );
}
