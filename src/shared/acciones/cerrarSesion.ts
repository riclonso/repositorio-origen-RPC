"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { deleteCookie } from "cookies-next/server";
import { logger } from "@/infrastructure/logging/logger";

// Server Action transversal: la usan tanto el panel de administración como el del notificador, por
// eso vive en `shared/acciones/` y no dentro de `app/dashboard/`. Es una mutación trivial sin caso
// de uso propio (solo borra la cookie y redirige), así que se deja como Server Action.
export async function cerrarSesionAction() {
  try {
    await deleteCookie("sesion", { cookies, path: "/" });
  } catch (error) {
    logger.error("Error al cerrar sesión", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  redirect("/login");
}
