import { Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/database/prisma";
import { nombreCompleto } from "@/modules/usuarios/domain/entities/Usuario";
import type { SolicitudReemplazoBioestadistica } from "@/modules/bioestadistica/domain/entities/SolicitudReemplazoBioestadistica";
import type { SolicitudReemplazoBioestadisticaRepository } from "@/modules/bioestadistica/domain/repositories/SolicitudReemplazoBioestadisticaRepository";
import { SolicitudReemplazoDuplicadaError } from "@/modules/solicitudes-reemplazo/domain/errors/SolicitudReemplazoDuplicadaError";

const CODIGO_UNIQUE_VIOLADO = "P2002";
const TOPE_PROPIAS = 500;

// Selección explícita con los joins resueltos (carga, solicitante y revisor): sin N+1.
const SELECCION = {
  id: true,
  cargaBioestadisticaId: true,
  cargaBioestadistica: { select: { anio: true, tipoArchivo: true, nombreArchivoOriginal: true } },
  solicitadoPorId: true,
  solicitadoPor: { select: { nombres: true, apellidos: true, rut: true } },
  motivo: true,
  estado: true,
  revisadoPorId: true,
  revisadoPor: { select: { nombres: true, apellidos: true } },
  revisadoEn: true,
  comentarioRevision: true,
  diasVigencia: true,
  nuevaCargaBioestadisticaId: true,
  utilizadaEn: true,
  createdAt: true,
} as const;

type RegistroSolicitud = Prisma.SolicitudReemplazoBioestadisticaGetPayload<{ select: typeof SELECCION }>;

function aSolicitud(registro: RegistroSolicitud): SolicitudReemplazoBioestadistica {
  return {
    id: registro.id,
    cargaBioestadisticaId: registro.cargaBioestadisticaId,
    anio: registro.cargaBioestadistica.anio,
    tipoArchivo: registro.cargaBioestadistica.tipoArchivo,
    nombreArchivoOriginal: registro.cargaBioestadistica.nombreArchivoOriginal,
    solicitadoPorId: registro.solicitadoPorId,
    solicitadoPorNombre: nombreCompleto(registro.solicitadoPor),
    solicitadoPorRut: registro.solicitadoPor.rut,
    motivo: registro.motivo,
    estado: registro.estado,
    revisadoPorId: registro.revisadoPorId,
    revisadoPorNombre: registro.revisadoPor ? nombreCompleto(registro.revisadoPor) : null,
    revisadoEn: registro.revisadoEn,
    comentarioRevision: registro.comentarioRevision,
    diasVigencia: registro.diasVigencia,
    nuevaCargaBioestadisticaId: registro.nuevaCargaBioestadisticaId,
    utilizadaEn: registro.utilizadaEn,
    createdAt: registro.createdAt,
  };
}

export const prismaSolicitudReemplazoBioestadisticaRepository: SolicitudReemplazoBioestadisticaRepository = {
  async crear(datos) {
    try {
      const registro = await prisma.solicitudReemplazoBioestadistica.create({
        data: {
          cargaBioestadisticaId: datos.cargaBioestadisticaId,
          solicitadoPorId: datos.solicitadoPorId,
          motivo: datos.motivo,
        },
        select: SELECCION,
      });
      return aSolicitud(registro);
    } catch (error) {
      // El único índice único de la tabla (además de la PK) es el parcial de PENDIENTE por carga.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === CODIGO_UNIQUE_VIOLADO) {
        throw new SolicitudReemplazoDuplicadaError();
      }
      throw error;
    }
  },

  async obtenerPorId(id) {
    const registro = await prisma.solicitudReemplazoBioestadistica.findUnique({ where: { id }, select: SELECCION });
    return registro ? aSolicitud(registro) : null;
  },

  async obtenerPendientePorCarga(cargaId) {
    const registro = await prisma.solicitudReemplazoBioestadistica.findFirst({
      where: { cargaBioestadisticaId: cargaId, estado: "PENDIENTE" },
      select: SELECCION,
    });
    return registro ? aSolicitud(registro) : null;
  },

  async obtenerAprobadaSinUsarPorCarga(cargaId) {
    const registro = await prisma.solicitudReemplazoBioestadistica.findFirst({
      where: { cargaBioestadisticaId: cargaId, estado: "APROBADA", utilizadaEn: null },
      orderBy: { revisadoEn: "desc" },
      select: SELECCION,
    });
    return registro ? aSolicitud(registro) : null;
  },

  async listarPropias(usuarioId) {
    const registros = await prisma.solicitudReemplazoBioestadistica.findMany({
      where: { solicitadoPorId: usuarioId },
      select: SELECCION,
      orderBy: { createdAt: "desc" },
      take: TOPE_PROPIAS,
    });
    return registros.map(aSolicitud);
  },

  async listarParaRevision(filtro) {
    const where = filtro.estado ? { estado: filtro.estado } : {};

    const [registros, total] = await Promise.all([
      prisma.solicitudReemplazoBioestadistica.findMany({
        where,
        select: SELECCION,
        orderBy: { createdAt: "desc" },
        skip: (filtro.pagina - 1) * filtro.tamano,
        take: filtro.tamano,
      }),
      prisma.solicitudReemplazoBioestadistica.count({ where }),
    ]);

    return { filas: registros.map(aSolicitud), total };
  },

  async revisar(id, datos) {
    // `updateMany` con `estado = PENDIENTE` en el `WHERE`: si otra petición ya la resolvió no toca
    // ninguna fila (mismo patrón que `PrismaSolicitudReemplazoCargaRepository.revisar`).
    const resultado = await prisma.solicitudReemplazoBioestadistica.updateMany({
      where: { id, estado: "PENDIENTE" },
      data: {
        estado: datos.estado,
        revisadoPorId: datos.revisadoPorId,
        revisadoEn: new Date(),
        comentarioRevision: datos.comentarioRevision,
        diasVigencia: datos.diasVigencia,
      },
    });

    if (resultado.count === 0) return null;

    const registro = await prisma.solicitudReemplazoBioestadistica.findUnique({ where: { id }, select: SELECCION });
    return registro ? aSolicitud(registro) : null;
  },
};
