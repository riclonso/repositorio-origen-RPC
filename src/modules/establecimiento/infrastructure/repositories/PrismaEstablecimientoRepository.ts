import { Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/database/prisma";
import type { EstablecimientoRepository } from "@/modules/establecimiento/domain/repositories/EstablecimientoRepository";
import type {
  CampoUnico,
  Establecimiento,
  FiltroListadoEstablecimientos,
} from "@/modules/establecimiento/domain/entities/Establecimiento";
import { EstablecimientoDuplicadoError } from "@/modules/establecimiento/domain/errors/EstablecimientoDuplicadoError";
import { TipoInvalidoError } from "@/modules/establecimiento/domain/errors/TipoInvalidoError";

// Selección explícita. El nombre del tipo se trae en la misma consulta (lectura de UNA fila con
// su tipo, no hay N+1).
const SELECCION_ESTABLECIMIENTO = {
  id: true,
  rut: true,
  nombre: true,
  direccion: true,
  tipoId: true,
  tipo: { select: { nombre: true } },
  activo: true,
  createdAt: true,
} as const;

type RegistroEstablecimiento = {
  id: string;
  rut: string;
  nombre: string;
  direccion: string;
  tipoId: string;
  tipo: { nombre: string };
  activo: boolean;
  createdAt: Date;
};

// Mapper explícito: aplana el tipo anidado que devuelve Prisma a los dos campos planos del
// dominio (`tipoId` estable, `tipoNombre` visible).
function aEstablecimiento(registro: RegistroEstablecimiento): Establecimiento {
  return {
    id: registro.id,
    rut: registro.rut,
    nombre: registro.nombre,
    direccion: registro.direccion,
    tipoId: registro.tipoId,
    tipoNombre: registro.tipo.nombre,
    activo: registro.activo,
    createdAt: registro.createdAt,
  };
}

const CODIGO_UNIQUE_VIOLADO = "P2002";
const CODIGO_FK_VIOLADA = "P2003";
const MAXIMO_TOKENS_BUSQUEDA = 5;

// El único campo único es el RUT: cualquier P2002 corresponde a él.
function traducirConflicto(error: unknown, tipoId: string): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === CODIGO_UNIQUE_VIOLADO) {
      throw new EstablecimientoDuplicadoError("rut");
    }

    if (error.code === CODIGO_FK_VIOLADA) {
      throw new TipoInvalidoError(tipoId);
    }
  }

  throw error;
}

// El backslash es el carácter de escape por defecto de LIKE en PostgreSQL: se neutralizan los
// comodines para que un término con "%" no traiga la tabla completa.
function escaparComodines(token: string): string {
  return token.replace(/[\\%_]/g, (caracter) => `\\${caracter}`);
}

// El listado va en SQL crudo por el mismo motivo que el de usuarios: Prisma Client no expone
// `unaccent()`, y la búsqueda debe encontrar "Clínica" escribiendo "clinica". El término SIEMPRE
// viaja como parámetro de la plantilla etiquetada de Prisma, nunca concatenado.
function construirPredicado(filtro: FiltroListadoEstablecimientos): Prisma.Sql {
  const condiciones: Prisma.Sql[] = [Prisma.sql`TRUE`];

  if (filtro.tipo) {
    condiciones.push(Prisma.sql`e."tipoId" = ${filtro.tipo}`);
  }

  if (filtro.activo !== undefined) {
    condiciones.push(Prisma.sql`e."activo" = ${filtro.activo}`);
  }

  const tokens = (filtro.termino ?? "")
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .slice(0, MAXIMO_TOKENS_BUSQUEDA);

  // Cada token debe calzar en al menos una columna (OR) y todos los tokens deben calzar (AND).
  for (const token of tokens) {
    const patron = `%${escaparComodines(token)}%`;

    condiciones.push(Prisma.sql`(
      unaccent(e."nombre") ILIKE unaccent(${patron})
      OR unaccent(e."direccion") ILIKE unaccent(${patron})
      OR e."rut" ILIKE ${patron}
    )`);
  }

  return Prisma.join(condiciones, " AND ");
}

type FilaListado = {
  id: string;
  rut: string;
  nombre: string;
  direccion: string;
  tipoId: string;
  tipoNombre: string;
  activo: boolean;
  createdAt: Date;
};

function aEstablecimientoDesdeFila(fila: FilaListado): Establecimiento {
  return {
    id: String(fila.id),
    rut: String(fila.rut),
    nombre: String(fila.nombre),
    direccion: String(fila.direccion),
    tipoId: String(fila.tipoId),
    tipoNombre: String(fila.tipoNombre),
    activo: Boolean(fila.activo),
    createdAt: fila.createdAt instanceof Date ? fila.createdAt : new Date(fila.createdAt),
  };
}

export const prismaEstablecimientoRepository: EstablecimientoRepository = {
  async listar(filtro) {
    // Un único predicado compartido por las filas y el conteo: duplicarlo es la causa clásica de
    // que el total y las filas dejen de coincidir.
    const predicado = construirPredicado(filtro);
    const salto = (filtro.pagina - 1) * filtro.tamano;

    // El desempate por `id` es obligatorio: sin él, dos homónimos pueden repetirse o perderse
    // entre páginas. Ambas consultas van en la misma transacción para ver el mismo snapshot. El
    // JOIN con `tipo_establecimiento` es interno y no LEFT: la FK NOT NULL garantiza contraparte.
    const [filas, conteo] = await prisma.$transaction([
      prisma.$queryRaw<FilaListado[]>`
        SELECT e."id", e."rut", e."nombre", e."direccion", e."tipoId",
               t."nombre" AS "tipoNombre", e."activo", e."createdAt"
        FROM "establecimiento" e
        JOIN "tipo_establecimiento" t ON t."id" = e."tipoId"
        WHERE ${predicado}
        ORDER BY e."nombre" ASC, e."id" ASC
        LIMIT ${filtro.tamano} OFFSET ${salto}
      `,
      prisma.$queryRaw<{ total: bigint }[]>`
        SELECT COUNT(*) AS "total"
        FROM "establecimiento" e
        WHERE ${predicado}
      `,
    ]);

    return {
      filas: filas.map(aEstablecimientoDesdeFila),
      total: Number(conteo[0]?.total ?? 0),
    };
  },

  async obtenerPorId(id) {
    const registro = await prisma.establecimiento.findUnique({
      where: { id },
      select: SELECCION_ESTABLECIMIENTO,
    });

    return registro ? aEstablecimiento(registro) : null;
  },

  async buscarConflicto(valores, excluirId): Promise<CampoUnico | null> {
    if (!valores.rut) {
      return null;
    }

    const registro = await prisma.establecimiento.findFirst({
      where: {
        rut: valores.rut,
        ...(excluirId ? { NOT: { id: excluirId } } : {}),
      },
      select: { rut: true },
    });

    return registro ? "rut" : null;
  },

  async crear(datos) {
    try {
      const registro = await prisma.establecimiento.create({
        data: {
          rut: datos.rut,
          nombre: datos.nombre,
          direccion: datos.direccion,
          tipoId: datos.tipoId,
        },
        select: SELECCION_ESTABLECIMIENTO,
      });

      return aEstablecimiento(registro);
    } catch (error) {
      traducirConflicto(error, datos.tipoId);
    }
  },

  async actualizar(id, datos) {
    try {
      const registro = await prisma.establecimiento.update({
        where: { id },
        data: {
          rut: datos.rut,
          nombre: datos.nombre,
          direccion: datos.direccion,
          tipoId: datos.tipoId,
        },
        select: SELECCION_ESTABLECIMIENTO,
      });

      return aEstablecimiento(registro);
    } catch (error) {
      traducirConflicto(error, datos.tipoId);
    }
  },

  async cambiarEstado(id, activo) {
    const registro = await prisma.establecimiento.update({
      where: { id },
      data: { activo },
      select: SELECCION_ESTABLECIMIENTO,
    });

    return aEstablecimiento(registro);
  },
};
