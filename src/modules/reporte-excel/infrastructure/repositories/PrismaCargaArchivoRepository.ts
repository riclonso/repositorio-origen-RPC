import { prisma } from "@/infrastructure/database/prisma";
import { nombreCompleto } from "@/modules/usuarios/domain/entities/Usuario";
import type { CargaArchivoRepository } from "@/modules/reporte-excel/domain/repositories/CargaArchivoRepository";
import type {
  CargaArchivo,
  DatosNuevaCargaArchivo,
  ErrorCargaArchivo,
} from "@/modules/reporte-excel/domain/entities/CargaArchivo";

const SELECCION_ERROR = {
  id: true,
  numeroFila: true,
  columna: true,
  tipoError: true,
  mensaje: true,
} as const;

const SELECCION_DETALLE = {
  id: true,
  formatoExcelId: true,
  formatoExcel: { select: { nombre: true } },
  ventanaCargaId: true,
  ventanaCarga: { select: { anio: true } },
  usuarioId: true,
  usuario: { select: { nombres: true, apellidos: true, rut: true } },
  nombreArchivoOriginal: true,
  tipoContenidoArchivo: true,
  cantidadFilasDatos: true,
  cantidadErrores: true,
  estado: true,
  vistoBuenoEn: true,
  vistoBuenoPorId: true,
  createdAt: true,
  updatedAt: true,
  errores: { select: SELECCION_ERROR, orderBy: { numeroFila: "asc" } },
} as const;

// El listado (propio o de aprobadas) nunca trae `errores` ni el binario: es la vista liviana
// equivalente a `FormatoExcelResumen`.
const SELECCION_RESUMEN = {
  id: true,
  formatoExcelId: true,
  formatoExcel: { select: { nombre: true } },
  ventanaCargaId: true,
  ventanaCarga: { select: { anio: true } },
  usuario: { select: { nombres: true, apellidos: true, rut: true } },
  nombreArchivoOriginal: true,
  cantidadFilasDatos: true,
  cantidadErrores: true,
  estado: true,
  vistoBuenoEn: true,
  createdAt: true,
} as const;

type RegistroDetalle = {
  id: string;
  formatoExcelId: string;
  formatoExcel: { nombre: string };
  ventanaCargaId: string;
  ventanaCarga: { anio: number };
  usuarioId: string;
  usuario: { nombres: string; apellidos: string; rut: string };
  nombreArchivoOriginal: string;
  tipoContenidoArchivo: string;
  cantidadFilasDatos: number;
  cantidadErrores: number;
  estado: CargaArchivo["estado"];
  vistoBuenoEn: Date | null;
  vistoBuenoPorId: string | null;
  createdAt: Date;
  updatedAt: Date;
  errores: ErrorCargaArchivo[];
};

type RegistroResumen = Omit<
  RegistroDetalle,
  "usuarioId" | "tipoContenidoArchivo" | "vistoBuenoPorId" | "updatedAt" | "errores"
>;

function aCargaArchivo(registro: RegistroDetalle): CargaArchivo {
  return {
    id: registro.id,
    formatoExcelId: registro.formatoExcelId,
    formatoExcelNombre: registro.formatoExcel.nombre,
    ventanaCargaId: registro.ventanaCargaId,
    anio: registro.ventanaCarga.anio,
    usuarioId: registro.usuarioId,
    usuarioNombre: nombreCompleto(registro.usuario),
    usuarioRut: registro.usuario.rut,
    nombreArchivoOriginal: registro.nombreArchivoOriginal,
    tipoContenidoArchivo: registro.tipoContenidoArchivo,
    cantidadFilasDatos: registro.cantidadFilasDatos,
    cantidadErrores: registro.cantidadErrores,
    estado: registro.estado,
    vistoBuenoEn: registro.vistoBuenoEn,
    vistoBuenoPorId: registro.vistoBuenoPorId,
    createdAt: registro.createdAt,
    updatedAt: registro.updatedAt,
    errores: registro.errores,
  };
}

function aCargaArchivoResumen(registro: RegistroResumen) {
  return {
    id: registro.id,
    formatoExcelId: registro.formatoExcelId,
    formatoExcelNombre: registro.formatoExcel.nombre,
    ventanaCargaId: registro.ventanaCargaId,
    anio: registro.ventanaCarga.anio,
    usuarioNombre: nombreCompleto(registro.usuario),
    usuarioRut: registro.usuario.rut,
    nombreArchivoOriginal: registro.nombreArchivoOriginal,
    cantidadFilasDatos: registro.cantidadFilasDatos,
    cantidadErrores: registro.cantidadErrores,
    estado: registro.estado,
    vistoBuenoEn: registro.vistoBuenoEn,
    createdAt: registro.createdAt,
  };
}

export const prismaCargaArchivoRepository: CargaArchivoRepository = {
  async crear(datos: DatosNuevaCargaArchivo) {
    // Nido de una sola escritura: Prisma crea la carga y sus errores en una única operación
    // atómica, mismo patrón que `PrismaFormatoExcelRepository.crear`.
    const registro = await prisma.cargaArchivo.create({
      data: {
        formatoExcelId: datos.formatoExcelId,
        ventanaCargaId: datos.ventanaCargaId,
        usuarioId: datos.usuarioId,
        nombreArchivoOriginal: datos.nombreArchivoOriginal,
        tipoContenidoArchivo: datos.tipoContenidoArchivo,
        // Mismo motivo que `FormatoExcel.contenidoPlantilla`: `Uint8Array.from` produce el tipo
        // exacto que exige el campo `Bytes` generado por Prisma.
        contenidoArchivo: Uint8Array.from(datos.contenidoArchivo),
        cantidadFilasDatos: datos.cantidadFilasDatos,
        cantidadErrores: datos.cantidadErrores,
        estado: datos.estado,
        errores: {
          create: datos.errores.map((error) => ({
            numeroFila: error.numeroFila,
            columna: error.columna,
            tipoError: error.tipoError,
            mensaje: error.mensaje,
          })),
        },
      },
      select: SELECCION_DETALLE,
    });

    return aCargaArchivo(registro);
  },

  async obtenerPorId(id) {
    const registro = await prisma.cargaArchivo.findUnique({ where: { id }, select: SELECCION_DETALLE });
    return registro ? aCargaArchivo(registro) : null;
  },

  async obtenerPropiaPorId(id, usuarioId) {
    const registro = await prisma.cargaArchivo.findFirst({ where: { id, usuarioId }, select: SELECCION_DETALLE });
    return registro ? aCargaArchivo(registro) : null;
  },

  async obtenerAprobadaPorId(id) {
    const registro = await prisma.cargaArchivo.findFirst({
      where: { id, estado: "APROBADA" },
      select: SELECCION_DETALLE,
    });
    return registro ? aCargaArchivo(registro) : null;
  },

  async listarPropias(filtro) {
    const where = {
      usuarioId: filtro.usuarioId,
      ...(filtro.estado ? { estado: filtro.estado } : {}),
      ...(filtro.formatoExcelId ? { formatoExcelId: filtro.formatoExcelId } : {}),
    };

    const [registros, total] = await prisma.$transaction([
      prisma.cargaArchivo.findMany({
        where,
        select: SELECCION_RESUMEN,
        orderBy: { createdAt: "desc" },
        skip: (filtro.pagina - 1) * filtro.tamano,
        take: filtro.tamano,
      }),
      prisma.cargaArchivo.count({ where }),
    ]);

    return { filas: registros.map(aCargaArchivoResumen), total };
  },

  async listarPropiasAprobadas(usuarioId) {
    // Ownership (`usuarioId`) y `estado = APROBADA` siempre en el mismo `WHERE`, nunca filtrado en
    // JS después. Tope defensivo (no paginado): evita traer un histórico sin límite si un
    // notificador acumula miles de correcciones sucesivas; la agrupación/paginación de GRUPOS vive
    // en `application/ListarCargasPropiasExitosas.ts`.
    const registros = await prisma.cargaArchivo.findMany({
      where: { usuarioId, estado: "APROBADA" },
      select: SELECCION_RESUMEN,
      orderBy: { vistoBuenoEn: "desc" },
      take: 500,
    });

    return registros.map(aCargaArchivoResumen);
  },

  async listarAprobadas(filtro) {
    // El filtro `estado = APROBADA` se aplica siempre aquí, a nivel de consulta SQL, nunca solo
    // en la UI: `/api/dashboard/cargas/*` depende de esta garantía.
    const where = {
      estado: "APROBADA" as const,
      ...(filtro.formatoExcelId ? { formatoExcelId: filtro.formatoExcelId } : {}),
      ...(filtro.ventanaCargaId ? { ventanaCargaId: filtro.ventanaCargaId } : {}),
    };

    const [registros, total] = await prisma.$transaction([
      prisma.cargaArchivo.findMany({
        where,
        select: SELECCION_RESUMEN,
        orderBy: { vistoBuenoEn: "desc" },
        skip: (filtro.pagina - 1) * filtro.tamano,
        take: filtro.tamano,
      }),
      prisma.cargaArchivo.count({ where }),
    ]);

    return { filas: registros.map(aCargaArchivoResumen), total };
  },

  async darVistoBueno(id, usuarioId) {
    // `updateMany` con las tres condiciones en el mismo `WHERE` (id + dueño + estado): si
    // cualquiera no calza, no toca ninguna fila. Es la transición atómica que cierra la ventana
    // de carrera de un doble clic o dos pestañas del mismo notificador.
    const resultado = await prisma.cargaArchivo.updateMany({
      where: { id, usuarioId, estado: "PENDIENTE_VISTO_BUENO" },
      data: { estado: "APROBADA", vistoBuenoEn: new Date(), vistoBuenoPorId: usuarioId },
    });

    if (resultado.count === 0) return null;

    const registro = await prisma.cargaArchivo.findUnique({ where: { id }, select: SELECCION_DETALLE });
    return registro ? aCargaArchivo(registro) : null;
  },

  async contarNotificadoresDistintosPorVentana(ventanaCargaIds) {
    if (ventanaCargaIds.length === 0) return {};

    // Se agrupa por el PAR (ventanaCargaId, usuarioId) y NO se usa un `_count` plano de filas por
    // `ventanaCargaId`: `CargaArchivo` no tiene restricción de unicidad sobre
    // `(usuarioId, ventanaCargaId)`, así que un mismo notificador puede tener varias cargas
    // APROBADA en la misma ventana (correcciones sucesivas). Agrupar solo por `ventanaCargaId`
    // sobre-contaría a ese notificador una vez por cada carga aprobada que tenga. Agrupar por el
    // par produce como mucho una fila por combinación (ventana, usuario) realmente existente, así
    // que reducir contando filas por `ventanaCargaId` en JS sí refleja usuarios DISTINTOS. No
    // "simplificar" esto a un `_count` directo: reintroduciría el sobre-conteo.
    const grupos = await prisma.cargaArchivo.groupBy({
      by: ["ventanaCargaId", "usuarioId"],
      where: { ventanaCargaId: { in: ventanaCargaIds }, estado: "APROBADA" },
    });

    const conteoPorVentana: Record<string, number> = {};
    for (const grupo of grupos) {
      conteoPorVentana[grupo.ventanaCargaId] = (conteoPorVentana[grupo.ventanaCargaId] ?? 0) + 1;
    }

    return conteoPorVentana;
  },

  async obtenerParaDescarga(id) {
    // Única consulta de todo el módulo que trae `contenidoArchivo`, y solo si ya está aprobada.
    const registro = await prisma.cargaArchivo.findFirst({
      where: { id, estado: "APROBADA" },
      select: { nombreArchivoOriginal: true, tipoContenidoArchivo: true, contenidoArchivo: true },
    });

    if (!registro) return null;

    return {
      nombreArchivoOriginal: registro.nombreArchivoOriginal,
      tipoContenidoArchivo: registro.tipoContenidoArchivo,
      contenidoArchivo: Buffer.from(registro.contenidoArchivo),
    };
  },
};
