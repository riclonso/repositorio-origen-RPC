import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/infrastructure/database/prisma";
import type { PasswordResetToken } from "@/modules/auth/domain/entities/PasswordResetToken";
import { DIAS_RETENCION_TOKEN } from "@/modules/auth/domain/entities/PasswordResetToken";
import { puedeRecibirEnlaceContrasena } from "@/modules/auth/domain/entities/User";
import type {
  PasswordResetTokenRepository,
  ResultadoConsumoToken,
} from "@/modules/auth/domain/repositories/PasswordResetTokenRepository";

// Espacio de nombres de los cerrojos consultivos de este archivo, para no chocar con los de
// ningún otro uso futuro de `pg_advisory_xact_lock`. Es el int4 con firma que corresponde a los
// bytes ASCII de "RF10".
const ESPACIO_CERROJO_RECUPERACION = 0x5246_3130;

// Deriva un int4 con firma a partir del id del usuario, para usarlo como segunda clave del
// cerrojo consultivo. Se calcula aquí y no con `hashtext()` de PostgreSQL para no depender de
// una función interna y sin documentar. Una colisión entre dos usuarios distintos solo provoca
// que sus emisiones se serialicen entre sí, algo inocuo.
function claveCerrojo(usuarioId: string): number {
  return createHash("sha256").update(usuarioId, "utf8").digest().readInt32BE(0);
}

type FilaToken = {
  id: string;
  usuarioId: string;
  expiraEn: Date;
  usadoEn: Date | null;
  invalidadoEn: Date | null;
  createdAt: Date;
};

// Error interno para forzar el ROLLBACK de la transacción de consumo cuando la cuenta ya no
// puede iniciar sesión. No sale nunca de este archivo: se traduce a un resultado de dominio.
class CuentaInactivaError extends Error {}

export const prismaPasswordResetTokenRepository: PasswordResetTokenRepository = {
  async crear(datos): Promise<PasswordResetToken | null> {
    const ahora = new Date();
    const limiteRetencion = new Date(
      ahora.getTime() - DIAS_RETENCION_TOKEN * 24 * 60 * 60 * 1000,
    );
    const id = randomUUID();

    return prisma.$transaction(async (transaccion) => {
      // Cerrojo consultivo por usuario, liberado automáticamente al cerrar la transacción.
      // Sin él, el cupo NO se sostiene: en READ COMMITTED cada sentencia toma su propio
      // instantáneo y no ve las filas que otras transacciones aún no confirmaron, así que una
      // ráfaga simultánea contaría cero en todas y todas insertarían. El cerrojo serializa a
      // los emisores de una misma cuenta, y como el conteo va en una sentencia POSTERIOR a
      // adquirirlo, esa sentencia sí ve lo que el emisor anterior dejó confirmado.
      //
      // Consultivo y no `SELECT ... FOR UPDATE` sobre `usuario`: no toca ninguna fila real, así
      // que no puede entrelazarse con los cerrojos de fila que toma el consumo del token
      // (`consumir`) ni con una edición del mantenedor, y no abre ninguna vía de interbloqueo.
      await transaccion.$executeRaw`
        SELECT pg_advisory_xact_lock(${ESPACIO_CERROJO_RECUPERACION}::int, ${claveCerrojo(datos.usuarioId)}::int)
      `;

      // La purga es oportunista y acotada al usuario que solicita: sin cron, sin barrido global
      // y sin job externo. Va en la misma transacción que la emisión para que la tabla se
      // mantenga diminuta sin que nadie tenga que acordarse de limpiarla. No interfiere con el
      // cupo, que solo mira la última hora.
      await transaccion.tokenRecuperacion.deleteMany({
        where: { usuarioId: datos.usuarioId, createdAt: { lt: limiteRetencion } },
      });

      // El cupo por cuenta lo decide la BASE, en la MISMA sentencia que inserta: si ya hay
      // `maximoPorCuenta` filas en la ventana, el WHERE no se cumple, no se inserta nada y el
      // RETURNING devuelve cero filas. Contar en una consulta y después insertar en otra sería
      // un TOCTOU evadible con peticiones simultáneas.
      //
      // Las fechas viajan como parámetros casteados a `timestamp` y JAMÁS como `now()`: así el
      // SQL crudo escribe y compara exactamente el mismo reloj de pared en UTC que escribe
      // Prisma por el API tipado, sin que el `TimeZone` de la sesión intervenga en ningún punto.
      // Ver la nota de convención en `prisma/schema.prisma`.
      //
      // `tokenHash` no entra en el RETURNING: el hash entra como argumento y no vuelve.
      //
      // El camino público inserta SIEMPRE con origen AUTOSERVICIO, y el conteo del cupo cuenta
      // SOLO tokens AUTOSERVICIO: los enlaces que emite el administrador (origen ADMIN) no gastan
      // el cupo de la persona, para que un reenvío legítimo del admin nunca choque contra el tope
      // del formulario público.
      const creados = await transaccion.$queryRaw<FilaToken[]>`
        INSERT INTO "token_recuperacion" ("id", "usuarioId", "tokenHash", "origen", "expiraEn", "createdAt")
        SELECT
          ${id}::text,
          ${datos.usuarioId}::text,
          ${datos.tokenHash}::varchar(64),
          'AUTOSERVICIO'::varchar(20),
          ${datos.expiraEn}::timestamp,
          ${ahora}::timestamp
        WHERE (
          SELECT count(*) FROM "token_recuperacion"
          WHERE "usuarioId" = ${datos.usuarioId}::text
            AND "origen" = 'AUTOSERVICIO'
            AND "createdAt" > ${datos.inicioVentana}::timestamp
        ) < ${datos.maximoPorCuenta}::int
        RETURNING "id", "usuarioId", "expiraEn", "usadoEn", "invalidadoEn", "createdAt"
      `;

      // Cero filas significa cupo agotado. Quien llama responde exactamente lo mismo que en el
      // camino feliz: el cupo jamás puede ser observable desde fuera.
      return creados[0] ?? null;
    });
  },

  async emitirParaAdmin(datos): Promise<PasswordResetToken> {
    const ahora = new Date();
    const id = randomUUID();

    return prisma.$transaction(async (transaccion) => {
      // Mismo cerrojo consultivo por usuario que `crear`: serializa a los emisores de una misma
      // cuenta (por ejemplo, el after() de la creación y un reenvío manual casi simultáneo), de
      // modo que "invalidar los vigentes y luego insertar" no se entrelace con otra emisión.
      await transaccion.$executeRaw`
        SELECT pg_advisory_xact_lock(${ESPACIO_CERROJO_RECUPERACION}::int, ${claveCerrojo(datos.usuarioId)}::int)
      `;

      // Un enlace admin nuevo reemplaza a cualquier enlace vigente de la cuenta (de cualquier
      // origen): así el último que el administrador emite es el único que funciona, y un enlace
      // viejo que quedó en un correo anterior deja de servir.
      await transaccion.tokenRecuperacion.updateMany({
        where: { usuarioId: datos.usuarioId, usadoEn: null, invalidadoEn: null },
        data: { invalidadoEn: ahora },
      });

      // Sin cupo (acción autenticada del admin). Las fechas viajan casteadas a `timestamp`, misma
      // convención que `crear` y `consumir`; nunca `now()`.
      const creados = await transaccion.$queryRaw<FilaToken[]>`
        INSERT INTO "token_recuperacion" ("id", "usuarioId", "tokenHash", "origen", "expiraEn", "createdAt")
        VALUES (
          ${id}::text,
          ${datos.usuarioId}::text,
          ${datos.tokenHash}::varchar(64),
          'ADMIN'::varchar(20),
          ${datos.expiraEn}::timestamp,
          ${ahora}::timestamp
        )
        RETURNING "id", "usuarioId", "expiraEn", "usadoEn", "invalidadoEn", "createdAt"
      `;

      // El INSERT incondicional siempre produce una fila; el `?? ` es solo para el tipo.
      const creado = creados[0];
      if (!creado) {
        throw new Error("No se pudo emitir el token de contraseña");
      }
      return creado;
    });
  },

  async invalidar(id) {
    await prisma.tokenRecuperacion.updateMany({
      where: { id, usadoEn: null, invalidadoEn: null },
      data: { invalidadoEn: new Date() },
    });
  },

  async consumir(tokenHash, contrasenaHash): Promise<ResultadoConsumoToken> {
    const ahora = new Date();

    try {
      return await prisma.$transaction(async (transaccion) => {
        // Mismo orden de bloqueo que el mantenedor: usuario primero, tokens después.
        // Serializa enlaces distintos de una misma cuenta y evita interbloqueos al
        // invalidar los demás tokens o cambiar la contraseña desde el administrador.
        await transaccion.$queryRaw`
          SELECT u.id FROM usuario u
          JOIN token_recuperacion t ON t."usuarioId" = u.id
          WHERE t."tokenHash" = ${tokenHash}::varchar(64)
          FOR UPDATE OF u
        `;
        // Reclamo atómico: una única sentencia condicional con RETURNING. Si otra petición
        // llegó primero, esta devuelve cero filas. "Leer, validar y después marcar" sería una
        // condición de carrera que permitiría usar el mismo enlace dos veces.
        //
        // Prisma Client no expone `UPDATE ... RETURNING` condicional con esta semántica. El
        // parámetro viaja por la plantilla etiquetada, nunca concatenado.
        //
        // El instante viaja como parámetro casteado a `timestamp` y NO como `now()`: así la
        // comparación de vencimiento y la marca de consumo usan el mismo reloj que escribió
        // `expiraEn`, y un token vencido está vencido con cualquier `TimeZone` de sesión.
        // `"expiraEn" > now()` era justamente el error: `now()` es `timestamptz`, la columna no
        // lo es, y PostgreSQL resolvía la comparación convirtiendo la columna con el `TimeZone`
        // de la sesión, así que el token vivía el desfase de más (tres horas con
        // America/Santiago, cuatro en horario de verano). El mismo error corrompía los datos:
        // `SET "usadoEn" = now()` guardaba hora local mientras `createdAt` guardaba UTC.
        const reclamados = await transaccion.$queryRaw<{ id: string; usuarioId: string }[]>`
          UPDATE "token_recuperacion"
          SET "usadoEn" = ${ahora}::timestamp
          WHERE "tokenHash" = ${tokenHash}::varchar(64)
            AND "usadoEn" IS NULL
            AND "invalidadoEn" IS NULL
            AND "expiraEn" > ${ahora}::timestamp
          RETURNING "id", "usuarioId"
        `;

        const reclamado = reclamados[0];

        if (!reclamado) {
          return { ok: false, motivo: "TOKEN_INVALIDO" } as const;
        }

        const usuario = await transaccion.usuario.findUnique({
          where: { id: reclamado.usuarioId },
          // Se lee `contrasenaHash` SOLO para saber si era nulo (cuenta pendiente que se activa
          // con este consumo): ese booleano alimenta el motivo de auditoría. El hash en sí no
          // sale de la transacción; solo se evalúa aquí.
          select: { id: true, rut: true, activo: true, contrasenaHash: true },
        });

        // Se vuelve a verificar dentro de la transacción porque un administrador pudo desactivar
        // la cuenta entre la solicitud y el clic. Es `puedeRecibirEnlaceContrasena` y NO
        // `puedeIniciarSesion`: una cuenta pendiente (hash nulo) todavía no puede iniciar sesión,
        // pero SÍ debe poder consumir el enlace para fijar su primera contraseña; exigir
        // `puedeIniciarSesion` aquí haría ROLLBACK y la activación nunca ocurriría. Lanzar
        // provoca el ROLLBACK, dejando el token sin consumir y la contraseña intacta.
        if (!usuario || !puedeRecibirEnlaceContrasena(usuario)) {
          throw new CuentaInactivaError();
        }

        const activacion = usuario.contrasenaHash === null;

        await transaccion.usuario.update({
          where: { id: usuario.id },
          // `sesionVersion` se incrementa junto con el hash: los otros dos caminos que cambian
          // `contrasenaHash` (fijado manual admin y autoservicio propio, ambos vía
          // `PrismaUsuarioRepository.actualizarContrasena`) ya lo hacen, así que los tres caminos
          // quedan simétricos y cualquier sesión abierta con la contraseña anterior deja de ser
          // válida (ver `JwtService.verificarSesion`).
          data: { contrasenaHash, sesionVersion: { increment: 1 } },
          select: { id: true },
        });

        // Invariante del proyecto: todo cambio de `usuario.contrasenaHash` invalida los tokens
        // vigentes de esa cuenta. Tras retirar el camino del administrador que fijaba hash
        // directo, esta es la ÚNICA vía por la que cambia `contrasenaHash`, así que la invariante
        // vive aquí; la emisión admin (`emitirParaAdmin`) además invalida los vigentes al emitir.
        await transaccion.tokenRecuperacion.updateMany({
          where: { usuarioId: usuario.id, usadoEn: null, invalidadoEn: null },
          data: { invalidadoEn: ahora },
        });

        return {
          ok: true,
          usuarioId: usuario.id,
          usuarioRut: usuario.rut,
          activacion,
        } as const;
      });
    } catch (error) {
      if (error instanceof CuentaInactivaError) {
        return { ok: false, motivo: "CUENTA_INACTIVA" };
      }

      throw error;
    }
  },
};
