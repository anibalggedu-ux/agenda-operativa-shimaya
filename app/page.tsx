import { redirect } from "next/navigation";
import { obtenerSesion } from "@/lib/session";

// Puerta de entrada única e independiente del rol — así un link de correo
// (ej. "ver resultado de la auditoría") funciona para cualquier destinatario
// sin importar su portal: cada quien cae en su propio /panel/<rol> con los
// mismos parámetros de la URL (?seccion=..., ?auditoriaId=...) intactos.
export default async function Home({
  searchParams,
}: {
  searchParams: { [clave: string]: string | string[] | undefined };
}) {
  const sesion = await obtenerSesion();
  const parametros = new URLSearchParams();
  Object.entries(searchParams).forEach(([clave, valor]) => {
    if (typeof valor === "string") parametros.set(clave, valor);
  });
  const sufijo = parametros.toString() ? `?${parametros.toString()}` : "";

  if (sesion) redirect(`/panel/${sesion.rol}${sufijo}`);
  redirect(`/login${sufijo}`);
}
