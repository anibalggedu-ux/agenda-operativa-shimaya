"use server";

import { cerrarSesion } from "@/lib/session";
import { redirect } from "next/navigation";

export async function cerrarSesionAction() {
  await cerrarSesion();
  redirect("/login");
}
