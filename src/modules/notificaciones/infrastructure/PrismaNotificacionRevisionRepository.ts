import { prisma } from "@/infrastructure/database/prisma";
import type { NotificacionRevision, NotificacionRevisionRepository } from "../domain/NotificacionRevision";
import { TAMANO_PAGINA_NOTIFICACIONES, paginarNotificaciones } from "../application/ListarNotificacionesRevision";

export const prismaNotificacionRevisionRepository: NotificacionRevisionRepository = {
  async listar(pagina, usuarioId) {
    const limite = pagina * TAMANO_PAGINA_NOTIFICACIONES;
    const cargaWhere = { estado: "PENDIENTE_VISTO_BUENO" as const, finalizadaEn: { not: null } };
    const solicitudWhere = { estado: "PENDIENTE" as const };
    // Nunca trae los binarios, filas clínicas ni motivos privados. Orden y conteo en una lectura consistente.
    const [cargas, solicitudes, totalCargas, totalSolicitudes, lecturas, conteo] = await prisma.$transaction([
      prisma.cargaArchivo.findMany({ where: cargaWhere, take: limite,
        orderBy: [{ finalizadaEn: "desc" }, { id: "desc" }],
        select: { id: true, finalizadaEn: true, ventanaCargaId: true, usuario: { select: { nombres: true, apellidos: true } } },
      }),
      prisma.solicitudReemplazoCarga.findMany({ where: solicitudWhere, take: limite,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true, createdAt: true, solicitadoPor: { select: { nombres: true, apellidos: true } }, cargaArchivo: { select: { ventanaCargaId: true } } },
      }),
      prisma.cargaArchivo.count({ where: cargaWhere }),
      prisma.solicitudReemplazoCarga.count({ where: solicitudWhere }),
      prisma.lecturaNotificacion.findMany({ where: { usuarioId }, select: { avisoId: true, eventoFecha: true } }),
      prisma.$queryRaw<{ cantidad: bigint }[]>`
        SELECT COUNT(*) AS cantidad FROM (
          SELECT 'archivo-' || c.id AS id, c."finalizadaEn" AS fecha
          FROM carga_archivo c WHERE c.estado = 'PENDIENTE_VISTO_BUENO' AND c."finalizadaEn" IS NOT NULL
          UNION ALL
          SELECT 'reemplazo-' || s.id AS id, s."createdAt" AS fecha
          FROM solicitud_reemplazo_carga s WHERE s.estado = 'PENDIENTE'
        ) avisos WHERE NOT EXISTS (
          SELECT 1 FROM lectura_notificacion l WHERE l."usuarioId" = ${usuarioId}
          AND l."avisoId" = avisos.id AND l."eventoFecha" = avisos.fecha
        )
      `,
    ], { isolationLevel: "RepeatableRead" });
    const leidas = new Set(lecturas.map(l => `${l.avisoId}|${l.eventoFecha.toISOString()}`));
    const avisos: NotificacionRevision[] = [
      ...cargas.map(c => ({ id: `archivo-${c.id}`, nombre: `${c.usuario.nombres} ${c.usuario.apellidos}`, accion: "ARCHIVO_ENVIADO" as const, ventanaCargaId: c.ventanaCargaId, leido: leidas.has(`archivo-${c.id}|${c.finalizadaEn!.toISOString()}`), fecha: c.finalizadaEn!.toISOString() })),
      ...solicitudes.map(s => ({ id: `reemplazo-${s.id}`, nombre: `${s.solicitadoPor.nombres} ${s.solicitadoPor.apellidos}`, accion: "REEMPLAZO_SOLICITADO" as const, ventanaCargaId: s.cargaArchivo.ventanaCargaId, leido: leidas.has(`reemplazo-${s.id}|${s.createdAt.toISOString()}`), fecha: s.createdAt.toISOString() })),
    ];
    return { notificaciones: paginarNotificaciones(avisos, pagina), total: totalCargas + totalSolicitudes, noLeidas: Number(conteo[0].cantidad) };
  },
  async marcarLeida(usuarioId, avisoId, fecha) {
    const esArchivo = avisoId.startsWith("archivo-");
    const id = avisoId.slice(esArchivo ? 8 : 10);
    const evento = esArchivo
      ? await prisma.cargaArchivo.findFirst({ where: { id, estado: "PENDIENTE_VISTO_BUENO", finalizadaEn: fecha }, select: { id: true } })
      : await prisma.solicitudReemplazoCarga.findFirst({ where: { id, estado: "PENDIENTE", createdAt: fecha }, select: { id: true } });
    if (!evento) return false;
    await prisma.lecturaNotificacion.upsert({
      where: { usuarioId_avisoId_eventoFecha: { usuarioId, avisoId, eventoFecha: fecha } },
      create: { usuarioId, avisoId, eventoFecha: fecha }, update: {},
    });
    return true;
  },
};
