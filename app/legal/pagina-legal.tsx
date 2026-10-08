import Link from "next/link";
import type { ReactNode } from "react";

// Estructura común de las páginas legales (públicas, sin sesión): se abren
// desde el login y desde la pantalla de aceptación.
export const FECHA_LEGAL = "8 de octubre de 2026";

export function PaginaLegal({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-marca-fondo px-4 py-8">
      <article className="max-w-2xl mx-auto bg-marca-superficie border border-marca-borde rounded-2xl p-5 sm:p-8">
        <Link href="/login" className="text-[12px] text-marca-rojoclaro font-bold">
          ← Volver
        </Link>
        <h1 className="font-display text-2xl sm:text-3xl text-marca-textofuerte mt-3">{titulo}</h1>
        <p className="text-[11px] text-marca-tenue mt-1 mb-5">
          Agenda Operativa Shimaya · Última actualización: {FECHA_LEGAL}
        </p>
        <div className="space-y-5 text-[13.5px] leading-relaxed text-marca-texto">{children}</div>
        <nav className="mt-8 pt-4 border-t border-marca-borde flex gap-4 text-[12px] text-marca-rojoclaro font-bold">
          <Link href="/terminos">Términos y condiciones</Link>
          <Link href="/privacidad">Política de privacidad</Link>
        </nav>
      </article>
    </main>
  );
}

export function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-display text-base font-bold text-marca-textofuerte">{titulo}</h2>
      {children}
    </section>
  );
}
