import { prisma } from "@/infrastructure/database/prisma";
import type { NotificacionRevision, NotificacionRevisionRepository } from "../domain/NotificacionRevision";
import { TAMANO_PAGINA_NOTIFICACIONES, paginarNotificaciones } from "../application/ListarNotificacionesRevision";

export const prismaNotificacionRevisionRepository: NotificacionRevisionRepository = {
  async listar(pagina) {
    const limite = pagina * TAMANO_PAGINA_NOTIFICACIONES;
    const cargaWhere = { estado: "PENDIENTE_VISTO_BUENO" as const, finalizadaEn: { not: null } };
    const solicitudWhere = { estado: "PENDIENTE" as const };
    // Nunca trae los binarios, filas clínicas ni motivos privados. Orden y conteo en una lectura consistente.
    const [cargas, solicitudes, totalCargas, totalSolicitudes] = await prisma.$transaction([
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
    ], { isolationLevel: "RepeatableRead" });
    const avisos: NotificacionRevision[] = [
      ...cargas.map(c => ({ id: `archivo-${c.id}`, nombre: `${c.usuario.nombres} ${c.usuario.apellidos}`, accion: "ARCHIVO_ENVIADO" as const, ventanaCargaId: c.ventanaCargaId, fecha: c.finalizadaEn!.toISOString() })),
      ...solicitudes.map(s => ({ id: `reemplazo-${s.id}`, nombre: `${s.solicitadoPor.nombres} ${s.solicitadoPor.apellidos}`, accion: "REEMPLAZO_SOLICITADO" as const, ventanaCargaId: s.cargaArchivo.ventanaCargaId, fecha: s.createdAt.toISOString() })),
    ];
    return { notificaciones: paginarNotificaciones(avisos, pagina), total: totalCargas + totalSolicitudes };
  },
};
