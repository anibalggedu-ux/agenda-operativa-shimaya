import { obtenerSesion } from "@/lib/session";
import { redirect } from "next/navigation";
import { Home, Map, BarChart3, File, Calendar, Search, Settings } from "lucide-react";
import Dashboard from "./dashboard";
import AnunciosWidget from "../anuncios-widget";
import { tieneAccesoRegistro } from "@/lib/permisos";
import ResumenDelDia from "../resumen-del-dia";
import PanelShell, { type ItemMenuPanel } from "../panel-shell";
import {
  LazyCentralAnalitica as CentralAnalitica,
  LazyDocumentos as Documentos,
  LazyCalendario as Calendario,
  LazyRegistro as Registro,
  LazyHistorialAuditorias as HistorialAuditorias,
  LazyMapaOperativo as MapaOperativo,
} from "../panel-lazy";
import { hoyPeru } from "@/lib/fechas";

export const dynamic = "force-dynamic";

export default async function PanelGerente() {
  const sesion = await obtenerSesion();
  if (!sesion || sesion.rol !== "gerente") redirect("/login");

  const accesoRegistro = await tieneAccesoRegistro(sesion.id, sesion.rol);

  const items: ItemMenuPanel[] = [
    {
      id: "inicio",
      etiqueta: "Inicio",
      icono: Home,
      contenido: (
        <div className="space-y-6">
          <Dashboard />
          <AnunciosWidget />
        </div>
      ),
    },
    {
      id: "mapa",
      etiqueta: "Mapa",
      icono: Map,
      contenido: <MapaOperativo />,
    },
    {
      id: "analitica",
      etiqueta: "Central Analítica",
      icono: BarChart3,
      contenido: <CentralAnalitica />,
    },
    {
      id: "documentos",
      etiqueta: "Documentos",
      icono: File,
      contenido: <Documentos esAdmin={accesoRegistro} />,
    },
    {
      id: "calendario",
      etiqueta: "Calendario",
      icono: Calendar,
      contenido: <Calendario modo="completo" hoy={hoyPeru()} />,
    },
    {
      id: "auditorias",
      etiqueta: "Auditorías",
      icono: Search,
      contenido: <HistorialAuditorias modo="todas" />,
    },
  ];

  if (accesoRegistro) {
    items.push({
      id: "registro",
      etiqueta: "Registro",
      icono: Settings,
      contenido: <Registro esCoordinador={false} />,
    });
  }

  return (
    <PanelShell
      nombre={sesion.nombre}
      tituloPortal="Gerente"
      items={items}
      defaultId="inicio"
      encabezado={
        <>
          <h1 className="font-display text-xl sm:text-2xl text-marca-textofuerte tracking-wide mb-4">
            Dashboard <span className="text-marca-rojoclaro italic">Gerencial</span>
          </h1>
          <ResumenDelDia nombre={sesion.nombre} rol={sesion.rol} />
        </>
      }
    />
  );
}
