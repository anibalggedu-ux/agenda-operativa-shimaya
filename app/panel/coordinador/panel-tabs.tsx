"use client";

import { Truck, MapPin, ClipboardList, Users, Megaphone, History, BarChart3, Settings, File, Calendar, Search } from "lucide-react";
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
import {
  LazyRegistro as Registro,
  LazyDocumentos as Documentos,
  LazyCalendario as Calendario,
  LazyHistorialAuditorias as HistorialAuditorias,
  LazyCentralAnalitica as CentralAnalitica,
} from "../panel-lazy";
import CampanitaDescansos from "./campanita-descansos";
import PanelShell, { type ItemMenuPanel } from "../panel-shell";
import ResumenDelDia from "../resumen-del-dia";
import { hoyPeru } from "@/lib/fechas";

export default function PanelTabs({ nombre, rol }: { nombre: string; rol: string }) {
  const items: ItemMenuPanel[] = [
    {
      id: "rutas",
      etiqueta: "Rutas",
      icono: Truck,
      contenido: (
        <div className="space-y-8">
          <AsignarRutas />
          <AsignacionesEspeciales />
        </div>
      ),
    },
    {
      id: "mi-ruta",
      etiqueta: "Mi Ruta",
      icono: MapPin,
      contenido: (
        <div className="space-y-6">
          <MisPuntosWidget />
          <SelectorTiendas supervisorNombre={nombre} mostrarDescansoFijo={false} />
          <MisMarcaciones />
          <ChecklistVisita nombreUsuario={nombre} rol={rol} />
        </div>
      ),
    },
    {
      id: "reportes",
      etiqueta: "Reportes",
      icono: ClipboardList,
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
      icono: Users,
      contenido: (
        <div className="space-y-8">
          <EstadoPersonalHoy />
          <TiendasPermanentes />
          <DescansosSemanales />
        </div>
      ),
    },
    { id: "anuncios", etiqueta: "Anuncios", icono: Megaphone, contenido: <Anuncios /> },
    { id: "historial", etiqueta: "Historial y Monitoreo", icono: History, contenido: <HistorialMonitoreo /> },
    { id: "analitica", etiqueta: "Central Analítica", icono: BarChart3, contenido: <CentralAnalitica /> },
    { id: "registro", etiqueta: "Registro", icono: Settings, contenido: <Registro esCoordinador={true} /> },
    { id: "documentos", etiqueta: "Documentos", icono: File, contenido: <Documentos esAdmin={true} /> },
    {
      id: "calendario",
      etiqueta: "Calendario",
      icono: Calendar,
      contenido: <Calendario modo="completo" hoy={hoyPeru()} />,
    },
    { id: "auditorias", etiqueta: "Auditorías", icono: Search, contenido: <HistorialAuditorias modo="todas" /> },
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
          <ResumenDelDia nombre={nombre} rol={rol} />
          <PerfilBanner cargarPerfil={obtenerPerfilCoordinador} />
        </div>
      }
    />
  );
}
