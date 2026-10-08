import { Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/database/prisma";
import { nombreCompleto } from "@/modules/usuarios/domain/entities/Usuario";
import {
  formatoDesdeTipoContenido,
  type CargaBioestadistica,
  type MotivoFalloCargaBioestadistica,
} from "@/modules/bioestadistica/domain/entities/CargaBioestadistica";
import { CargaBioestadisticaEnProcesoError } from "@/modules/bioestadistica/domain/errors/CargaBioestadisticaEnProcesoError";
import type {
  CargaBioestadisticaRepository,
  CargaFallidaConArchivo,
  ResultadoActivacionCargaBioestadistica,
} from "@/modules/bioestadistica/domain/repositories/CargaBioestadisticaRepository";

const CODIGO_UNIQUE_VIOLADO = "P2002";
// Índices únicos parciales de la migración `rf37_perfil_bioestadistica`.
const INDICE_PROCESANDO = "carga_bioestadistica_procesando_key";
const INDICE_ACTIVA = "carga_bioestadistica_activa_key";

// Tope defensivo de las lecturas propias no paginadas (panel e historial): por construcción hay a lo
// más una ACTIVA y un PROCESANDO por (año, tipo); solo las FALLIDA y REEMPLAZADA se acumulan.
const TOPE_PANEL = 200;
const TOPE_HISTORIAL = 1000;

const ESTADOS_DESCARGABLES = ["ACTIVA", "REEMPLAZADA"] as const;

// ¿Es un P2002 causado por el índice indicado? Con `@prisma/adapter-pg` el nombre del índice solo
// aparece en `meta.driverAdapterError.cause` (mismo criterio que `PrismaCargaArchivoRepository`).
// Nunca se registra el mensaje: solo se usa para clasificar.
function esViolacionDeIndice(error: unknown, indice: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== CODIGO_UNIQUE_VIOLADO) return false;

  const meta = error.meta as
    | { target?: unknown; driverAdapterError?: { cause?: { originalMessage?: unknown; constraint?: unknown } } }
    | undefined;
  const causa = meta?.driverAdapterError?.cause;

  return [meta?.target, causa?.originalMessage, causa?.constraint].some((candidato) => {
    if (typeof candidato === "string") return candidato.includes(indice);
    if (Array.isArray(candidato)) return candidato.includes(indice);
    if (candidato && typeof candidato === "object") return JSON.stringify(candidato).includes(indice);
    return false;
  });
}

// Selección explícita con usuario y establecimiento en la MISMA consulta (sin N+1). Nunca las filas.
const SELECCION = {
  id: true,
  anio: true,
  tipoArchivo: true,
  usuarioId: true,
  usuario: { select: { nombres: true, apellidos: true, rut: true } },
  establecimientoId: true,
  establecimiento: { select: { nombre: true } },
  nombreArchivoOriginal: true,
  tipoContenidoArchivo: true,
  tamanoBytes: true,
  sha256: true,
  encabezados: true,
  cantidadFilasDatos: true,
  estado: true,
  motivoFallo: true,
  procesadaEn: true,
  desactivadaEn: true,
  reemplazadaPorCargaId: true,
  createdAt: true,
} as const;

type RegistroCarga = Prisma.CargaBioestadisticaGetPayload<{ select: typeof SELECCION }>;

function aCarga(registro: RegistroCarga): CargaBioestadistica {
  return {
    id: registro.id,
    anio: registro.anio,
    tipoArchivo: registro.tipoArchivo,
    usuarioId: registro.usuarioId,
    usuarioNombre: nombreCompleto(registro.usuario),
    usuarioRut: registro.usuario.rut,
    establecimientoId: registro.establecimientoId,
    establecimientoNombre: registro.establecimiento.nombre,
    nombreArchivoOriginal: registro.nombreArchivoOriginal,
    tipoContenidoArchivo: registro.tipoContenidoArchivo,
    // 300 MB como máximo: cabe sin pérdida en un `number`.
    tamanoBytes: Number(registro.tamanoBytes),
    sha256: registro.sha256,
    encabezados: registro.encabezados,
    cantidadFilasDatos: registro.cantidadFilasDatos,
    estado: registro.estado,
    motivoFallo: registro.motivoFallo as MotivoFalloCargaBioestadistica | null,
    procesadaEn: registro.procesadaEn,
    desactivadaEn: registro.desactivadaEn,
    reemplazadaPorCargaId: registro.reemplazadaPorCargaId,
    createdAt: registro.createdAt,
  };
}

// Rechazo de negocio dentro de la transacción de activación: provoca el rollback y se traduce
// fuera a un resultado `{ ok: false }`.
class RechazoActivacion extends Error {
  constructor(readonly motivo: "REEMPLAZO_NO_AUTORIZADO" | "NO_PROCESANDO") {
    super(motivo);
    this.name = "RechazoActivacion";
  }
}

// Filas borradas por sentencia: acota la duración de cada DELETE, el WAL que genera y los bloqueos
// que retiene, en vez de un único DELETE de hasta 2 millones de filas.
const TAMANO_LOTE_BORRADO_FILAS = 50_000;

// Borra por lotes las filas de una carga SOLO mientras su cabecera esté FALLIDA. La condición va
// dentro de CADA sentencia (`EXISTS` sobre la cabecera), así que no hay ventana entre comprobar y
// borrar. FALLIDA es un estado terminal: ninguna transición la vuelve vigente, por lo que una vez
// cierta la condición no puede dejar de serlo a mitad del borrado. Las filas de una ACTIVA o una
// REEMPLAZADA (histórico descargable) nunca se tocan. Cada lote es su propia sentencia, sin una
// transacción que los abarque (superaría el timeout); un corte a mitad deja filas de una FALLIDA, que
// nunca son datos vigentes, y la siguiente limpieza las retoma. Devuelve cuántas borró.
async function borrarFilasDeCargaFallidaPorLotes(cargaId: string): Promise<number> {
  let total = 0;

  for (;;) {
    const borradas = await prisma.$executeRaw`
      DELETE FROM carga_bioestadistica_fila
      WHERE ctid IN (
        SELECT f.ctid
        FROM carga_bioestadistica_fila f
        WHERE f."cargaBioestadisticaId" = ${cargaId}
          AND EXISTS (
            SELECT 1 FROM carga_bioestadistica c
            WHERE c.id = ${cargaId} AND c.estado = 'FALLIDA'::"EstadoCargaBioestadistica"
          )
        LIMIT ${TAMANO_LOTE_BORRADO_FILAS}
      )`;

    total += borradas;
    if (borradas < TAMANO_LOTE_BORRADO_FILAS) return total;
  }
}

// PROCESANDO → FALLIDA con su motivo y la ruta anulada, con un update CONDICIONAL y atómico (si otro
// proceso ya la resolvió no toca nada); RECIÉN DESPUÉS se borran sus filas por lotes, cada lote
// condicionado a que siga FALLIDA. Como el cambio de estado ocurre antes del borrado, ningún lector
// que filtre `estado = 'ACTIVA'` ve filas a medio borrar, y una activación concurrente ya no puede
// ganar (su update exige PROCESANDO). Devuelve la referencia que tenía, para eliminar el archivo
// después (el disco no participa de la base).
async function marcarFallidaYLimpiar(
  cargaId: string,
  motivo: MotivoFalloCargaBioestadistica,
): Promise<CargaFallidaConArchivo | null> {
  const actual = await prisma.cargaBioestadistica.findFirst({
    where: { id: cargaId, estado: "PROCESANDO" },
    select: { rutaArchivo: true },
  });
  if (!actual) return null;

  const marcada = await prisma.cargaBioestadistica.updateMany({
    where: { id: cargaId, estado: "PROCESANDO" },
    data: { estado: "FALLIDA", motivoFallo: motivo, rutaArchivo: null },
  });
  if (marcada.count !== 1) return null;

  await borrarFilasDeCargaFallidaPorLotes(cargaId);
  return { id: cargaId, referenciaArchivo: actual.rutaArchivo };
}

// Por el índice único de PROCESANDO son a lo más unas pocas (una por usuario, año y tipo): se
// resuelven en paralelo, cada una con su propio update condicional.
async function marcarVariasComoInterrumpidas(ids: string[]): Promise<CargaFallidaConArchivo[]> {
  const resultados = await Promise.all(ids.map((id) => marcarFallidaYLimpiar(id, "PROCESAMIENTO_INTERRUMPIDO")));
  return resultados.filter((resultado): resultado is CargaFallidaConArchivo => resultado !== null);
}

export const prismaCargaBioestadisticaRepository: CargaBioestadisticaRepository = {
  async crearProcesando(datos) {
    try {
      const registro = await prisma.cargaBioestadistica.create({
        data: {
          id: datos.id,
          anio: datos.anio,
          tipoArchivo: datos.tipoArchivo,
          usuarioId: datos.usuarioId,
          establecimientoId: datos.establecimientoId,
          nombreArchivoOriginal: datos.nombreArchivoOriginal,
          tipoContenidoArchivo: datos.tipoContenidoArchivo,
          rutaArchivo: datos.referenciaArchivo,
          tamanoBytes: BigInt(datos.tamanoBytes),
          sha256: datos.sha256,
          encabezados: datos.encabezados,
          estado: "PROCESANDO",
        },
        select: SELECCION,
      });
      return aCarga(registro);
    } catch (error) {
      if (esViolacionDeIndice(error, INDICE_PROCESANDO)) throw new CargaBioestadisticaEnProcesoError();
      throw error;
    }
  },

  async obtenerActiva(usuarioId, anio, tipoArchivo) {
    const registro = await prisma.cargaBioestadistica.findFirst({
      where: { usuarioId, anio, tipoArchivo, estado: "ACTIVA" },
      select: SELECCION,
    });
    return registro ? aCarga(registro) : null;
  },

  async existeProcesandoVigente(usuarioId, anio, tipoArchivo, limiteExpiracion) {
    const cantidad = await prisma.cargaBioestadistica.count({
      where: { usuarioId, anio, tipoArchivo, estado: "PROCESANDO", createdAt: { gte: limiteExpiracion } },
    });
    return cantidad > 0;
  },

  async obtenerPropia(id, usuarioId) {
    const registro = await prisma.cargaBioestadistica.findFirst({ where: { id, usuarioId }, select: SELECCION });
    return registro ? aCarga(registro) : null;
  },

  async obtenerParaProcesar(id) {
    const registro = await prisma.cargaBioestadistica.findUnique({
      where: { id },
      select: {
        id: true,
        usuarioId: true,
        anio: true,
        tipoArchivo: true,
        estado: true,
        tipoContenidoArchivo: true,
        rutaArchivo: true,
        encabezados: true,
      },
    });

    if (!registro) return null;

    return {
      id: registro.id,
      usuarioId: registro.usuarioId,
      anio: registro.anio,
      tipoArchivo: registro.tipoArchivo,
      estado: registro.estado,
      formato: formatoDesdeTipoContenido(registro.tipoContenidoArchivo),
      referenciaArchivo: registro.rutaArchivo,
      encabezados: registro.encabezados,
    };
  },

  async insertarFilas(cargaId, filas) {
    if (filas.length === 0) return;

    // Un lote = una sentencia `INSERT` masiva, sin una transacción que abarque todos los lotes.
    await prisma.cargaBioestadisticaFila.createMany({
      data: filas.map((fila) => ({
        cargaBioestadisticaId: cargaId,
        numeroFila: fila.numeroFila,
        valores: fila.valores as Prisma.InputJsonObject,
      })),
    });
  },

  async activar(datos): Promise<ResultadoActivacionCargaBioestadistica> {
    try {
      await prisma.$transaction(async (tx) => {
        if (datos.reemplazo) {
          const { cargaAnteriorId, solicitudId } = datos.reemplazo;

          const solicitud = await tx.solicitudReemplazoBioestadistica.findUnique({
            where: { id: solicitudId },
            select: { motivo: true },
          });

          // Consumo condicional: actúa como mutex contra un consumo concurrente. La vigencia por
          // fecha ya se evaluó al recibir el archivo.
          const consumo = await tx.solicitudReemplazoBioestadistica.updateMany({
            where: { id: solicitudId, cargaBioestadisticaId: cargaAnteriorId, estado: "APROBADA", utilizadaEn: null },
            data: { utilizadaEn: datos.procesadaEn, nuevaCargaBioestadisticaId: datos.cargaId },
          });
          if (consumo.count !== 1) throw new RechazoActivacion("REEMPLAZO_NO_AUTORIZADO");

          // Primero se desactiva la anterior: así el índice único de ACTIVA no choca al activar.
          const desactivada = await tx.cargaBioestadistica.updateMany({
            where: { id: cargaAnteriorId, estado: "ACTIVA" },
            data: {
              estado: "REEMPLAZADA",
              desactivadaEn: datos.procesadaEn,
              reemplazadaPorCargaId: datos.cargaId,
              motivoDesactivacion: solicitud?.motivo ?? null,
            },
          });
          if (desactivada.count !== 1) throw new RechazoActivacion("REEMPLAZO_NO_AUTORIZADO");
        }

        const activada = await tx.cargaBioestadistica.updateMany({
          where: { id: datos.cargaId, estado: "PROCESANDO" },
          data: { estado: "ACTIVA", cantidadFilasDatos: datos.cantidadFilasDatos, procesadaEn: datos.procesadaEn },
        });
        if (activada.count !== 1) throw new RechazoActivacion("NO_PROCESANDO");
      });

      return { ok: true };
    } catch (error) {
      if (error instanceof RechazoActivacion) return { ok: false, motivo: error.motivo };
      // Otra carga quedó ACTIVA para el mismo (usuario, año, tipo) mientras esta se procesaba.
      if (esViolacionDeIndice(error, INDICE_ACTIVA)) return { ok: false, motivo: "YA_REPORTADO" };
      throw error;
    }
  },

  async marcarFallida(cargaId, motivo) {
    return marcarFallidaYLimpiar(cargaId, motivo);
  },

  async eliminarFilasDeCargaFallida(cargaId) {
    return borrarFilasDeCargaFallidaPorLotes(cargaId);
  },

  async marcarExpiradasComoFallidas(usuarioId, anio, tipoArchivo, limiteExpiracion) {
    // `createdAt` se compara contra un instante que viaja como parámetro (nunca `now()` de la base).
    const expiradas = await prisma.cargaBioestadistica.findMany({
      where: { usuarioId, anio, tipoArchivo, estado: "PROCESANDO", createdAt: { lt: limiteExpiracion } },
      select: { id: true },
    });
    return marcarVariasComoInterrumpidas(expiradas.map((carga) => carga.id));
  },

  async marcarProcesandoAnterioresComoFallidas(creadasAntesDe) {
    const procesando = await prisma.cargaBioestadistica.findMany({
      where: { estado: "PROCESANDO", createdAt: { lt: creadasAntesDe } },
      select: { id: true },
    });
    return marcarVariasComoInterrumpidas(procesando.map((carga) => carga.id));
  },

  async listarParaPanel(usuarioId) {
    const registros = await prisma.cargaBioestadistica.findMany({
      where: { usuarioId, estado: { in: ["ACTIVA", "PROCESANDO", "FALLIDA"] } },
      select: SELECCION,
      orderBy: { createdAt: "desc" },
      take: TOPE_PANEL,
    });
    return registros.map(aCarga);
  },

  async listarHistorialPropio(usuarioId) {
    const registros = await prisma.cargaBioestadistica.findMany({
      where: { usuarioId, estado: { in: [...ESTADOS_DESCARGABLES] } },
      select: SELECCION,
      orderBy: { createdAt: "desc" },
      take: TOPE_HISTORIAL,
    });
    return registros.map(aCarga);
  },

  async listarParaAdministracion(filtro) {
    const where: Prisma.CargaBioestadisticaWhereInput = {
      anio: filtro.anio,
      estado: { in: [...ESTADOS_DESCARGABLES] },
      ...(filtro.tipoArchivo ? { tipoArchivo: filtro.tipoArchivo } : {}),
    };

    // `Promise.all` y no `$transaction` de arreglo: mismo motivo documentado en
    // `PrismaCargaArchivoRepository.listarPropias` (consultas con relaciones sobre una sola conexión).
    const [registros, total] = await Promise.all([
      prisma.cargaBioestadistica.findMany({
        where,
        select: SELECCION,
        orderBy: [{ estado: "asc" }, { createdAt: "desc" }],
        skip: (filtro.pagina - 1) * filtro.tamano,
        take: filtro.tamano,
      }),
      prisma.cargaBioestadistica.count({ where }),
    ]);

    return { filas: registros.map(aCarga), total };
  },

  async listarAniosConCargas() {
    const grupos = await prisma.cargaBioestadistica.groupBy({
      by: ["anio"],
      where: { estado: { in: [...ESTADOS_DESCARGABLES] } },
      orderBy: { anio: "desc" },
    });
    return grupos.map((grupo) => grupo.anio);
  },

  async obtenerArchivoPropio(id, usuarioId) {
    const registro = await prisma.cargaBioestadistica.findFirst({
      where: { id, usuarioId, estado: { in: [...ESTADOS_DESCARGABLES] }, rutaArchivo: { not: null } },
      select: { nombreArchivoOriginal: true, tipoContenidoArchivo: true, rutaArchivo: true },
    });
    return registro?.rutaArchivo
      ? {
          nombreArchivoOriginal: registro.nombreArchivoOriginal,
          tipoContenidoArchivo: registro.tipoContenidoArchivo,
          referenciaArchivo: registro.rutaArchivo,
        }
      : null;
  },

  async obtenerArchivo(id) {
    const registro = await prisma.cargaBioestadistica.findFirst({
      where: { id, estado: { in: [...ESTADOS_DESCARGABLES] }, rutaArchivo: { not: null } },
      select: { nombreArchivoOriginal: true, tipoContenidoArchivo: true, rutaArchivo: true },
    });
    return registro?.rutaArchivo
      ? {
          nombreArchivoOriginal: registro.nombreArchivoOriginal,
          tipoContenidoArchivo: registro.tipoContenidoArchivo,
          referenciaArchivo: registro.rutaArchivo,
        }
      : null;
  },
};
