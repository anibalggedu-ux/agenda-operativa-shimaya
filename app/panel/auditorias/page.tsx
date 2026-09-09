import { obtenerSesion } from "@/lib/session";
import { redirect } from "next/navigation";
import { tieneAccesoAuditoria } from "@/lib/permisos";
import { cerrarSesionAction } from "../logout-action";
import Link from "next/link";
import AuditoriasPanel from "./auditorias-panel";

export const dynamic = "force-dynamic";

export default async function PanelAuditorias() {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const esAdmin = sesion.rol === "coordinador" || sesion.rol === "gerente";
  const puedeAuditar = esAdmin ? false : await tieneAccesoAuditoria(sesion.id);

  if (!esAdmin && !puedeAuditar) redirect(`/panel/${sesion.rol}`);

  return (
    <main className="min-h-screen bg-marca-fondo text-marca-texto p-6 sm:p-8 font-body">
      <div className="flex justify-between items-center border-b border-marca-rojo/25 pb-4 mb-6">
        <h1 className="font-display text-xl sm:text-2xl text-marca-textofuerte tracking-wide">
          Panel <span className="text-marca-rojoclaro italic">Auditorías</span>
        </h1>
        <div className="flex gap-2">
          <Link
            href={`/panel/${sesion.rol}`}
            className="bg-marca-superficie2 border border-marca-borde text-marca-tenue px-4 py-2 rounded-[3px] text-xs font-semibold hover:text-marca-texto transition"
          >
            ← Volver
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

      <AuditoriasPanel esAdmin={esAdmin} puedeAuditar={puedeAuditar} />
    </main>
  );
}
