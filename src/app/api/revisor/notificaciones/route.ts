import { z } from "zod";
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
    return NextResponse.json(await listarNotificacionesRevision(pagina, acceso.sesion.sub, prismaNotificacionRevisionRepository), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    logger.error("Error al listar notificaciones", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "No se pudieron cargar las notificaciones." }, { status: 500 });
  }
}

const lecturaSchema = z.object({
  id: z.string().regex(/^(archivo|reemplazo)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  fecha: z.iso.datetime(),
});

export async function PATCH(request: Request) {
  const acceso = await exigirAdminORevisor();
  if (!acceso.ok) return respuestaSinAcceso(acceso.estado);
  const datos = lecturaSchema.safeParse(await request.json().catch(() => null));
  if (!datos.success) return NextResponse.json({ error: "Aviso inválido" }, { status: 400 });
  try {
    const existe = await prismaNotificacionRevisionRepository.marcarLeida(acceso.sesion.sub, datos.data.id, new Date(datos.data.fecha));
    return existe ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: "El aviso ya no está disponible" }, { status: 404 });
  } catch (error) {
    logger.error("Error al marcar notificación leída", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "No se pudo marcar la notificación como leída." }, { status: 500 });
  }
}
