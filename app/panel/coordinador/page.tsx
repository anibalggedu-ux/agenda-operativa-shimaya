import { obtenerSesion } from "@/lib/session";
import { redirect } from "next/navigation";
import PanelTabs from "./panel-tabs";
import ResumenDelDia from "../resumen-del-dia";

export const dynamic = "force-dynamic";

export default async function PanelCoordinador() {
  const sesion = await obtenerSesion();
  if (!sesion || sesion.rol !== "coordinador") redirect("/login");

  return (
    <main className="min-h-screen bg-marca-fondo text-marca-texto p-4 sm:p-6 font-body">
      <h1 className="font-display text-xl sm:text-2xl text-marca-textofuerte tracking-wide mb-4">
        Central <span className="text-marca-rojoclaro italic">Coordinación</span>
      </h1>

      <ResumenDelDia nombre={sesion.nombre} rol={sesion.rol} />

      <PanelTabs nombre={sesion.nombre} />
    </main>
  );
}
