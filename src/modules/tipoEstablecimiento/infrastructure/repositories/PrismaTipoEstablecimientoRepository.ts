import { Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/database/prisma";
import type {
  OpcionesListadoTipos,
  TipoEstablecimiento,
} from "@/modules/tipoEstablecimiento/domain/entities/TipoEstablecimiento";
import type { TipoEstablecimientoRepository } from "@/modules/tipoEstablecimiento/domain/repositories/TipoEstablecimientoRepository";
import { TipoEstablecimientoDuplicadoError } from "@/modules/tipoEstablecimiento/domain/errors/TipoEstablecimientoDuplicadoError";

// Selección explícita: `nombreNormalizado` NO se trae, es un detalle interno de unicidad que la
// entidad de dominio no declara.
const SELECCION_TIPO = {
  id: true,
  nombre: true,
  activo: true,
  createdAt: true,
} as const;

type RegistroTipo = {
  id: string;
  nombre: string;
  activo: boolean;
  createdAt: Date;
};

// Mapper explícito: arma la entidad campo a campo, sin arrastrar `nombreNormalizado`.
function aTipo(registro: RegistroTipo): TipoEstablecimiento {
  return {
    id: registro.id,
    nombre: registro.nombre,
    activo: registro.activo,
    createdAt: registro.createdAt,
  };
}

const CODIGO_UNIQUE_VIOLADO = "P2002";

// El nombre se valida antes de escribir, así que llegar aquí significa colisión por carrera. Se
// traduce a error de dominio para que el borde responda 409 y no un 500.
function traducirConflicto(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === CODIGO_UNIQUE_VIOLADO
  ) {
    throw new TipoEstablecimientoDuplicadoError();
  }

  throw error;
}

// Un solo predicado: los activos MÁS los ids que se pidan explícitamente. Resolverlo con dos
// consultas y unir en memoria sería una consulta de más por cada select que lo use.
function construirFiltro(opciones: OpcionesListadoTipos): Prisma.TipoEstablecimientoWhereInput {
  const idsIncluidos = opciones.incluirIds?.filter((id) => id.length > 0) ?? [];

  if (!opciones.soloActivos) {
    return {};
  }

  if (idsIncluidos.length === 0) {
    return { activo: true };
  }

  return { OR: [{ activo: true }, { id: { in: idsIncluidos } }] };
}

export const prismaTipoEstablecimientoRepository: TipoEstablecimientoRepository = {
  async listar(opciones = {}): Promise<TipoEstablecimiento[]> {
    const registros = await prisma.tipoEstablecimiento.findMany({
      where: construirFiltro(opciones),
      select: SELECCION_TIPO,
      orderBy: [{ nombre: "asc" }, { id: "asc" }],
    });

    return registros.map(aTipo);
  },

  async existeActivo(id): Promise<boolean> {
    const registro = await prisma.tipoEstablecimiento.findFirst({
      where: { id, activo: true },
      select: { id: true },
    });

    return registro !== null;
  },

  async obtenerPorId(id): Promise<TipoEstablecimiento | null> {
    const registro = await prisma.tipoEstablecimiento.findUnique({
      where: { id },
      select: SELECCION_TIPO,
    });

    return registro ? aTipo(registro) : null;
  },

  async buscarConflictoNombre(nombreNormalizado, excluirId): Promise<boolean> {
    const registro = await prisma.tipoEstablecimiento.findFirst({
      where: {
        nombreNormalizado,
        ...(excluirId ? { NOT: { id: excluirId } } : {}),
      },
      select: { id: true },
    });

    return registro !== null;
  },

  async crear(datos): Promise<TipoEstablecimiento> {
    try {
      const registro = await prisma.tipoEstablecimiento.create({
        data: {
          nombre: datos.nombre,
          nombreNormalizado: datos.nombreNormalizado,
        },
        select: SELECCION_TIPO,
      });

      return aTipo(registro);
    } catch (error) {
      traducirConflicto(error);
    }
  },

  async actualizar(id, datos): Promise<TipoEstablecimiento> {
    try {
      const registro = await prisma.tipoEstablecimiento.update({
        where: { id },
        data: {
          nombre: datos.nombre,
          nombreNormalizado: datos.nombreNormalizado,
        },
        select: SELECCION_TIPO,
      });

      return aTipo(registro);
    } catch (error) {
      traducirConflicto(error);
    }
  },

  async cambiarEstado(id, activo): Promise<TipoEstablecimiento> {
    const registro = await prisma.tipoEstablecimiento.update({
      where: { id },
      data: { activo },
      select: SELECCION_TIPO,
    });

    return aTipo(registro);
  },
};
