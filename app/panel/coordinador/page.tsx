import { obtenerSesion } from "@/lib/session";
import { redirect } from "next/navigation";
import PanelTabs from "./panel-tabs";
import { obtenerNotificacionesPendientes } from "../historias/social-actions";

export const dynamic = "force-dynamic";

export default async function PanelCoordinador() {
  const sesion = await obtenerSesion();
  if (!sesion || sesion.rol !== "coordinador") redirect("/login");
  const notificacionesPendientes = await obtenerNotificacionesPendientes().catch(() => 0);

  return (
    <PanelTabs id={sesion.id} nombre={sesion.nombre} rol={sesion.rol} notificacionesPendientes={notificacionesPendientes} />
  );
}
