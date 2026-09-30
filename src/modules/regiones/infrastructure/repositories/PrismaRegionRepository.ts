import { Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/database/prisma";
import type { CampoUnicoRegion, Region } from "@/modules/regiones/domain/entities/Region";
import type { RegionRepository } from "@/modules/regiones/domain/repositories/RegionRepository";
import { RegionDuplicadaError } from "@/modules/regiones/domain/errors/RegionDuplicadaError";
import { RegionEnUsoError } from "@/modules/regiones/domain/errors/RegionEnUsoError";

// Selección explícita: `nombreNormalizado` NO se trae, es un detalle interno de unicidad que la
// entidad de dominio no declara.
const SELECCION_REGION = {
  id: true,
  nombre: true,
  codigo: true,
  numero: true,
  createdAt: true,
} as const;

type RegistroRegion = {
  id: string;
  nombre: string;
  codigo: string;
  numero: number;
  createdAt: Date;
};

// Mapper explícito: arma la entidad campo a campo, sin arrastrar `nombreNormalizado`.
function aRegion(registro: RegistroRegion): Region {
  return {
    id: registro.id,
    nombre: registro.nombre,
    codigo: registro.codigo,
    numero: registro.numero,
    createdAt: registro.createdAt,
  };
}

const CODIGO_UNIQUE_VIOLADO = "P2002";
const CODIGO_FK_VIOLADA = "P2003";
// Registro a actualizar/borrar que ya no existe.
const CODIGO_REGISTRO_INEXISTENTE = "P2025";

function esErrorPrisma(error: unknown, codigo: string): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === codigo;
}

// Identifica qué restricción UNIQUE se violó. Según el motor, el campo llega en `meta.target`
// (cliente clásico) o dentro de `meta.driverAdapterError` (`@prisma/adapter-pg`), así que se
// inspecciona el `meta` completo. Si no se puede precisar, el campo queda en null y el borde
// responde con un mensaje general sin marcar ningún campo.
function campoDesdeConflicto(error: Prisma.PrismaClientKnownRequestError): CampoUnicoRegion | null {
  const texto = JSON.stringify(error.meta ?? {});

  if (texto.includes("nombreNormalizado")) return "nombre";
  if (texto.includes("codigo")) return "codigo";
  if (texto.includes("numero")) return "numero";
  return null;
}

// Llegar aquí con P2002 significa colisión por carrera (el caso de uso ya comprobó antes). Se
// traduce a error de dominio para que el borde responda 409 y no un 500.
function traducirDuplicado(error: unknown): never {
  if (esErrorPrisma(error, CODIGO_UNIQUE_VIOLADO)) {
    throw new RegionDuplicadaError(campoDesdeConflicto(error));
  }

  throw error;
}

export const prismaRegionRepository: RegionRepository = {
  async listar(): Promise<Region[]> {
    const registros = await prisma.region.findMany({
      select: SELECCION_REGION,
      orderBy: { numero: "asc" },
    });

    return registros.map(aRegion);
  },

  async obtenerPorId(id): Promise<Region | null> {
    const registro = await prisma.region.findUnique({
      where: { id },
      select: SELECCION_REGION,
    });

    return registro ? aRegion(registro) : null;
  },

  async buscarConflicto(claves, excluirId): Promise<CampoUnicoRegion | null> {
    // Una sola consulta con OR sobre las tres claves, nunca tres consultas. Pueden chocar hasta
    // tres regiones distintas; se informa el primer campo en orden nombre, código, número.
    const registros = await prisma.region.findMany({
      where: {
        OR: [
          { nombreNormalizado: claves.nombreNormalizado },
          { codigo: claves.codigo },
          { numero: claves.numero },
        ],
        ...(excluirId ? { NOT: { id: excluirId } } : {}),
      },
      select: { nombreNormalizado: true, codigo: true, numero: true },
      take: 3,
    });

    if (registros.some((registro) => registro.nombreNormalizado === claves.nombreNormalizado)) {
      return "nombre";
    }

    if (registros.some((registro) => registro.codigo === claves.codigo)) {
      return "codigo";
    }

    if (registros.some((registro) => registro.numero === claves.numero)) {
      return "numero";
    }

    return null;
  },

  async crear(datos): Promise<Region> {
    try {
      const registro = await prisma.region.create({
        data: {
          nombre: datos.nombre,
          nombreNormalizado: datos.nombreNormalizado,
          codigo: datos.codigo,
          numero: datos.numero,
        },
        select: SELECCION_REGION,
      });

      return aRegion(registro);
    } catch (error) {
      traducirDuplicado(error);
    }
  },

  async actualizar(id, datos): Promise<Region | null> {
    try {
      const registro = await prisma.region.update({
        where: { id },
        data: {
          nombre: datos.nombre,
          nombreNormalizado: datos.nombreNormalizado,
          codigo: datos.codigo,
          numero: datos.numero,
        },
        select: SELECCION_REGION,
      });

      return aRegion(registro);
    } catch (error) {
      if (esErrorPrisma(error, CODIGO_REGISTRO_INEXISTENTE)) {
        return null;
      }

      traducirDuplicado(error);
    }
  },

  async eliminar(id): Promise<boolean> {
    try {
      await prisma.region.delete({ where: { id }, select: { id: true } });
      return true;
    } catch (error) {
      if (esErrorPrisma(error, CODIGO_REGISTRO_INEXISTENTE)) {
        return false;
      }

      if (esErrorPrisma(error, CODIGO_FK_VIOLADA)) {
        throw new RegionEnUsoError();
      }

      throw error;
    }
  },

  async tieneProvincias(id): Promise<boolean> {
    // Se consulta `provincia` directamente (no `include` de la relación inversa): basta saber si
    // existe una fila, sin traer ninguna.
    const provincia = await prisma.provincia.findFirst({
      where: { regionId: id },
      select: { id: true },
    });

    return provincia !== null;
  },
};
