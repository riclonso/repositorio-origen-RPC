import { NextResponse } from "next/server";
import { exigirAdminORevisor, respuestaSinAcceso } from "@/app/api/_lib/http";
import { listarNotificacionesRevision } from "@/modules/notificaciones/application/ListarNotificacionesRevision";
import { prismaNotificacionRevisionRepository } from "@/modules/notificaciones/infrastructure/PrismaNotificacionRevisionRepository";
import { logger } from "@/infrastructure/logging/logger";

export async function GET(request: Request) {
  const acceso = await exigirAdminORevisor();
  if (!acceso.ok) return respuestaSinAcceso(acceso.estado);
  const pagina = Number(new URL(request.url).searchParams.get("pagina") ?? "1");
  if (!Number.isSafeInteger(pagina) || pagina < 1 || pagina > 2500) {
    return NextResponse.json({ error: "Página inválida" }, { status: 400 });
  }
  try {
    return NextResponse.json(await listarNotificacionesRevision(pagina, prismaNotificacionRevisionRepository), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    logger.error("Error al listar notificaciones", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "No se pudieron cargar las notificaciones." }, { status: 500 });
  }
}
