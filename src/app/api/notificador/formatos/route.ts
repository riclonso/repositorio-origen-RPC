import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { prismaFormatoExcelRepository } from "@/modules/formatos-excel/infrastructure/repositories/PrismaFormatoExcelRepository";
import {
  MENSAJE_ERROR_INTERNO,
  exigirNotificador,
  respuestaError,
  respuestaSinAcceso,
} from "@/app/api/notificador/cargas/_lib/http";

// Formatos activos asignados a la sesión: alimenta el `<select>` de subida. Sin un formato
// asignado, el notificador no puede subir nada. Lectura, no se audita (mismo criterio que el
// listado de `formatos-excel`).
export async function GET() {
  const acceso = await exigirNotificador();

  if (!acceso.ok) {
    return respuestaSinAcceso(acceso.estado);
  }

  try {
    const formatos = await prismaFormatoExcelRepository.listarAsignadosAUsuario(acceso.sesion.sub);
    return NextResponse.json({ datos: formatos });
  } catch (error) {
    logger.error("Error al listar los formatos de archivo asignados a un notificador", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
