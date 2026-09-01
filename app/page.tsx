import { redirect } from "next/navigation";
import { obtenerSesion } from "@/lib/session";

export default async function Home() {
  const sesion = await obtenerSesion();
  if (sesion) redirect(`/panel/${sesion.rol}`);
  redirect("/login");
}
