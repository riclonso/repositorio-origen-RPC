import { Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/database/prisma";
import type { UsuarioRepository } from "@/modules/usuarios/domain/repositories/UsuarioRepository";
import type {
  CampoUnico,
  FiltroListadoUsuarios,
  Usuario,
} from "@/modules/usuarios/domain/entities/Usuario";
import { CODIGO_PERFIL_ADMIN } from "@/modules/perfiles/domain/entities/Perfil";
import { UsuarioDuplicadoError } from "@/modules/usuarios/domain/errors/UsuarioDuplicadoError";
import { PerfilInvalidoError } from "@/modules/usuarios/domain/errors/PerfilInvalidoError";

// Selección explícita: `contrasenaHash` nunca sale del repositorio en este módulo. El nombre del
// perfil se trae en la misma consulta (lectura de UNA fila con su perfil, no hay N+1).
const SELECCION_USUARIO = {
  id: true,
  nombres: true,
  apellidos: true,
  rut: true,
  email: true,
  username: true,
  perfilCodigo: true,
  perfil: { select: { nombre: true } },
  activo: true,
  createdAt: true,
} as const;

type RegistroUsuario = {
  id: string;
  nombres: string;
  apellidos: string;
  rut: string;
  email: string;
  username: string;
  perfilCodigo: string;
  perfil: { nombre: string };
  activo: boolean;
  createdAt: Date;
};

// Aplana el perfil anidado que devuelve Prisma a los dos campos planos del dominio.
function aUsuario(registro: RegistroUsuario): Usuario {
  return {
    id: registro.id,
    nombres: registro.nombres,
    apellidos: registro.apellidos,
    rut: registro.rut,
    email: registro.email,
    username: registro.username,
    perfilCodigo: registro.perfilCodigo,
    perfilNombre: registro.perfil.nombre,
    activo: registro.activo,
    createdAt: registro.createdAt,
  };
}

const CODIGO_UNIQUE_VIOLADO = "P2002";
const CODIGO_FK_VIOLADA = "P2003";
const MAXIMO_TOKENS_BUSQUEDA = 5;

function campoDesdeConflicto(error: Prisma.PrismaClientKnownRequestError): CampoUnico {
  const objetivo = error.meta?.target;
  const texto = Array.isArray(objetivo) ? objetivo.join(",") : String(objetivo ?? "");

  if (texto.includes("email")) return "email";
  if (texto.includes("username")) return "username";
  return "rut";
}

// El perfil enviado se valida antes de escribir, así que llegar aquí significa que el perfil
// desapareció entre la comprobación y el INSERT. Se traduce igual que el duplicado, para que el
// borde responda 400 y no un 500 por violación de clave foránea.
function traducirConflicto(error: unknown, perfilCodigo: string): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === CODIGO_UNIQUE_VIOLADO) {
      throw new UsuarioDuplicadoError(campoDesdeConflicto(error));
    }

    if (error.code === CODIGO_FK_VIOLADA) {
      throw new PerfilInvalidoError(perfilCodigo);
    }
  }

  throw error;
}

// El backslash es el carácter de escape por defecto de LIKE en PostgreSQL: se neutralizan los
// comodines para que un término con "%" no traiga la tabla completa.
function escaparComodines(token: string): string {
  return token.replace(/[\\%_]/g, (caracter) => `\\${caracter}`);
}

// El listado es la única consulta en SQL crudo del repositorio. Motivo: Prisma Client no expone
// `unaccent()` en su API de consultas (`contains` + `mode: "insensitive"` ignora mayúsculas pero
// no tildes), y la búsqueda del padrón debe encontrar "Muñoz" escribiendo "munoz". El término
// SIEMPRE viaja como parámetro de la plantilla etiquetada de Prisma, nunca concatenado.
function construirPredicado(filtro: FiltroListadoUsuarios): Prisma.Sql {
  const condiciones: Prisma.Sql[] = [Prisma.sql`TRUE`];

  // El filtro por perfil compara el código en la propia tabla `usuario`: no necesita el JOIN.
  if (filtro.perfil) {
    condiciones.push(Prisma.sql`u."perfilCodigo" = ${filtro.perfil}`);
  }

  if (filtro.activo !== undefined) {
    condiciones.push(Prisma.sql`u."activo" = ${filtro.activo}`);
  }

  const tokens = (filtro.termino ?? "")
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .slice(0, MAXIMO_TOKENS_BUSQUEDA);

  // Cada token debe calzar en al menos una columna (OR) y todos los tokens deben calzar (AND),
  // para que "juan perez" encuentre nombres y apellidos por separado.
  for (const token of tokens) {
    const patron = `%${escaparComodines(token)}%`;

    condiciones.push(Prisma.sql`(
      unaccent(u."nombres") ILIKE unaccent(${patron})
      OR unaccent(u."apellidos") ILIKE unaccent(${patron})
      OR unaccent(u."email") ILIKE unaccent(${patron})
      OR u."rut" ILIKE ${patron}
    )`);
  }

  return Prisma.join(condiciones, " AND ");
}

type FilaListado = {
  id: string;
  nombres: string;
  apellidos: string;
  rut: string;
  email: string;
  username: string;
  perfilCodigo: string;
  perfilNombre: string;
  activo: boolean;
  createdAt: Date;
};

function aUsuarioDesdeFila(fila: FilaListado): Usuario {
  return aUsuario({
    id: String(fila.id),
    nombres: String(fila.nombres),
    apellidos: String(fila.apellidos),
    rut: String(fila.rut),
    email: String(fila.email),
    username: String(fila.username),
    perfilCodigo: String(fila.perfilCodigo),
    perfil: { nombre: String(fila.perfilNombre) },
    activo: Boolean(fila.activo),
    createdAt: fila.createdAt instanceof Date ? fila.createdAt : new Date(fila.createdAt),
  });
}

export const prismaUsuarioRepository: UsuarioRepository = {
  async listar(filtro) {
    // Un único predicado compartido por las filas y el conteo: duplicar el filtro es la causa
    // clásica de que el total y las filas dejen de coincidir.
    const predicado = construirPredicado(filtro);
    const salto = (filtro.pagina - 1) * filtro.tamano;

    // El desempate por `id` es obligatorio: sin él, dos homónimos pueden repetirse o perderse
    // entre páginas. Ambas consultas van en la misma transacción para ver el mismo snapshot.
    // El JOIN con `perfil` es interno y no LEFT: la clave foránea NOT NULL garantiza contraparte,
    // y un LEFT JOIN escondería una inconsistencia devolviendo un nombre vacío.
    const [filas, conteo] = await prisma.$transaction([
      prisma.$queryRaw<FilaListado[]>`
        SELECT u."id", u."nombres", u."apellidos", u."rut", u."email", u."username",
               u."perfilCodigo", p."nombre" AS "perfilNombre", u."activo", u."createdAt"
        FROM "usuario" u
        JOIN "perfil" p ON p."codigo" = u."perfilCodigo"
        WHERE ${predicado}
        ORDER BY u."apellidos" ASC, u."nombres" ASC, u."id" ASC
        LIMIT ${filtro.tamano} OFFSET ${salto}
      `,
      prisma.$queryRaw<{ total: bigint }[]>`
        SELECT COUNT(*) AS "total"
        FROM "usuario" u
        WHERE ${predicado}
      `,
    ]);

    return {
      filas: filas.map(aUsuarioDesdeFila),
      total: Number(conteo[0]?.total ?? 0),
    };
  },

  async obtenerPorId(id) {
    const registro = await prisma.usuario.findUnique({
      where: { id },
      select: SELECCION_USUARIO,
    });

    return registro ? aUsuario(registro) : null;
  },

  async buscarConflicto(valores, excluirId) {
    const alternativas: Prisma.UsuarioWhereInput[] = [];

    if (valores.rut) alternativas.push({ rut: valores.rut });
    if (valores.email) alternativas.push({ email: valores.email });
    if (valores.username) alternativas.push({ username: valores.username });

    if (alternativas.length === 0) {
      return null;
    }

    const registro = await prisma.usuario.findFirst({
      where: {
        OR: alternativas,
        ...(excluirId ? { NOT: { id: excluirId } } : {}),
      },
      select: { rut: true, email: true, username: true },
    });

    if (!registro) return null;
    if (valores.rut && registro.rut === valores.rut) return "rut";
    if (valores.email && registro.email === valores.email) return "email";
    if (valores.username && registro.username === valores.username) return "username";
    return null;
  },

  contarAdminsActivos() {
    return prisma.usuario.count({
      where: { perfilCodigo: CODIGO_PERFIL_ADMIN, activo: true },
    });
  },

  async crear(datos) {
    try {
      const registro = await prisma.usuario.create({
        data: {
          nombres: datos.nombres,
          apellidos: datos.apellidos,
          rut: datos.rut,
          email: datos.email,
          username: datos.username,
          contrasenaHash: datos.contrasenaHash,
          perfilCodigo: datos.perfilCodigo,
          activo: datos.activo,
        },
        select: SELECCION_USUARIO,
      });

      return aUsuario(registro);
    } catch (error) {
      traducirConflicto(error, datos.perfilCodigo);
    }
  },

  async actualizar(id, datos) {
    try {
      const registro = await prisma.usuario.update({
        where: { id },
        data: {
          nombres: datos.nombres,
          apellidos: datos.apellidos,
          email: datos.email,
          perfilCodigo: datos.perfilCodigo,
        },
        select: SELECCION_USUARIO,
      });

      return aUsuario(registro);
    } catch (error) {
      traducirConflicto(error, datos.perfilCodigo);
    }
  },

  async cambiarEstado(id, activo) {
    const registro = await prisma.usuario.update({
      where: { id },
      data: { activo },
      select: SELECCION_USUARIO,
    });

    return aUsuario(registro);
  },

  // Invariante del proyecto: TODO cambio de `usuario.contrasenaHash` invalida los tokens de
  // recuperación vigentes de esa cuenta. Se hace cumplir aquí, en la única capa que escribe esa
  // columna por el camino del administrador, y no con un puerto inyectado en cada caso de uso:
  // así lo hereda por construcción cualquier caso de uso futuro que reutilice este método.
  // La otra implementación de la misma invariante está en
  // `PrismaPasswordResetTokenRepository.consumir`; si se cambia una, revisar la otra.
  async actualizarContrasena(id, contrasenaHash) {
    await prisma.$transaction([
      prisma.usuario.update({
        where: { id },
        data: { contrasenaHash },
        select: { id: true },
      }),
      prisma.tokenRecuperacion.updateMany({
        where: { usuarioId: id, usadoEn: null, invalidadoEn: null },
        data: { invalidadoEn: new Date() },
      }),
    ]);
  },
};
