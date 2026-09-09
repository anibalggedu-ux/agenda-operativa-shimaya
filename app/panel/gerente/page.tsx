import { obtenerSesion } from "@/lib/session";
import { cerrarSesionAction } from "../logout-action";
import { redirect } from "next/navigation";
import Link from "next/link";
import Dashboard from "./dashboard";
import AnunciosWidget from "../anuncios-widget";
import { tieneAccesoRegistro } from "@/lib/permisos";

export const dynamic = "force-dynamic";

export default async function PanelGerente() {
  const sesion = await obtenerSesion();
  if (!sesion || sesion.rol !== "gerente") redirect("/login");

  const accesoRegistro = await tieneAccesoRegistro(sesion.id, sesion.rol);

  return (
    <main className="min-h-screen bg-marca-fondo text-marca-texto p-6 sm:p-8 font-body">
      <div className="flex justify-between items-center border-b border-marca-rojo/25 pb-4 mb-6">
        <h1 className="font-display text-xl sm:text-2xl text-marca-textofuerte tracking-wide">
          Dashboard <span className="text-marca-rojoclaro italic">Gerencial</span>
        </h1>
        <div className="flex gap-2">
          {accesoRegistro && (
            <Link
              href="/panel/registro"
              className="border border-marca-rojo/40 text-marca-rojoclaro px-4 py-2 rounded-[3px] text-xs font-semibold hover:bg-marca-rojo/10 transition"
            >
              📝 Registro
            </Link>
          )}
          <Link
            href="/panel/analitica"
            className="border border-marca-rojo/40 text-marca-rojoclaro px-4 py-2 rounded-[3px] text-xs font-semibold hover:bg-marca-rojo/10 transition"
          >
            📊 Central Analítica
          </Link>
          <Link
            href="/panel/documentos"
            className="border border-marca-rojo/40 text-marca-rojoclaro px-4 py-2 rounded-[3px] text-xs font-semibold hover:bg-marca-rojo/10 transition"
          >
            📄 Documentos
          </Link>
          <Link
            href="/panel/calendario"
            className="border border-marca-rojo/40 text-marca-rojoclaro px-4 py-2 rounded-[3px] text-xs font-semibold hover:bg-marca-rojo/10 transition"
          >
            📅 Calendario
          </Link>
          <form action={cerrarSesionAction}>
            <button className="bg-marca-superficie2 border border-marca-borde text-marca-tenue px-4 py-2 rounded-[3px] text-xs font-semibold hover:text-marca-texto transition">
              Cerrar sesión
            </button>
          </form>
        </div>
      </div>
      <p className="text-marca-tenue text-sm mb-6">
        Sesión activa: <span className="text-marca-textofuerte font-semibold">{sesion.nombre}</span>
      </p>

      <div className="mb-6">
        <AnunciosWidget />
      </div>

      <Dashboard />
    </main>
  );
}
