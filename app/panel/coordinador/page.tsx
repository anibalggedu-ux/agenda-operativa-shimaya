import { obtenerSesion } from "@/lib/session";
import { redirect } from "next/navigation";
import PanelTabs from "./panel-tabs";

export const dynamic = "force-dynamic";

export default async function PanelCoordinador() {
  const sesion = await obtenerSesion();
  if (!sesion || sesion.rol !== "coordinador") redirect("/login");

  return <PanelTabs nombre={sesion.nombre} rol={sesion.rol} />;
}
