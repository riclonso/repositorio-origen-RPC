import { Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/database/prisma";
import { CODIGO_PERFIL_NOTIFICADOR } from "@/modules/perfiles/domain/entities/Perfil";
import type { FormatoExcelRepository } from "@/modules/formatos-excel/domain/repositories/FormatoExcelRepository";
import type {
  ColumnaFormatoExcel,
  DatosEdicionFormatoExcel,
  DatosNuevoFormatoExcel,
  FormatoExcel,
  FormatoExcelResumen,
  ReglaValidacionFormatoExcel,
} from "@/modules/formatos-excel/domain/entities/FormatoExcel";
import { FormatoDuplicadoError } from "@/modules/formatos-excel/domain/errors/FormatoDuplicadoError";

// Selección explícita: `contenidoPlantilla` NUNCA sale de aquí. La única función de este archivo
// que sí la trae es `obtenerPlantilla`, con su propio `select` acotado a esas tres columnas.
const SELECCION_COLUMNA = {
  id: true,
  orden: true,
  nombre: true,
  requerida: true,
  tipoDato: true,
} as const;

const SELECCION_REGLA = {
  id: true,
  orden: true,
  tipo: true,
  columnas: true,
  mensaje: true,
} as const;

const SELECCION_DETALLE = {
  id: true,
  nombre: true,
  descripcion: true,
  nombreArchivoPlantilla: true,
  tipoContenidoPlantilla: true,
  tipoArchivo: true,
  activo: true,
  createdAt: true,
  updatedAt: true,
  columnas: { select: SELECCION_COLUMNA, orderBy: { orden: "asc" } },
  reglasValidacion: { select: SELECCION_REGLA, orderBy: { orden: "asc" } },
} as const;

type RegistroDetalle = {
  id: string;
  nombre: string;
  descripcion: string | null;
  nombreArchivoPlantilla: string;
  tipoContenidoPlantilla: string;
  tipoArchivo: FormatoExcel["tipoArchivo"];
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
  columnas: ColumnaFormatoExcel[];
  reglasValidacion: ReglaValidacionFormatoExcel[];
};

function aFormatoExcel(registro: RegistroDetalle): FormatoExcel {
  return {
    id: registro.id,
    nombre: registro.nombre,
    descripcion: registro.descripcion,
    nombreArchivoPlantilla: registro.nombreArchivoPlantilla,
    tipoContenidoPlantilla: registro.tipoContenidoPlantilla,
    tipoArchivo: registro.tipoArchivo,
    activo: registro.activo,
    createdAt: registro.createdAt,
    updatedAt: registro.updatedAt,
    columnas: registro.columnas,
    reglasValidacion: registro.reglasValidacion,
  };
}

const CODIGO_UNIQUE_VIOLADO = "P2002";

// El nombre se comprueba antes de escribir, así que llegar aquí significa que alguien lo tomó
// entre la comprobación y el INSERT/UPDATE (ventana de carrera). Se traduce a un error de
// dominio para que el borde responda 409 y no un 500 por violación de restricción única.
function traducirConflicto(error: unknown, nombre: string): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === CODIGO_UNIQUE_VIOLADO) {
    throw new FormatoDuplicadoError(nombre);
  }

  throw error;
}

export const prismaFormatoExcelRepository: FormatoExcelRepository = {
  async listar(): Promise<FormatoExcelResumen[]> {
    const registros = await prisma.formatoExcel.findMany({
      select: {
        id: true,
        nombre: true,
        descripcion: true,
        tipoArchivo: true,
        activo: true,
        createdAt: true,
        _count: { select: { columnas: true, reglasValidacion: true, usuariosAsignados: true, ventanasCarga: true } },
      },
      orderBy: { nombre: "asc" },
    });

    return registros.map((registro) => ({
      id: registro.id,
      nombre: registro.nombre,
      descripcion: registro.descripcion,
      tipoArchivo: registro.tipoArchivo,
      activo: registro.activo,
      createdAt: registro.createdAt,
      cantidadColumnas: registro._count.columnas,
      cantidadReglas: registro._count.reglasValidacion,
      cantidadUsuariosAsignados: registro._count.usuariosAsignados,
      puedeEliminar: registro._count.ventanasCarga === 0,
    }));
  },

  async obtenerPorId(id) {
    const registro = await prisma.formatoExcel.findUnique({ where: { id }, select: SELECCION_DETALLE });
    return registro ? aFormatoExcel(registro) : null;
  },

  async existeActivo(id) {
    const registro = await prisma.formatoExcel.findFirst({
      where: { id, activo: true },
      select: { id: true },
    });

    return registro !== null;
  },

  async obtenerActivosEntre(ids) {
    if (ids.length === 0) return [];

    const registros = await prisma.formatoExcel.findMany({
      where: { id: { in: ids }, activo: true },
      select: { id: true },
    });

    return registros.map((registro) => registro.id);
  },

  async estaAsignadoYActivo(usuarioId, formatoExcelId) {
    // Una sola consulta contra la tabla de asociación, con el estado del formato filtrado en el
    // mismo `WHERE` (nunca dos llamadas separadas que dejen ventana de carrera).
    const asignacion = await prisma.usuarioFormatoExcel.findFirst({
      where: { usuarioId, formatoExcelId, formatoExcel: { activo: true } },
      select: { id: true },
    });

    return asignacion !== null;
  },

  async listarAsignadosAUsuario(usuarioId) {
    const asignaciones = await prisma.usuarioFormatoExcel.findMany({
      where: { usuarioId, formatoExcel: { activo: true } },
      select: {
        formatoExcel: {
          select: {
            id: true,
            nombre: true,
            descripcion: true,
            tipoArchivo: true,
            activo: true,
            createdAt: true,
            _count: { select: { columnas: true, reglasValidacion: true, usuariosAsignados: true } },
          },
        },
      },
      orderBy: { formatoExcel: { nombre: "asc" } },
    });

    return asignaciones.map(({ formatoExcel }) => ({
      id: formatoExcel.id,
      nombre: formatoExcel.nombre,
      descripcion: formatoExcel.descripcion,
      tipoArchivo: formatoExcel.tipoArchivo,
      activo: formatoExcel.activo,
      createdAt: formatoExcel.createdAt,
      cantidadColumnas: formatoExcel._count.columnas,
      cantidadReglas: formatoExcel._count.reglasValidacion,
      cantidadUsuariosAsignados: formatoExcel._count.usuariosAsignados,
      // Esta vista alimenta el selector del notificador, no el mantenedor; no se consulta la
      // relación de ventanas para mantenerla liviana y nunca ofrece acciones de eliminación.
      puedeEliminar: false,
    }));
  },

  async crear(datos: DatosNuevoFormatoExcel) {
    try {
      // Nido de una sola escritura: Prisma ejecuta la creación del formato y de sus columnas
      // como una única operación atómica.
      const registro = await prisma.formatoExcel.create({
        data: {
          nombre: datos.nombre,
          descripcion: datos.descripcion,
          nombreArchivoPlantilla: datos.nombreArchivoPlantilla,
          tipoContenidoPlantilla: datos.tipoContenidoPlantilla,
          tipoArchivo: datos.tipoArchivo,
          // `Uint8Array.from` produce un `Uint8Array<ArrayBuffer>` "de fábrica", el tipo exacto
          // que exige el campo `Bytes` generado por Prisma; el `Buffer<ArrayBufferLike>` de Node
          // es más amplio (admite `SharedArrayBuffer`) y por eso no encaja directo.
          contenidoPlantilla: Uint8Array.from(datos.contenidoPlantilla),
          columnas: {
            create: datos.columnas.map((columna) => ({
              orden: columna.orden,
              nombre: columna.nombre,
              requerida: columna.requerida,
              tipoDato: columna.tipoDato,
            })),
          },
          reglasValidacion: {
            create: datos.reglasValidacion.map((regla) => ({
              orden: regla.orden,
              tipo: regla.tipo,
              columnas: regla.columnas,
              mensaje: regla.mensaje,
            })),
          },
        },
        select: SELECCION_DETALLE,
      });

      return aFormatoExcel(registro);
    } catch (error) {
      traducirConflicto(error, datos.nombre);
    }
  },

  async actualizar(id, datos: DatosEdicionFormatoExcel) {
    try {
      // `deleteMany` + `create` sobre la misma relación, dentro de la misma llamada a `update`:
      // Prisma lo ejecuta como una única operación atómica, así que el reemplazo del set
      // completo de columnas nunca deja al formato con columnas a medio reemplazar.
      const registro = await prisma.formatoExcel.update({
        where: { id },
        data: {
          nombre: datos.nombre,
          descripcion: datos.descripcion,
          columnas: {
            deleteMany: {},
            create: datos.columnas.map((columna) => ({
              orden: columna.orden,
              nombre: columna.nombre,
              requerida: columna.requerida,
              tipoDato: columna.tipoDato,
            })),
          },
          reglasValidacion: {
            deleteMany: {},
            create: datos.reglasValidacion.map((regla) => ({
              orden: regla.orden,
              tipo: regla.tipo,
              columnas: regla.columnas,
              mensaje: regla.mensaje,
            })),
          },
        },
        select: SELECCION_DETALLE,
      });

      return aFormatoExcel(registro);
    } catch (error) {
      traducirConflicto(error, datos.nombre);
    }
  },

  async cambiarEstado(id, activo) {
    const registro = await prisma.formatoExcel.update({
      where: { id },
      data: { activo },
      select: SELECCION_DETALLE,
    });

    return aFormatoExcel(registro);
  },

  async eliminar(id) {
    try {
      return await prisma.$transaction(async (tx) => {
        const formato = await tx.formatoExcel.findUnique({ where: { id }, select: { id: true } });
        if (!formato) return "NO_ENCONTRADO" as const;

        // Se considera activa cualquier ventana vinculada: aunque sus fechas ya hayan pasado o
        // esté archivada, sigue siendo parte del historial y el FK RESTRICT impide borrarla.
        const cantidadVentanas = await tx.ventanaCarga.count({ where: { formatoExcelId: id } });
        if (cantidadVentanas > 0) return "CON_VENTANAS_ACTIVAS" as const;

        await tx.usuarioFormatoExcel.deleteMany({ where: { formatoExcelId: id } });
        await tx.formatoExcel.delete({ where: { id } });
        return "ELIMINADO" as const;
      });
    } catch (error) {
      // Una ventana creada entre la comprobación y el DELETE queda protegida por la base de datos.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        return "CON_VENTANAS_ACTIVAS" as const;
      }
      throw error;
    }
  },

  async buscarPorNombre(nombre) {
    const registro = await prisma.formatoExcel.findUnique({ where: { nombre }, select: SELECCION_DETALLE });
    return registro ? aFormatoExcel(registro) : null;
  },

  async contarNotificadoresAsignadosActivosPorFormato(formatoExcelIds) {
    if (formatoExcelIds.length === 0) return {};

    // `usuario_formato_excel` es única por `(usuarioId, formatoExcelId)`
    // (`@@unique([usuarioId, formatoExcelId])`), así que contar FILAS del grupo equivale a contar
    // usuarios DISTINTOS, sin necesidad de un `DISTINCT` adicional.
    const grupos = await prisma.usuarioFormatoExcel.groupBy({
      by: ["formatoExcelId"],
      where: {
        formatoExcelId: { in: formatoExcelIds },
        usuario: { activo: true, perfilCodigo: CODIGO_PERFIL_NOTIFICADOR },
      },
      _count: true,
    });

    return Object.fromEntries(grupos.map((grupo) => [grupo.formatoExcelId, grupo._count]));
  },

  async obtenerPlantilla(id) {
    // Única consulta de todo el módulo que trae `contenidoPlantilla`.
    const registro = await prisma.formatoExcel.findUnique({
      where: { id },
      select: { nombreArchivoPlantilla: true, tipoContenidoPlantilla: true, contenidoPlantilla: true },
    });

    if (!registro) return null;

    return {
      nombreArchivoPlantilla: registro.nombreArchivoPlantilla,
      tipoContenidoPlantilla: registro.tipoContenidoPlantilla,
      contenidoPlantilla: Buffer.from(registro.contenidoPlantilla),
    };
  },
};
