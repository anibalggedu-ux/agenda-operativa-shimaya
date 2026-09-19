"use client";

import { Truck, MapPin, Map, ClipboardList, Users, Megaphone, History, BarChart3, Settings, File, Calendar, Search, Sparkles, Images } from "lucide-react";
import SelectorTiendas from "../supervisor/selector-tiendas";
import HistorialPdf from "../supervisor/historial-pdf";
import MisMarcaciones from "../supervisor/mis-marcaciones";
import ChecklistVisita from "../checklist-visita";
import PerfilBanner from "../perfil-banner";
import { obtenerPerfilCoordinador } from "./actions";
import AsignarRutas from "./asignar-rutas";
import AsignacionesEspeciales from "./asignaciones-especiales";
import TiendasPermanentes from "./tiendas-permanentes";
import DescansosSemanales from "./descansos-semanales";
import EstadoPersonalHoy from "./estado-personal-hoy";
import Anuncios from "./anuncios";
import Reportes from "./reportes";
import HistorialMonitoreo from "./historial-monitoreo";
import MisPuntosWidget from "../mis-puntos-widget";
import EventosDeHoy from "../eventos-hoy";
import {
  LazyRegistro as Registro,
  LazyDocumentos as Documentos,
  LazyCalendario as Calendario,
  LazyHistorialAuditorias as HistorialAuditorias,
  LazyCentralAnalitica as CentralAnalitica,
  LazyMapaOperativo as MapaOperativo,
  LazyConsultorioIA as ConsultorioIA,
  LazyHistoriasFeed as HistoriasFeed,
  LazyMiGaleria as MiGaleria,
} from "../panel-lazy";
import CampanitaDescansos from "./campanita-descansos";
import PanelShell, { type ItemMenuPanel } from "../panel-shell";
import ResumenDelDia from "../resumen-del-dia";
import { hoyPeru } from "@/lib/fechas";

export default function PanelTabs({
  id,
  nombre,
  rol,
  notificacionesPendientes,
}: {
  id: string;
  nombre: string;
  rol: string;
  notificacionesPendientes: number;
}) {
  const items: ItemMenuPanel[] = [
    {
      id: "rutas",
      etiqueta: "Rutas",
      icono: <Truck className="w-4 h-4" />,
      contenido: (
        <div className="space-y-8">
          <AsignarRutas />
          <AsignacionesEspeciales />
        </div>
      ),
    },
    {
      id: "mapa",
      etiqueta: "Mapa",
      icono: <Map className="w-4 h-4" />,
      contenido: <MapaOperativo />,
    },
    {
      id: "mi-ruta",
      etiqueta: "Mi Ruta",
      icono: <MapPin className="w-4 h-4" />,
      contenido: (
        <div className="space-y-6">
          <MisPuntosWidget />
          <EventosDeHoy />
          <SelectorTiendas supervisorNombre={nombre} mostrarDescansoFijo={false} />
          <MisMarcaciones />
          <ChecklistVisita nombreUsuario={nombre} rol={rol} />
        </div>
      ),
    },
    {
      id: "reportes",
      etiqueta: "Reportes",
      icono: <ClipboardList className="w-4 h-4" />,
      contenido: (
        <div className="space-y-6">
          <Reportes />
          <HistorialPdf supervisorNombre={nombre} />
        </div>
      ),
    },
    {
      id: "personal",
      etiqueta: "Personal",
      icono: <Users className="w-4 h-4" />,
      contenido: (
        <div className="space-y-8">
          <EstadoPersonalHoy />
          <TiendasPermanentes />
          <DescansosSemanales />
        </div>
      ),
    },
    { id: "anuncios", etiqueta: "Anuncios", icono: <Megaphone className="w-4 h-4" />, contenido: <Anuncios /> },
    { id: "historial", etiqueta: "Historial y Monitoreo", icono: <History className="w-4 h-4" />, contenido: <HistorialMonitoreo /> },
    { id: "analitica", etiqueta: "Central Analítica", icono: <BarChart3 className="w-4 h-4" />, contenido: <CentralAnalitica /> },
    { id: "registro", etiqueta: "Registro", icono: <Settings className="w-4 h-4" />, contenido: <Registro esCoordinador={true} /> },
    { id: "documentos", etiqueta: "Documentos", icono: <File className="w-4 h-4" />, contenido: <Documentos esAdmin={true} /> },
    {
      id: "calendario",
      etiqueta: "Calendario",
      icono: <Calendar className="w-4 h-4" />,
      contenido: <Calendario modo="completo" hoy={hoyPeru()} />,
    },
    { id: "auditorias", etiqueta: "Auditorías", icono: <Search className="w-4 h-4" />, contenido: <HistorialAuditorias modo="todas" /> },
    { id: "consultorio", etiqueta: "Consultorio IA", icono: <Sparkles className="w-4 h-4" />, contenido: <ConsultorioIA /> },
    {
      id: "galeria",
      etiqueta: "Mi Galería",
      icono: <Images className="w-4 h-4" />,
      contenido: <MiGaleria miUsuarioId={id} miRol={rol} />,
      badge: notificacionesPendientes,
    },
  ];

  return (
    <PanelShell
      nombre={nombre}
      tituloPortal="Coordinador"
      items={items}
      defaultId="rutas"
      accionesExtra={<CampanitaDescansos />}
      encabezado={
        <div className="space-y-4 mb-4">
          <h1 className="font-display text-xl sm:text-2xl text-marca-textofuerte tracking-wide">
            Central <span className="text-marca-rojoclaro italic">Coordinación</span>
          </h1>
          <ResumenDelDia nombre={nombre} rol={rol}>
            <HistoriasFeed miUsuarioId={id} miRol={rol} />
          </ResumenDelDia>
          <PerfilBanner cargarPerfil={obtenerPerfilCoordinador} />
        </div>
      }
      encabezadoGaleria={
        <div className="space-y-4 mb-4">
          <h1 className="font-display text-xl sm:text-2xl text-marca-textofuerte tracking-wide">
            Central <span className="text-marca-rojoclaro italic">Coordinación</span>
          </h1>
          <ResumenDelDia nombre={nombre} rol={rol} ocultarTarjetas />
          <PerfilBanner cargarPerfil={obtenerPerfilCoordinador} />
        </div>
      }
    />
  );
}
