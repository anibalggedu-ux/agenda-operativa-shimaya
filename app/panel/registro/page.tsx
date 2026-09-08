import { obtenerSesion } from "@/lib/session";
import { redirect } from "next/navigation";
import { tieneAccesoRegistro } from "@/lib/permisos";
import { cerrarSesionAction } from "../logout-action";
import Link from "next/link";
import Registro from "./registro";

export const dynamic = "force-dynamic";

export default async function PanelRegistro() {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const permitido = await tieneAccesoRegistro(sesion.id, sesion.rol);
  if (!permitido) redirect(`/panel/${sesion.rol}`);

  return (
    <main className="min-h-screen bg-[#07080c] text-white p-6 sm:p-8 font-mono">
      <div className="flex justify-between items-center border-b border-emerald-500/30 pb-4 mb-6">
        <h1 className="text-xl sm:text-2xl font-black tracking-widest">
          <span className="text-emerald-500">PANEL</span> REGISTRO
        </h1>
        <div className="flex gap-2">
          <Link
            href={`/panel/${sesion.rol}`}
            className="bg-[#181b29] border border-slate-700 px-4 py-2 rounded-lg text-xs font-bold hover:bg-[#22273a] transition"
          >
            ← Volver
          </Link>
          <form action={cerrarSesionAction}>
            <button className="bg-[#181b29] border border-slate-700 px-4 py-2 rounded-lg text-xs font-bold hover:bg-[#22273a] transition">
              Cerrar sesión
            </button>
          </form>
        </div>
      </div>

      <p className="text-slate-400 text-sm mb-6">
        Sesión activa: <span className="text-white font-bold">{sesion.nombre}</span>
      </p>

      <Registro esCoordinador={sesion.rol === "coordinador"} />
    </main>
  );
}
