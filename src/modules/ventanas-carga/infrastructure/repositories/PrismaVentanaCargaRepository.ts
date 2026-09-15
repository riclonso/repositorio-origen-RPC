import { Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/database/prisma";
import { nombreCompleto } from "@/modules/usuarios/domain/entities/Usuario";
import type { VentanaCargaRepository } from "@/modules/ventanas-carga/domain/repositories/VentanaCargaRepository";
import type {
  DatosEdicionVentanaCarga,
  DatosNuevaVentanaCarga,
  VentanaCarga,
} from "@/modules/ventanas-carga/domain/entities/VentanaCarga";
import { VentanaCargaDuplicadaError } from "@/modules/ventanas-carga/domain/errors/VentanaCargaDuplicadaError";
import { FormatoInvalidoVentanaCargaError } from "@/modules/ventanas-carga/domain/errors/FormatoInvalidoVentanaCargaError";

// Selección explícita, mismo patrón que `PrismaFormatoExcelRepository`/`PrismaCargaArchivoRepository`.
const SELECCION_VENTANA = {
  id: true,
  anio: true,
  fechaApertura: true,
  fechaVencimiento: true,
  formatoExcelId: true,
  formatoExcel: { select: { nombre: true } },
  publicada: true,
  creadoPorId: true,
  creadoPor: { select: { nombres: true, apellidos: true } },
  eliminadaEn: true,
  eliminadaPorId: true,
  eliminadaPor: { select: { nombres: true, apellidos: true } },
  createdAt: true,
  updatedAt: true,
  // Cuenta solo las cargas APROBADAS de esta ventana, filtrando dentro del propio `_count`: nunca
  // trae las filas completas, evitando el N+1 de contar en JS por cada ventana del listado.
  _count: { select: { cargas: { where: { estado: "APROBADA" } } } },
} as const;

type RegistroVentana = {
  id: string;
  anio: number;
  fechaApertura: Date;
  fechaVencimiento: Date;
  formatoExcelId: string;
  formatoExcel: { nombre: string };
  publicada: boolean;
  creadoPorId: string;
  creadoPor: { nombres: string; apellidos: string };
  eliminadaEn: Date | null;
  eliminadaPorId: string | null;
  eliminadaPor: { nombres: string; apellidos: string } | null;
  createdAt: Date;
  updatedAt: Date;
  _count: { cargas: number };
};

function aVentanaCarga(registro: RegistroVentana): VentanaCarga {
  return {
    id: registro.id,
    anio: registro.anio,
    fechaApertura: registro.fechaApertura,
    fechaVencimiento: registro.fechaVencimiento,
    formatoExcelId: registro.formatoExcelId,
    formatoExcelNombre: registro.formatoExcel.nombre,
    publicada: registro.publicada,
    creadoPorId: registro.creadoPorId,
    creadoPorNombre: nombreCompleto(registro.creadoPor),
    eliminadaEn: registro.eliminadaEn,
    eliminadaPorId: registro.eliminadaPorId,
    eliminadaPorNombre: registro.eliminadaPor ? nombreCompleto(registro.eliminadaPor) : null,
    createdAt: registro.createdAt,
    updatedAt: registro.updatedAt,
    cantidadCargas: registro._count.cargas,
  };
}

const CODIGO_UNIQUE_VIOLADO = "P2002";
const CODIGO_FK_VIOLADA = "P2003";

// El año+formato se comprueba antes de escribir, así que llegar aquí significa que alguien lo tomó
// entre la comprobación y el INSERT (ventana de carrera), o que el `formatoExcelId` recibido no
// existe (P2003). Se traduce a errores de dominio para que el borde responda 409/400 y no un 500
// por violación de restricción de base de datos.
function traducirConflicto(error: unknown, anio: number): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === CODIGO_UNIQUE_VIOLADO) {
    throw new VentanaCargaDuplicadaError(anio);
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === CODIGO_FK_VIOLADA) {
    throw new FormatoInvalidoVentanaCargaError();
  }

  throw error;
}

export const prismaVentanaCargaRepository: VentanaCargaRepository = {
  async crear(datos: DatosNuevaVentanaCarga) {
    try {
      const registro = await prisma.ventanaCarga.create({
        data: {
          anio: datos.anio,
          fechaApertura: datos.fechaApertura,
          fechaVencimiento: datos.fechaVencimiento,
          formatoExcelId: datos.formatoExcelId,
          // Explícito y no confiado al default de Prisma: toda ventana nueva nace en borrador,
          // sin importar lo que el cliente haya enviado (nunca viaja en la creación).
          publicada: false,
          creadoPorId: datos.creadoPorId,
        },
        select: SELECCION_VENTANA,
      });

      return aVentanaCarga(registro);
    } catch (error) {
      traducirConflicto(error, datos.anio);
    }
  },

  async listar() {
    const registros = await prisma.ventanaCarga.findMany({
      select: SELECCION_VENTANA,
      orderBy: { anio: "desc" },
    });

    return registros.map(aVentanaCarga);
  },

  async obtenerPorId(id) {
    const registro = await prisma.ventanaCarga.findUnique({ where: { id }, select: SELECCION_VENTANA });
    return registro ? aVentanaCarga(registro) : null;
  },

  async obtenerPorAnioYFormato(anio, formatoExcelId) {
    // `findFirst`, no `findUnique`: `(anio, formatoExcelId)` ya no tiene `@@unique` de columna
    // completa (la unicidad real es el índice parcial `WHERE "eliminadaEn" IS NULL`, agregado a
    // mano en la migración). Filtrar aquí `eliminadaEn: null` hace que el código de aplicación vea
    // exactamente esa misma noción de "ese año y formato ya están tomados".
    const registro = await prisma.ventanaCarga.findFirst({
      where: { anio, formatoExcelId, eliminadaEn: null },
      select: SELECCION_VENTANA,
    });
    return registro ? aVentanaCarga(registro) : null;
  },

  async listarDisponibles(ahora) {
    // Exclusión real en el `WHERE`, no solo en la UI: una ventana no publicada nunca llega hasta
    // acá, sin importar sus fechas.
    const registros = await prisma.ventanaCarga.findMany({
      where: {
        eliminadaEn: null,
        fechaApertura: { lte: ahora },
        fechaVencimiento: { gte: ahora },
        publicada: true,
      },
      select: SELECCION_VENTANA,
      orderBy: { anio: "desc" },
    });

    return registros.map(aVentanaCarga);
  },

  async actualizar(id, datos: DatosEdicionVentanaCarga) {
    try {
      const registro = await prisma.ventanaCarga.update({
        where: { id },
        data: {
          fechaApertura: datos.fechaApertura,
          fechaVencimiento: datos.fechaVencimiento,
          formatoExcelId: datos.formatoExcelId,
        },
        select: SELECCION_VENTANA,
      });

      return aVentanaCarga(registro);
    } catch (error) {
      // `update` sobre un id inexistente lanza P2025, no P2002/P2003: se traduce a `null`, igual
      // que el resto de repositorios del proyecto ante un "no encontrado".
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        return null;
      }

      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === CODIGO_FK_VIOLADA) {
        throw new FormatoInvalidoVentanaCargaError();
      }

      throw error;
    }
  },

  async cambiarPublicacion(id, publicada) {
    try {
      const registro = await prisma.ventanaCarga.update({
        where: { id },
        data: { publicada },
        select: SELECCION_VENTANA,
      });

      return aVentanaCarga(registro);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        return null;
      }

      throw error;
    }
  },

  async eliminar(id, eliminadoPorId) {
    try {
      // Se intenta el `DELETE` físico directamente, sin contar cargas asociadas antes: dejar que
      // el propio `ON DELETE RESTRICT` de `CargaArchivo.ventanaCargaId` decida evita la ventana de
      // carrera de "contar 0 cargas" y que una llegue justo antes del `DELETE`.
      await prisma.ventanaCarga.delete({ where: { id } });
      return { tipo: "HARD" };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        return null;
      }

      // P2003: el `RESTRICT` rechazó el `DELETE` porque existen `CargaArchivo` apuntando a esta
      // ventana. Se cae a eliminación lógica en vez de propagar el error.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === CODIGO_FK_VIOLADA) {
        try {
          await prisma.ventanaCarga.update({
            where: { id },
            data: { eliminadaEn: new Date(), eliminadaPorId: eliminadoPorId },
          });
          return { tipo: "SOFT" };
        } catch (errorSoft) {
          if (errorSoft instanceof Prisma.PrismaClientKnownRequestError && errorSoft.code === "P2025") {
            return null;
          }

          throw errorSoft;
        }
      }

      throw error;
    }
  },
};
