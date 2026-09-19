import { obtenerSesion } from "@/lib/session";
import { redirect } from "next/navigation";
import { Home, MapPin, ClipboardList, BarChart3, File, Calendar, Search, Settings, Sparkles, CalendarClock } from "lucide-react";
import SelectorTiendas from "./selector-tiendas";
import HistorialPdf from "./historial-pdf";
import MisReportes from "./mis-reportes";
import AnunciosWidget from "../anuncios-widget";
import MisPuntosWidget from "../mis-puntos-widget";
import { tieneAccesoRegistro, tieneAccesoAuditoria } from "@/lib/permisos";
import PerfilBanner from "../perfil-banner";
import { obtenerMiPerfil } from "./actions";
import TiendasFijas from "./tiendas-fijas";
import MisSolicitudes from "./mis-solicitudes";
import MisMarcaciones from "./mis-marcaciones";
import ChecklistVisita from "../checklist-visita";
import EventosDeHoy from "../eventos-hoy";
import ResumenDelDia from "../resumen-del-dia";
import PanelShell, { type ItemMenuPanel } from "../panel-shell";
import {
  LazyCentralAnalitica as CentralAnalitica,
  LazyDocumentos as Documentos,
  LazyCalendario as Calendario,
  LazyRegistro as Registro,
  LazyAuditoriasPanel as AuditoriasPanel,
  LazyConsultorioIA as ConsultorioIA,
  LazyHistoriasFeed as HistoriasFeed,
} from "../panel-lazy";
import { hoyPeru } from "@/lib/fechas";

export const dynamic = "force-dynamic";

export default async function PanelSupervisor() {
  const sesion = await obtenerSesion();
  if (!sesion || sesion.rol !== "supervisor") redirect("/login");

  const accesoRegistro = await tieneAccesoRegistro(sesion.id, sesion.rol);
  const accesoAuditoria = await tieneAccesoAuditoria(sesion.id);

  const items: ItemMenuPanel[] = [
    {
      id: "inicio",
      etiqueta: "Inicio",
      icono: <Home className="w-4 h-4" />,
      contenido: (
        <div className="space-y-6">
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
      id: "bitacora",
      etiqueta: "Bitácora de Campo",
      icono: <MapPin className="w-4 h-4" />,
      contenido: (
        <div className="space-y-6">
          <TiendasFijas />
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
      id: "analitica",
      etiqueta: "Central Analítica",
      icono: <BarChart3 className="w-4 h-4" />,
      contenido: <CentralAnalitica />,
    },
    {
      id: "documentos",
      etiqueta: "Documentos",
      icono: <File className="w-4 h-4" />,
      contenido: <Documentos esAdmin={accesoRegistro} />,
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
  ];

  if (accesoAuditoria) {
    items.push({
      id: "auditorias",
      etiqueta: "Auditoría",
      icono: <Search className="w-4 h-4" />,
      contenido: <AuditoriasPanel esAdmin={false} puedeAuditar={true} />,
    });
  }

  if (accesoRegistro) {
    items.push({
      id: "registro",
      etiqueta: "Registro",
      icono: <Settings className="w-4 h-4" />,
      contenido: <Registro esCoordinador={false} />,
    });
  }

  return (
    <PanelShell
      nombre={sesion.nombre}
      tituloPortal="Supervisor"
      items={items}
      defaultId="inicio"
      encabezado={
        <>
          <h1 className="font-display text-xl sm:text-2xl text-marca-textofuerte tracking-wide mb-4">
            Panel <span className="text-marca-rojoclaro italic">Supervisor</span>
          </h1>
          <ResumenDelDia nombre={sesion.nombre} rol={sesion.rol}>
            <HistoriasFeed miUsuarioId={sesion.id} miRol={sesion.rol} />
          </ResumenDelDia>
        </>
      }
    />
  );
}
