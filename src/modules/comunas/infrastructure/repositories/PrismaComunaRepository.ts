import { Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/database/prisma";
import type {
  CampoUnicoComuna,
  Comuna,
  ComunaEliminada,
  FiltroListadoComunas,
} from "@/modules/comunas/domain/entities/Comuna";
import type { ComunaRepository } from "@/modules/comunas/domain/repositories/ComunaRepository";
import { ComunaDuplicadaError } from "@/modules/comunas/domain/errors/ComunaDuplicadaError";
import { ComunaEnUsoError } from "@/modules/comunas/domain/errors/ComunaEnUsoError";
import { ProvinciaInvalidaError } from "@/modules/comunas/domain/errors/ProvinciaInvalidaError";

// Selección explícita: `nombreNormalizado` NO se trae, es un detalle interno de unicidad que la
// entidad de dominio no declara. Provincia y región van anidadas en la misma consulta (sin N+1).
const SELECCION_COMUNA = {
  id: true,
  nombre: true,
  codigo: true,
  createdAt: true,
  provincia: {
    select: {
      id: true,
      nombre: true,
      codigo: true,
      region: { select: { id: true, nombre: true, codigo: true } },
    },
  },
} as const;

type RegistroComuna = {
  id: string;
  nombre: string;
  codigo: string;
  createdAt: Date;
  provincia: {
    id: string;
    nombre: string;
    codigo: string;
    region: { id: string; nombre: string; codigo: string };
  };
};

// Mapper explícito: arma la entidad campo a campo, sin arrastrar `nombreNormalizado`.
function aComuna(registro: RegistroComuna): Comuna {
  return {
    id: registro.id,
    nombre: registro.nombre,
    codigo: registro.codigo,
    provincia: {
      id: registro.provincia.id,
      nombre: registro.provincia.nombre,
      codigo: registro.provincia.codigo,
      region: {
        id: registro.provincia.region.id,
        nombre: registro.provincia.region.nombre,
        codigo: registro.provincia.region.codigo,
      },
    },
    createdAt: registro.createdAt,
  };
}

const CODIGO_UNIQUE_VIOLADO = "P2002";
const CODIGO_FK_VIOLADA = "P2003";
// Registro a actualizar/borrar que ya no existe.
const CODIGO_REGISTRO_INEXISTENTE = "P2025";

// Nombres de las restricciones UNIQUE creadas por la migración `agregar_comuna`.
const RESTRICCION_NOMBRE_POR_PROVINCIA = "comuna_provinciaId_nombreNormalizado_key";
const RESTRICCION_CODIGO = "comuna_codigo_key";

function esErrorPrisma(error: unknown, codigo: string): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === codigo;
}

// Identifica qué restricción UNIQUE se violó. Según el motor, el dato llega en `meta.target`
// (cliente clásico) o dentro de `meta.driverAdapterError` (`@prisma/adapter-pg`), así que se
// inspecciona el `meta` completo. Se busca primero por NOMBRE de restricción y la compuesta
// (provincia + nombre) antes que el código. Si no se puede precisar, el campo queda en null y el
// borde responde con un mensaje general sin marcar ningún campo.
function campoDesdeConflicto(error: Prisma.PrismaClientKnownRequestError): CampoUnicoComuna | null {
  const texto = JSON.stringify(error.meta ?? {});

  if (texto.includes(RESTRICCION_NOMBRE_POR_PROVINCIA)) return "nombre";
  if (texto.includes(RESTRICCION_CODIGO)) return "codigo";
  if (texto.includes("nombreNormalizado")) return "nombre";
  if (texto.includes("codigo")) return "codigo";
  return null;
}

// Traduce los errores de escritura (crear/editar) a errores de dominio para que el borde responda
// 409/400 y no un 500:
// - P2002: colisión UNIQUE por carrera (el caso de uso ya comprobó antes).
// - P2003: la FK a `provincia` falló porque la provincia se eliminó tras la validación.
function traducirErrorEscritura(error: unknown): never {
  if (esErrorPrisma(error, CODIGO_UNIQUE_VIOLADO)) {
    throw new ComunaDuplicadaError(campoDesdeConflicto(error));
  }

  if (esErrorPrisma(error, CODIGO_FK_VIOLADA)) {
    throw new ProvinciaInvalidaError();
  }

  throw error;
}

// Filtros combinados con AND. El de región pasa por la relación con provincia (la comuna no
// guarda `regionId`).
function aCondicionListado(filtro: FiltroListadoComunas): Prisma.ComunaWhereInput {
  return {
    ...(filtro.provinciaId ? { provinciaId: filtro.provinciaId } : {}),
    ...(filtro.regionId ? { provincia: { regionId: filtro.regionId } } : {}),
  };
}

export const prismaComunaRepository: ComunaRepository = {
  async listar(filtro): Promise<Comuna[]> {
    const registros = await prisma.comuna.findMany({
      where: aCondicionListado(filtro),
      select: SELECCION_COMUNA,
      orderBy: [{ provincia: { region: { numero: "asc" } } }, { codigo: "asc" }],
    });

    return registros.map(aComuna);
  },

  async obtenerPorId(id): Promise<Comuna | null> {
    const registro = await prisma.comuna.findUnique({
      where: { id },
      select: SELECCION_COMUNA,
    });

    return registro ? aComuna(registro) : null;
  },

  async buscarConflicto(claves, excluirId): Promise<CampoUnicoComuna | null> {
    // Una sola consulta con OR sobre las dos claves, nunca dos consultas. Pueden chocar hasta dos
    // comunas distintas; se informa primero el código y luego el nombre.
    const registros = await prisma.comuna.findMany({
      where: {
        OR: [
          { codigo: claves.codigo },
          { provinciaId: claves.provinciaId, nombreNormalizado: claves.nombreNormalizado },
        ],
        ...(excluirId ? { NOT: { id: excluirId } } : {}),
      },
      select: { codigo: true, provinciaId: true, nombreNormalizado: true },
      take: 2,
    });

    if (registros.some((registro) => registro.codigo === claves.codigo)) {
      return "codigo";
    }

    if (
      registros.some(
        (registro) =>
          registro.provinciaId === claves.provinciaId &&
          registro.nombreNormalizado === claves.nombreNormalizado,
      )
    ) {
      return "nombre";
    }

    return null;
  },

  async crear(datos): Promise<Comuna> {
    try {
      const registro = await prisma.comuna.create({
        data: {
          nombre: datos.nombre,
          nombreNormalizado: datos.nombreNormalizado,
          codigo: datos.codigo,
          provinciaId: datos.provinciaId,
        },
        select: SELECCION_COMUNA,
      });

      return aComuna(registro);
    } catch (error) {
      traducirErrorEscritura(error);
    }
  },

  async actualizar(id, datos): Promise<Comuna | null> {
    try {
      const registro = await prisma.comuna.update({
        where: { id },
        data: {
          nombre: datos.nombre,
          nombreNormalizado: datos.nombreNormalizado,
          codigo: datos.codigo,
          provinciaId: datos.provinciaId,
        },
        select: SELECCION_COMUNA,
      });

      return aComuna(registro);
    } catch (error) {
      if (esErrorPrisma(error, CODIGO_REGISTRO_INEXISTENTE)) {
        return null;
      }

      traducirErrorEscritura(error);
    }
  },

  async eliminar(id): Promise<ComunaEliminada | null> {
    try {
      // La provincia sale del propio DELETE (RETURNING), sin una lectura previa aparte.
      const eliminada = await prisma.comuna.delete({
        where: { id },
        select: { provinciaId: true },
      });
      return { provinciaId: eliminada.provinciaId };
    } catch (error) {
      if (esErrorPrisma(error, CODIGO_REGISTRO_INEXISTENTE)) {
        return null;
      }

      if (esErrorPrisma(error, CODIGO_FK_VIOLADA)) {
        throw new ComunaEnUsoError();
      }

      throw error;
    }
  },
};
