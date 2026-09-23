import { Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/database/prisma";
import { nombreCompleto } from "@/modules/usuarios/domain/entities/Usuario";
import type { SolicitudReemplazoCargaRepository } from "@/modules/solicitudes-reemplazo/domain/repositories/SolicitudReemplazoCargaRepository";
import {
  solicitudUtilizable,
  type SolicitudReemplazoCarga,
} from "@/modules/solicitudes-reemplazo/domain/entities/SolicitudReemplazoCarga";
import { SolicitudReemplazoDuplicadaError } from "@/modules/solicitudes-reemplazo/domain/errors/SolicitudReemplazoDuplicadaError";

const CODIGO_UNIQUE_VIOLADO = "P2002";

// Selección explícita con los joins ya resueltos: ningún listado de este repositorio produce N+1,
// mismo patrón que `PrismaCargaArchivoRepository`.
const SELECCION = {
  id: true,
  cargaArchivoId: true,
  cargaArchivo: {
    select: {
      nombreArchivoOriginal: true,
      formatoExcel: { select: { nombre: true } },
      ventanaCarga: { select: { anio: true } },
    },
  },
  solicitadoPorId: true,
  solicitadoPor: { select: { nombres: true, apellidos: true, rut: true } },
  motivo: true,
  estado: true,
  revisadoPorId: true,
  revisadoPor: { select: { nombres: true, apellidos: true } },
  revisadoEn: true,
  comentarioRevision: true,
  nuevaCargaArchivoId: true,
  utilizadaEn: true,
  createdAt: true,
  updatedAt: true,
} as const;

type RegistroSolicitud = Prisma.SolicitudReemplazoCargaGetPayload<{ select: typeof SELECCION }>;

function aSolicitudReemplazoCarga(registro: RegistroSolicitud): SolicitudReemplazoCarga {
  return {
    id: registro.id,
    cargaArchivoId: registro.cargaArchivoId,
    formatoExcelNombre: registro.cargaArchivo.formatoExcel.nombre,
    anio: registro.cargaArchivo.ventanaCarga.anio,
    nombreArchivoOriginal: registro.cargaArchivo.nombreArchivoOriginal,
    solicitadoPorId: registro.solicitadoPorId,
    solicitadoPorNombre: nombreCompleto(registro.solicitadoPor),
    solicitadoPorRut: registro.solicitadoPor.rut,
    motivo: registro.motivo,
    estado: registro.estado,
    revisadoPorId: registro.revisadoPorId,
    revisadoPorNombre: registro.revisadoPor ? nombreCompleto(registro.revisadoPor) : null,
    revisadoEn: registro.revisadoEn,
    comentarioRevision: registro.comentarioRevision,
    nuevaCargaArchivoId: registro.nuevaCargaArchivoId,
    utilizadaEn: registro.utilizadaEn,
    createdAt: registro.createdAt,
    updatedAt: registro.updatedAt,
  };
}

export const prismaSolicitudReemplazoCargaRepository: SolicitudReemplazoCargaRepository = {
  async crear(datos) {
    try {
      const registro = await prisma.solicitudReemplazoCarga.create({
        data: {
          cargaArchivoId: datos.cargaArchivoId,
          solicitadoPorId: datos.solicitadoPorId,
          motivo: datos.motivo,
        },
        select: SELECCION,
      });

      return aSolicitudReemplazoCarga(registro);
    } catch (error) {
      // El único índice único de esta tabla (además de la clave primaria) es el parcial sobre
      // `cargaArchivoId` mientras `estado = PENDIENTE`, agregado a mano en la migración: un P2002
      // aquí solo puede significar esa carrera.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === CODIGO_UNIQUE_VIOLADO) {
        throw new SolicitudReemplazoDuplicadaError();
      }
      throw error;
    }
  },

  async obtenerPorId(id) {
    const registro = await prisma.solicitudReemplazoCarga.findUnique({ where: { id }, select: SELECCION });
    return registro ? aSolicitudReemplazoCarga(registro) : null;
  },

  async obtenerPorNuevaCargaArchivoId(nuevaCargaArchivoId) {
    const registro = await prisma.solicitudReemplazoCarga.findFirst({
      where: { nuevaCargaArchivoId },
      select: SELECCION,
    });
    return registro ? aSolicitudReemplazoCarga(registro) : null;
  },

  async obtenerPendientePorCarga(cargaArchivoId) {
    const registro = await prisma.solicitudReemplazoCarga.findFirst({
      where: { cargaArchivoId, estado: "PENDIENTE" },
      select: SELECCION,
    });
    return registro ? aSolicitudReemplazoCarga(registro) : null;
  },

  async obtenerAprobadaUtilizablePorCarga(cargaArchivoId, ahora) {
    // Filtra en SQL lo barato (estado + no usada); la vigencia por fecha (`solicitudUtilizable`)
    // se evalúa en `application/` sobre el registro ya traído, para no duplicar esa regla en SQL.
    // Como mucho puede haber una fila que cumpla (el índice único parcial solo cubre `PENDIENTE`,
    // pero una `APROBADA` sin usar tampoco se vuelve a crear mientras sea utilizable, ver
    // `SolicitarReemplazoCarga`), así que basta `findFirst` ordenado por la más reciente.
    const registro = await prisma.solicitudReemplazoCarga.findFirst({
      where: { cargaArchivoId, estado: "APROBADA", utilizadaEn: null },
      orderBy: { revisadoEn: "desc" },
      select: SELECCION,
    });

    if (!registro) return null;

    const solicitud = aSolicitudReemplazoCarga(registro);
    // Reutiliza la misma regla de vigencia del dominio (`solicitudUtilizable`), en vez de
    // reimplementar la aritmética de fechas aquí: una sola fuente de verdad para "5 días desde
    // `revisadoEn`".
    return solicitudUtilizable(solicitud, ahora) ? solicitud : null;
  },

  async listarPropias(usuarioId) {
    const registros = await prisma.solicitudReemplazoCarga.findMany({
      where: { solicitadoPorId: usuarioId },
      select: SELECCION,
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    return registros.map(aSolicitudReemplazoCarga);
  },

  async listarParaRevision(filtro) {
    const where = {
      ...(filtro.estado ? { estado: filtro.estado } : {}),
    };

    const [registros, total] = await prisma.$transaction([
      prisma.solicitudReemplazoCarga.findMany({
        where,
        select: SELECCION,
        orderBy: { createdAt: "desc" },
        skip: (filtro.pagina - 1) * filtro.tamano,
        take: filtro.tamano,
      }),
      prisma.solicitudReemplazoCarga.count({ where }),
    ]);

    return { filas: registros.map(aSolicitudReemplazoCarga), total };
  },

  async revisar(id, datos) {
    // `updateMany` con `estado = PENDIENTE` en el mismo `WHERE`: si ya fue resuelta por otra
    // petición concurrente, no toca ninguna fila. Mismo patrón que
    // `PrismaCargaArchivoRepository.darVistoBueno`.
    const resultado = await prisma.solicitudReemplazoCarga.updateMany({
      where: { id, estado: "PENDIENTE" },
      data: {
        estado: datos.estado,
        revisadoPorId: datos.revisadoPorId,
        revisadoEn: new Date(),
        comentarioRevision: datos.comentarioRevision,
      },
    });

    if (resultado.count === 0) return null;

    const registro = await prisma.solicitudReemplazoCarga.findUnique({ where: { id }, select: SELECCION });
    return registro ? aSolicitudReemplazoCarga(registro) : null;
  },
};
