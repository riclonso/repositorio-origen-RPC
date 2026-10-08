import { directorioArchivosCargas, directorioArchivosBioestadistica } from "@/infrastructure/config/env";
import { logger } from "@/infrastructure/logging/logger";
import { detalleErrorSeguro } from "@/infrastructure/logging/detalleErrorSeguro";
import { crearSesionesSubidaDisco } from "./SesionesSubidaDisco";
export async function limpiarSubidasExpiradas(): Promise<void> {
  for (const obtenerBase of [directorioArchivosCargas,directorioArchivosBioestadistica]) {
    try { await crearSesionesSubidaDisco(obtenerBase).limpiar(); }
    catch (error) { logger.error("Error al limpiar subidas expiradas",detalleErrorSeguro(error)); }
  }
}
