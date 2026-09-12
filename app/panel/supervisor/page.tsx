import { obtenerSesion } from "@/lib/session";
import { redirect } from "next/navigation";
import SelectorTiendas from "./selector-tiendas";
import GpsMarcador from "./gps-marcador";
import HistorialPdf from "./historial-pdf";
import MisReportes from "./mis-reportes";
import AnunciosWidget from "../anuncios-widget";
import MisPuntosWidget from "../mis-puntos-widget";
import { tieneAccesoRegistro, tieneAccesoAuditoria } from "@/lib/permisos";
import PerfilBanner from "./perfil-banner";
import TiendasFijas from "./tiendas-fijas";
import MiDescanso from "./mi-descanso";
import MisMarcaciones from "./mis-marcaciones";
import ResumenDelDia from "../resumen-del-dia";
import PanelShell, { type ItemMenuPanel } from "../panel-shell";
import {
  LazyCentralAnalitica as CentralAnalitica,
  LazyDocumentos as Documentos,
  LazyCalendario as Calendario,
  LazyRegistro as Registro,
  LazyAuditoriasPanel as AuditoriasPanel,
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
      icono: "🏠",
      contenido: (
        <div className="space-y-6">
          <PerfilBanner />
          <MiDescanso />
          <MisPuntosWidget />
          <AnunciosWidget />
        </div>
      ),
    },
    {
      id: "asistencia",
      etiqueta: "Asistencia",
      icono: "⏱",
      contenido: (
        <div className="space-y-6">
          <GpsMarcador />
          <MisMarcaciones />
        </div>
      ),
    },
    {
      id: "bitacora",
      etiqueta: "Bitácora de Campo",
      icono: "📍",
      contenido: (
        <div className="space-y-6">
          <TiendasFijas />
          <SelectorTiendas supervisorNombre={sesion.nombre} mostrarDescansoFijo={false} />
        </div>
      ),
    },
    {
      id: "reportes",
      etiqueta: "Mis Reportes",
      icono: "📝",
      contenido: <MisReportes />,
    },
    {
      id: "historial-pdf",
      etiqueta: "Historial PDF",
      icono: "🧾",
      contenido: <HistorialPdf supervisorNombre={sesion.nombre} />,
    },
    {
      id: "analitica",
      etiqueta: "Central Analítica",
      icono: "📊",
      contenido: <CentralAnalitica />,
    },
    {
      id: "documentos",
      etiqueta: "Documentos",
      icono: "📄",
      contenido: <Documentos esAdmin={accesoRegistro} />,
    },
    {
      id: "calendario",
      etiqueta: "Calendario",
      icono: "📅",
      contenido: <Calendario modo="propio" hoy={hoyPeru()} />,
    },
  ];

  if (accesoAuditoria) {
    items.push({
      id: "auditoria",
      etiqueta: "Auditoría",
      icono: "🔍",
      contenido: <AuditoriasPanel esAdmin={false} puedeAuditar={true} />,
    });
  }

  if (accesoRegistro) {
    items.push({
      id: "registro",
      etiqueta: "Registro",
      icono: "📝",
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
          <ResumenDelDia nombre={sesion.nombre} rol={sesion.rol} />
        </>
      }
    />
  );
}
