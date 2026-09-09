"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { deleteCookie } from "cookies-next/server";
import { logger } from "@/infrastructure/logging/logger";

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
