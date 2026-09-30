import { Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/database/prisma";
import type {
  CampoUnicoProvincia,
  Provincia,
  ProvinciaEliminada,
} from "@/modules/provincias/domain/entities/Provincia";
import type { ProvinciaRepository } from "@/modules/provincias/domain/repositories/ProvinciaRepository";
import { ProvinciaDuplicadaError } from "@/modules/provincias/domain/errors/ProvinciaDuplicadaError";
import { ProvinciaEnUsoError } from "@/modules/provincias/domain/errors/ProvinciaEnUsoError";
import { RegionInvalidaError } from "@/modules/provincias/domain/errors/RegionInvalidaError";

// Selección explícita: `nombreNormalizado` NO se trae, es un detalle interno de unicidad que la
// entidad de dominio no declara. La región va anidada en el mismo `findMany` (sin N+1).
const SELECCION_PROVINCIA = {
  id: true,
  nombre: true,
  codigo: true,
  createdAt: true,
  region: { select: { id: true, nombre: true, codigo: true } },
} as const;

type RegistroProvincia = {
  id: string;
  nombre: string;
  codigo: string;
  createdAt: Date;
  region: { id: string; nombre: string; codigo: string };
};

// Mapper explícito: arma la entidad campo a campo, sin arrastrar `nombreNormalizado`.
function aProvincia(registro: RegistroProvincia): Provincia {
  return {
    id: registro.id,
    nombre: registro.nombre,
    codigo: registro.codigo,
    region: {
      id: registro.region.id,
      nombre: registro.region.nombre,
      codigo: registro.region.codigo,
    },
    createdAt: registro.createdAt,
  };
}

const CODIGO_UNIQUE_VIOLADO = "P2002";
const CODIGO_FK_VIOLADA = "P2003";
// Registro a actualizar/borrar que ya no existe.
const CODIGO_REGISTRO_INEXISTENTE = "P2025";

// Nombres de las restricciones UNIQUE creadas por la migración `agregar_provincia`.
const RESTRICCION_NOMBRE_POR_REGION = "provincia_regionId_nombreNormalizado_key";
const RESTRICCION_CODIGO = "provincia_codigo_key";

function esErrorPrisma(error: unknown, codigo: string): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === codigo;
}

// Identifica qué restricción UNIQUE se violó. Según el motor, el dato llega en `meta.target`
// (cliente clásico) o dentro de `meta.driverAdapterError` (`@prisma/adapter-pg`), así que se
// inspecciona el `meta` completo. Se busca primero por NOMBRE de restricción y la compuesta
// (región + nombre) antes que el código: sus columnas no contienen "codigo", pero la regla es
// explícita para no depender de ello. Si no se puede precisar, el campo queda en null y el borde
// responde con un mensaje general sin marcar ningún campo.
function campoDesdeConflicto(error: Prisma.PrismaClientKnownRequestError): CampoUnicoProvincia | null {
  const texto = JSON.stringify(error.meta ?? {});

  if (texto.includes(RESTRICCION_NOMBRE_POR_REGION)) return "nombre";
  if (texto.includes(RESTRICCION_CODIGO)) return "codigo";
  if (texto.includes("nombreNormalizado")) return "nombre";
  if (texto.includes("codigo")) return "codigo";
  return null;
}

// Traduce los errores de escritura (crear/editar) a errores de dominio para que el borde responda
// 409/400 y no un 500:
// - P2002: colisión UNIQUE por carrera (el caso de uso ya comprobó antes).
// - P2003: la FK a `region` falló porque la región se eliminó tras la validación.
function traducirErrorEscritura(error: unknown): never {
  if (esErrorPrisma(error, CODIGO_UNIQUE_VIOLADO)) {
    throw new ProvinciaDuplicadaError(campoDesdeConflicto(error));
  }

  if (esErrorPrisma(error, CODIGO_FK_VIOLADA)) {
    throw new RegionInvalidaError();
  }

  throw error;
}

export const prismaProvinciaRepository: ProvinciaRepository = {
  async listar(filtro): Promise<Provincia[]> {
    const registros = await prisma.provincia.findMany({
      where: filtro.regionId ? { regionId: filtro.regionId } : {},
      select: SELECCION_PROVINCIA,
      orderBy: [{ region: { numero: "asc" } }, { codigo: "asc" }],
    });

    return registros.map(aProvincia);
  },

  async obtenerPorId(id): Promise<Provincia | null> {
    const registro = await prisma.provincia.findUnique({
      where: { id },
      select: SELECCION_PROVINCIA,
    });

    return registro ? aProvincia(registro) : null;
  },

  async buscarConflicto(claves, excluirId): Promise<CampoUnicoProvincia | null> {
    // Una sola consulta con OR sobre las dos claves, nunca dos consultas. Pueden chocar hasta dos
    // provincias distintas; se informa primero el código y luego el nombre.
    const registros = await prisma.provincia.findMany({
      where: {
        OR: [
          { codigo: claves.codigo },
          { regionId: claves.regionId, nombreNormalizado: claves.nombreNormalizado },
        ],
        ...(excluirId ? { NOT: { id: excluirId } } : {}),
      },
      select: { codigo: true, regionId: true, nombreNormalizado: true },
      take: 2,
    });

    if (registros.some((registro) => registro.codigo === claves.codigo)) {
      return "codigo";
    }

    if (
      registros.some(
        (registro) =>
          registro.regionId === claves.regionId &&
          registro.nombreNormalizado === claves.nombreNormalizado,
      )
    ) {
      return "nombre";
    }

    return null;
  },

  async crear(datos): Promise<Provincia> {
    try {
      const registro = await prisma.provincia.create({
        data: {
          nombre: datos.nombre,
          nombreNormalizado: datos.nombreNormalizado,
          codigo: datos.codigo,
          regionId: datos.regionId,
        },
        select: SELECCION_PROVINCIA,
      });

      return aProvincia(registro);
    } catch (error) {
      traducirErrorEscritura(error);
    }
  },

  async actualizar(id, datos): Promise<Provincia | null> {
    try {
      const registro = await prisma.provincia.update({
        where: { id },
        data: {
          nombre: datos.nombre,
          nombreNormalizado: datos.nombreNormalizado,
          codigo: datos.codigo,
          regionId: datos.regionId,
        },
        select: SELECCION_PROVINCIA,
      });

      return aProvincia(registro);
    } catch (error) {
      if (esErrorPrisma(error, CODIGO_REGISTRO_INEXISTENTE)) {
        return null;
      }

      traducirErrorEscritura(error);
    }
  },

  async eliminar(id): Promise<ProvinciaEliminada | null> {
    try {
      // La región sale del propio DELETE (RETURNING), sin una lectura previa aparte.
      const eliminada = await prisma.provincia.delete({
        where: { id },
        select: { regionId: true },
      });
      return { regionId: eliminada.regionId };
    } catch (error) {
      if (esErrorPrisma(error, CODIGO_REGISTRO_INEXISTENTE)) {
        return null;
      }

      // RF-28: `comuna.provinciaId` (ON DELETE RESTRICT) corta el DELETE de una provincia con
      // comunas.
      if (esErrorPrisma(error, CODIGO_FK_VIOLADA)) {
        throw new ProvinciaEnUsoError();
      }

      throw error;
    }
  },

  async tieneComunas(id): Promise<boolean> {
    // Se consulta `comuna` directamente (no `include` de la relación inversa): basta saber si
    // existe una fila, sin traer ninguna.
    const comuna = await prisma.comuna.findFirst({
      where: { provinciaId: id },
      select: { id: true },
    });

    return comuna !== null;
  },
};
