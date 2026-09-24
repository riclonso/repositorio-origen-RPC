import { prisma } from "@/infrastructure/database/prisma";
import type {
  ResultadoIntentoFallido,
  UserRepository,
} from "@/modules/auth/domain/repositories/UserRepository";
import type { User } from "@/modules/auth/domain/entities/User";

function aUser(registro: {
  id: string;
  nombres: string;
  apellidos: string;
  rut: string;
  email: string;
  username: string;
  // Nullable: una cuenta pendiente de activación todavía no tiene hash. `aUser` solo ensancha el
  // tipo; el hash sigue sin salir por ningún camino distinto del login.
  contrasenaHash: string | null;
  perfilCodigo: string;
  activo: boolean;
  createdAt: Date;
  sesionVersion: number;
  intentosFallidos: number;
  bloqueadaHasta: Date | null;
  vecesBloqueada: number;
}): User {
  return {
    id: registro.id,
    nombres: registro.nombres,
    apellidos: registro.apellidos,
    rut: registro.rut,
    email: registro.email,
    username: registro.username,
    contrasenaHash: registro.contrasenaHash,
    perfilCodigo: registro.perfilCodigo,
    activo: registro.activo,
    createdAt: registro.createdAt,
    sesionVersion: registro.sesionVersion,
    intentosFallidos: registro.intentosFallidos,
    bloqueadaHasta: registro.bloqueadaHasta,
    vecesBloqueada: registro.vecesBloqueada,
  };
}

type FilaIntentoFallido = {
  intentosFallidos: number;
  vecesBloqueada: number;
  bloqueadaHasta: Date | null;
};

export const prismaUserRepository: UserRepository = {
  async buscarPorRut(rut): Promise<User | null> {
    const registro = await prisma.usuario.findUnique({ where: { rut } });
    return registro ? aUser(registro) : null;
  },

  async buscarPorId(id): Promise<User | null> {
    const registro = await prisma.usuario.findUnique({ where: { id } });
    return registro ? aUser(registro) : null;
  },

  // El email se persiste normalizado en minúsculas (ver `emailSchema`), así que quien llame
  // debe entregarlo ya normalizado: el UNIQUE de PostgreSQL distingue mayúsculas.
  async buscarPorEmail(email): Promise<User | null> {
    const registro = await prisma.usuario.findUnique({ where: { email } });
    return registro ? aUser(registro) : null;
  },

  async obtenerVersionSesion(id): Promise<number | null> {
    const registro = await prisma.usuario.findUnique({
      where: { id },
      select: { sesionVersion: true },
    });

    return registro ? registro.sesionVersion : null;
  },

  // Sentencia condicional única: Prisma Client no expresa "incrementa, o resetea y activa un
  // bloqueo" de forma declarativa, mismo motivo ya documentado en `consumir()` de
  // `PrismaPasswordResetTokenRepository`. `duracionesMinutos` viaja como `int[]` de PostgreSQL;
  // `LEAST(vecesBloqueada + 1, array_length(...))` evita salirse del arreglo cuando la cuenta ya
  // fue bloqueada más veces que duraciones definidas (techo en la última duración), y nunca baja
  // de 1 porque PostgreSQL indexa arreglos desde 1.
  async registrarIntentoFallido(
    id,
    ahora,
    maximoIntentos,
    duracionesMinutos,
  ): Promise<ResultadoIntentoFallido> {
    const filas = await prisma.$queryRaw<FilaIntentoFallido[]>`
      UPDATE "usuario"
      SET
        "intentosFallidos" = CASE
          WHEN "intentosFallidos" + 1 >= ${maximoIntentos} THEN 0
          ELSE "intentosFallidos" + 1
        END,
        "vecesBloqueada" = CASE
          WHEN "intentosFallidos" + 1 >= ${maximoIntentos} THEN "vecesBloqueada" + 1
          ELSE "vecesBloqueada"
        END,
        "bloqueadaHasta" = CASE
          WHEN "intentosFallidos" + 1 >= ${maximoIntentos} THEN
            ${ahora}::timestamp + (
              (${duracionesMinutos}::int[])[LEAST("vecesBloqueada" + 1, array_length(${duracionesMinutos}::int[], 1))]
              * interval '1 minute'
            )
          ELSE "bloqueadaHasta"
        END
      WHERE "id" = ${id}::text
      RETURNING "intentosFallidos", "vecesBloqueada", "bloqueadaHasta"
    `;

    const fila = filas[0];

    if (!fila) {
      // El id viene de una fila recién leída (`buscarPorRut`) dentro del mismo `loginUser`: no
      // debería desaparecer entre una consulta y otra, pero se traduce a un error explícito en
      // vez de devolver un resultado inventado.
      throw new Error("No se pudo registrar el intento fallido: el usuario no existe");
    }

    return fila;
  },

  async resetearIntentosFallidos(id): Promise<void> {
    await prisma.usuario.update({
      where: { id },
      data: { intentosFallidos: 0, bloqueadaHasta: null },
      select: { id: true },
    });
  },
};
