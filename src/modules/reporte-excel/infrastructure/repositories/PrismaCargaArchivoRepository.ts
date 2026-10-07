import { Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/database/prisma";
import { logger } from "@/infrastructure/logging/logger";
import { nombreCompleto } from "@/modules/usuarios/domain/entities/Usuario";
import type { CargaArchivoRepository } from "@/modules/reporte-excel/domain/repositories/CargaArchivoRepository";
import { marcarSolicitudUtilizadaEnTransaccion } from "@/modules/solicitudes-reemplazo/infrastructure/repositories/PrismaSolicitudReemplazoCargaRepository";
import type {
  CargaArchivo,
  CargaArchivoResumenConPublicacion,
  CargaArchivoResumenPropia,
  DatosNuevaCargaArchivo,
  DatosPublicacionCarga,
  DatosRechazoCargaArchivo,
  ErrorCargaArchivo,
  FiltroListadoCargasPendientesODecididas,
  InfoRechazoCargaArchivo,
  ResultadoFinalizarCargaArchivo,
  ValorCeldaArchivo,
} from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import {
  reaperturaAutorizaReemplazo,
  type CargaArchivoRechazo,
} from "@/modules/reporte-excel/domain/entities/CargaArchivoRechazo";
import { solicitudUtilizable } from "@/modules/solicitudes-reemplazo/domain/entities/SolicitudReemplazoCarga";
import { ventanaAdmiteAutorizaciones } from "@/modules/ventanas-carga/domain/entities/VentanaCarga";

// Filas de detalle insertadas por sentencia `createMany`: `TOPE_FILAS_DATOS` (20.000, ver
// `domain/entities/CargaArchivo.ts`) por hasta ~4 columnas de parámetros por fila se acerca al
// límite de 65.535 parámetros ligados de PostgreSQL, así que se trocea. Todos los lotes corren
// dentro de la MISMA transacción abierta (ver `darVistoBueno`), no una por lote de forma aislada.
const TAMANO_LOTE_FILAS_PUBLICADAS = 5_000;

const COMENTARIO_SOLICITUD_CERRADA_POR_RECHAZO =
  "Cerrada automáticamente: la carga fue rechazada y ya puedes volver a subir un archivo.";

// JSONB no admite `Date`: cada valor de celda se serializa a un tipo que Prisma acepta para un
// campo `Json`, con las fechas ya convertidas a ISO string (mismo criterio de tipos que el resto
// del módulo aplica tras serializar, ver DTOs de `_lib/http.ts`).
function serializarValorCelda(valor: ValorCeldaArchivo): Prisma.InputJsonValue | null {
  if (valor instanceof Date) return valor.toISOString();
  return valor;
}

function serializarFilaParaPublicar(valores: Record<string, ValorCeldaArchivo>): Prisma.InputJsonObject {
  // Se construye sobre un `Record` mutable (el índice de `Prisma.InputJsonObject` es de solo
  // lectura) y se castea al devolver: es la misma forma final, solo evita el error de tipos al
  // ensamblarla campo a campo.
  const resultado: Record<string, Prisma.InputJsonValue | null> = {};
  for (const [nombreColumna, valor] of Object.entries(valores)) {
    resultado[nombreColumna] = serializarValorCelda(valor);
  }
  return resultado as Prisma.InputJsonObject;
}

const SELECCION_ERROR = {
  id: true,
  numeroFila: true,
  columna: true,
  tipoError: true,
  mensaje: true,
} as const;

// Join hacia el rechazo (si existe): `nombres`/`apellidos` de quien rechazó se resuelven aquí para
// no exigir una consulta aparte, mismo criterio que `usuario`/`ventanaCarga`.
const SELECCION_RECHAZO = {
  motivo: true,
  rechazadoEn: true,
  rechazadoPor: { select: { nombres: true, apellidos: true } },
} as const;

const SELECCION_DETALLE = {
  id: true,
  formatoExcelId: true,
  formatoExcel: { select: { nombre: true } },
  ventanaCargaId: true,
  ventanaCarga: { select: { anio: true } },
  usuarioId: true,
  usuario: { select: { nombres: true, apellidos: true, rut: true } },
  nombreArchivoOriginal: true,
  tipoContenidoArchivo: true,
  cantidadFilasDatos: true,
  cantidadErrores: true,
  estado: true,
  vistoBuenoEn: true,
  vistoBuenoPorId: true,
  finalizadaEn: true,
  createdAt: true,
  updatedAt: true,
  errores: { select: SELECCION_ERROR, orderBy: { numeroFila: "asc" } },
  rechazo: { select: SELECCION_RECHAZO },
} as const;

// El listado (propio o de aprobadas) nunca trae `errores` ni el binario: es la vista liviana
// equivalente a `FormatoExcelResumen`.
const SELECCION_RESUMEN = {
  id: true,
  formatoExcelId: true,
  formatoExcel: { select: { nombre: true } },
  ventanaCargaId: true,
  ventanaCarga: { select: { anio: true } },
  usuarioId: true,
  usuario: { select: { nombres: true, apellidos: true, rut: true } },
  nombreArchivoOriginal: true,
  cantidadFilasDatos: true,
  cantidadErrores: true,
  estado: true,
  vistoBuenoEn: true,
  finalizadaEn: true,
  createdAt: true,
  rechazo: { select: SELECCION_RECHAZO },
} as const;

type RegistroRechazo = {
  motivo: string;
  rechazadoEn: Date;
  rechazadoPor: { nombres: string; apellidos: string };
} | null;

type RegistroDetalle = {
  id: string;
  formatoExcelId: string;
  formatoExcel: { nombre: string };
  ventanaCargaId: string;
  ventanaCarga: { anio: number };
  usuarioId: string;
  usuario: { nombres: string; apellidos: string; rut: string };
  nombreArchivoOriginal: string;
  tipoContenidoArchivo: string;
  cantidadFilasDatos: number;
  cantidadErrores: number;
  estado: CargaArchivo["estado"];
  vistoBuenoEn: Date | null;
  vistoBuenoPorId: string | null;
  finalizadaEn: Date | null;
  createdAt: Date;
  updatedAt: Date;
  errores: ErrorCargaArchivo[];
  rechazo: RegistroRechazo;
};

type RegistroResumen = Omit<
  RegistroDetalle,
  "tipoContenidoArchivo" | "vistoBuenoPorId" | "updatedAt" | "errores"
>;

function aInfoRechazo(rechazo: RegistroRechazo): InfoRechazoCargaArchivo | null {
  if (!rechazo) return null;

  return {
    motivo: rechazo.motivo,
    rechazadoEn: rechazo.rechazadoEn,
    rechazadoPorNombre: nombreCompleto(rechazo.rechazadoPor),
  };
}

function aCargaArchivo(registro: RegistroDetalle): CargaArchivo {
  return {
    id: registro.id,
    formatoExcelId: registro.formatoExcelId,
    formatoExcelNombre: registro.formatoExcel.nombre,
    ventanaCargaId: registro.ventanaCargaId,
    anio: registro.ventanaCarga.anio,
    usuarioId: registro.usuarioId,
    usuarioNombre: nombreCompleto(registro.usuario),
    usuarioRut: registro.usuario.rut,
    nombreArchivoOriginal: registro.nombreArchivoOriginal,
    tipoContenidoArchivo: registro.tipoContenidoArchivo,
    cantidadFilasDatos: registro.cantidadFilasDatos,
    cantidadErrores: registro.cantidadErrores,
    estado: registro.estado,
    vistoBuenoEn: registro.vistoBuenoEn,
    vistoBuenoPorId: registro.vistoBuenoPorId,
    finalizadaEn: registro.finalizadaEn,
    createdAt: registro.createdAt,
    updatedAt: registro.updatedAt,
    errores: registro.errores,
    rechazo: aInfoRechazo(registro.rechazo),
  };
}

function aCargaArchivoResumen(registro: RegistroResumen) {
  return {
    id: registro.id,
    formatoExcelId: registro.formatoExcelId,
    formatoExcelNombre: registro.formatoExcel.nombre,
    ventanaCargaId: registro.ventanaCargaId,
    anio: registro.ventanaCarga.anio,
    usuarioId: registro.usuarioId,
    usuarioNombre: nombreCompleto(registro.usuario),
    usuarioRut: registro.usuario.rut,
    nombreArchivoOriginal: registro.nombreArchivoOriginal,
    cantidadFilasDatos: registro.cantidadFilasDatos,
    cantidadErrores: registro.cantidadErrores,
    estado: registro.estado,
    vistoBuenoEn: registro.vistoBuenoEn,
    finalizadaEn: registro.finalizadaEn,
    createdAt: registro.createdAt,
    rechazo: aInfoRechazo(registro.rechazo),
  };
}

// Extensión de `SELECCION_RESUMEN` exclusiva de `listarPropiasAprobadas` ("Mis cargas"): agrega la
// publicación (si esta carga llegó a `APROBADA`) para poder resolver el motivo de reemplazo. No se
// agrega al `SELECCION_RESUMEN` compartido para no sumar ese join a los demás listados
// (`listarAprobadas`, `listarPendientesODecididas`, `listarRechazadas`) que no lo necesitan.
const SELECCION_RESUMEN_PROPIA = {
  ...SELECCION_RESUMEN,
  publicacion: { select: { motivoDesactivacion: true, motivoDesactivacionTipo: true, desactivadaEn: true } },
} as const;

type RegistroResumenPropia = RegistroResumen & {
  publicacion: {
    motivoDesactivacion: string | null;
    motivoDesactivacionTipo: "REEMPLAZO" | "RECHAZO" | null;
    desactivadaEn: Date | null;
  } | null;
};

// Combina las dos fuentes posibles del motivo (ver comentario de `CargaArchivoResumenPropia` en el
// dominio): `rechazo.motivo`/`rechazo.rechazadoEn` cuando `estado = RECHAZADA` (siempre presente
// ahí, exista o no publicación), o `publicacion.motivoDesactivacion`/`desactivadaEn` cuando la
// carga sí llegó a `APROBADA` y luego fue reemplazada o rechazada. Nunca conviven ambas fuentes con
// valores distintos: un rechazo desde `APROBADA` escribe el mismo motivo y fecha en las dos tablas
// en la misma transacción (ver `rechazar()` más abajo).
function aCargaArchivoResumenPropia(registro: RegistroResumenPropia): CargaArchivoResumenPropia {
  return {
    ...aCargaArchivoResumen(registro),
    motivoDesactivacion: registro.rechazo?.motivo ?? registro.publicacion?.motivoDesactivacion ?? null,
    motivoDesactivacionTipo: registro.rechazo ? "RECHAZO" : (registro.publicacion?.motivoDesactivacionTipo ?? null),
    desactivadaEn: registro.rechazo?.rechazadoEn ?? registro.publicacion?.desactivadaEn ?? null,
  };
}

// Extensión de `SELECCION_RESUMEN` para el panel del notificador (`listarPropias`,
// `listarDeterminantesPanelPropias`): solo `activo` de la publicación (join 1:1, sin N+1). No se
// agrega al `SELECCION_RESUMEN` compartido para no sumar ese join a los listados que no lo usan.
const SELECCION_RESUMEN_CON_PUBLICACION = {
  ...SELECCION_RESUMEN,
  publicacion: { select: { activo: true } },
} as const;

type RegistroResumenConPublicacion = RegistroResumen & { publicacion: { activo: boolean } | null };

function aCargaArchivoResumenConPublicacion(registro: RegistroResumenConPublicacion): CargaArchivoResumenConPublicacion {
  return {
    ...aCargaArchivoResumen(registro),
    publicacionActiva: registro.publicacion ? registro.publicacion.activo : null,
  };
}

// Predicado de "candidata a vigente": `APROBADA` cuya publicación no fue desactivada (sin
// publicación —cargas antiguas sin backfill— o activa). Compartido por
// `obtenerAprobadaVigentePorUsuarioYVentana` y `listarDeterminantesPanelPropias` para que ambos
// usen exactamente la misma noción de "vigente".
const FILTRO_APROBADA_NO_SUPERADA = {
  estado: "APROBADA" as const,
  OR: [{ publicacion: { is: null } }, { publicacion: { is: { activo: true } } }],
};

const CODIGO_UNIQUE_VIOLADO = "P2002";

// Índice único parcial de la migración `indice_unico_carga_pendiente_finalizada`.
const INDICE_PENDIENTE_FINALIZADA = "carga_archivo_pendiente_finalizada_key";

// ¿Es un P2002 causado por `INDICE_PENDIENTE_FINALIZADA`? Con `@prisma/adapter-pg` el nombre del
// índice no viene en un campo propio: solo aparece en
// `meta.driverAdapterError.cause.originalMessage` (texto del servidor, localizado, p.ej.
// "llave duplicada viola restricción de unicidad «carga_archivo_pendiente_finalizada_key»"). Se
// revisa también `meta.target` por si el motor sin adaptador lo informa ahí. Nunca se registra el
// mensaje: solo se usa para clasificar.
function esViolacionIndicePendienteFinalizada(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== CODIGO_UNIQUE_VIOLADO) {
    return false;
  }

  const meta = error.meta as
    | { target?: unknown; driverAdapterError?: { cause?: { originalMessage?: unknown; constraint?: unknown } } }
    | undefined;
  const causa = meta?.driverAdapterError?.cause;
  const candidatos = [meta?.target, causa?.originalMessage, causa?.constraint];

  return candidatos.some((candidato) => {
    if (typeof candidato === "string") return candidato.includes(INDICE_PENDIENTE_FINALIZADA);
    if (Array.isArray(candidato)) return candidato.includes(INDICE_PENDIENTE_FINALIZADA);
    if (candidato && typeof candidato === "object") {
      return JSON.stringify(candidato).includes(INDICE_PENDIENTE_FINALIZADA);
    }
    return false;
  });
}

// Lectura del detalle (con relaciones) DESPUÉS de confirmar una escritura, fuera de cualquier
// transacción: ver comentario de `crear`. La fila se acaba de escribir, así que su ausencia es una
// falla técnica, no un desenlace de negocio.
async function leerDetalleTrasEscritura(id: string): Promise<CargaArchivo> {
  const registro = await prisma.cargaArchivo.findUnique({ where: { id }, select: SELECCION_DETALLE });
  if (!registro) throw new Error("Carga inexistente al releerla tras una escritura");
  return aCargaArchivo(registro);
}

// Tope defensivo de `listarDeterminantesPanelPropias`.
const TOPE_DETERMINANTES_PANEL = 500;

// Centinela para abortar (rollback) la transacción interactiva de `finalizar()` con un desenlace de
// negocio: Prisma solo revierte si el callback lanza. Se traduce a `{ ok: false, motivo }` afuera.
class RollbackFinalizar extends Error {
  readonly motivo: "CARGA_PENDIENTE_DECISION" | "REEMPLAZO_NO_AUTORIZADO";

  constructor(motivo: "CARGA_PENDIENTE_DECISION" | "REEMPLAZO_NO_AUTORIZADO") {
    super(motivo);
    this.motivo = motivo;
  }
}

// Vista denormalizada de `CargaArchivoRechazo`, mismo criterio que `PrismaSolicitudReemplazoCargaRepository`.
const SELECCION_RECHAZO_ENTIDAD = {
  id: true,
  cargaArchivoId: true,
  cargaArchivo: {
    select: {
      ventanaCargaId: true,
      nombreArchivoOriginal: true,
      formatoExcel: { select: { nombre: true } },
      ventanaCarga: { select: { anio: true, fechaVencimiento: true } },
    },
  },
  motivo: true,
  rechazadoEn: true,
  rechazadoPorId: true,
  rechazadoPor: { select: { nombres: true, apellidos: true } },
  diasReapertura: true,
  reaperturaConsumidaEn: true,
  reaperturaConsumidaPorCargaArchivoId: true,
  createdAt: true,
} as const;

type RegistroRechazoEntidad = Prisma.CargaArchivoRechazoGetPayload<{ select: typeof SELECCION_RECHAZO_ENTIDAD }>;

function aCargaArchivoRechazo(registro: RegistroRechazoEntidad): CargaArchivoRechazo {
  return {
    id: registro.id,
    cargaArchivoId: registro.cargaArchivoId,
    ventanaCargaId: registro.cargaArchivo.ventanaCargaId,
    anio: registro.cargaArchivo.ventanaCarga.anio,
    ventanaFechaVencimiento: registro.cargaArchivo.ventanaCarga.fechaVencimiento,
    formatoExcelNombre: registro.cargaArchivo.formatoExcel.nombre,
    nombreArchivoOriginal: registro.cargaArchivo.nombreArchivoOriginal,
    motivo: registro.motivo,
    rechazadoEn: registro.rechazadoEn,
    rechazadoPorId: registro.rechazadoPorId,
    rechazadoPorNombre: nombreCompleto(registro.rechazadoPor),
    diasReapertura: registro.diasReapertura,
    reaperturaConsumidaEn: registro.reaperturaConsumidaEn,
    reaperturaConsumidaPorCargaArchivoId: registro.reaperturaConsumidaPorCargaArchivoId,
    createdAt: registro.createdAt,
  };
}

function datosCreacionCargaArchivo(datos: DatosNuevaCargaArchivo) {
  return {
    formatoExcelId: datos.formatoExcelId,
    ventanaCargaId: datos.ventanaCargaId,
    usuarioId: datos.usuarioId,
    nombreArchivoOriginal: datos.nombreArchivoOriginal,
    tipoContenidoArchivo: datos.tipoContenidoArchivo,
    // Mismo motivo que `FormatoExcel.contenidoPlantilla`: `Uint8Array.from` produce el tipo
    // exacto que exige el campo `Bytes` generado por Prisma.
    contenidoArchivo: Uint8Array.from(datos.contenidoArchivo),
    cantidadFilasDatos: datos.cantidadFilasDatos,
    cantidadErrores: datos.cantidadErrores,
    estado: datos.estado,
    errores: {
      create: datos.errores.map((error) => ({
        numeroFila: error.numeroFila,
        columna: error.columna,
        tipoError: error.tipoError,
        mensaje: error.mensaje,
      })),
    },
  };
}

// La APROBADA vigente de cada par (ventana, notificador) y si está en reemplazo: solicitud de
// reemplazo utilizable sobre ella, archivo de reemplazo finalizado y pendiente, o reapertura que
// autoriza reemplazarla (mismas reglas que `resolverAutorizacionReemplazo`). Tres consultas para
// todas las ventanas, nunca una por notificador. Las aprobadas llegan por `vistoBuenoEn` desc: la
// primera de cada par es la vigente (criterio de `obtenerAprobadaVigentePorUsuarioYVentana`).
async function resolverAprobadasVigentesEnReemplazo(
  ventanaCargaIds: string[],
  ahora: Date,
): Promise<{ cargaArchivoId: string; ventanaCargaId: string; enReemplazo: boolean }[]> {
  if (ventanaCargaIds.length === 0) return [];

  const [aprobadas, pendientesFinalizadas, rechazosPendientes] = await Promise.all([
    prisma.cargaArchivo.findMany({
      where: { ventanaCargaId: { in: ventanaCargaIds }, ...FILTRO_APROBADA_NO_SUPERADA },
      orderBy: { vistoBuenoEn: "desc" },
      select: {
        id: true,
        usuarioId: true,
        ventanaCargaId: true,
        vistoBuenoEn: true,
        // RF-36: vencimiento (piso del plazo) y estado de la ventana, que decide si una
        // autorización todavía puede usarse (`ventanaAdmiteAutorizaciones`).
        ventanaCarga: { select: { fechaVencimiento: true, publicada: true, archivada: true, eliminadaEn: true } },
        solicitudesReemplazo: {
          where: { estado: "APROBADA", utilizadaEn: null },
          select: { estado: true, utilizadaEn: true, revisadoEn: true, diasVigencia: true },
        },
      },
    }),
    prisma.cargaArchivo.groupBy({
      by: ["ventanaCargaId", "usuarioId"],
      where: { ventanaCargaId: { in: ventanaCargaIds }, estado: "PENDIENTE_VISTO_BUENO", finalizadaEn: { not: null } },
    }),
    prisma.cargaArchivoRechazo.findMany({
      where: { reaperturaConsumidaEn: null, cargaArchivo: { ventanaCargaId: { in: ventanaCargaIds } } },
      orderBy: { rechazadoEn: "desc" },
      select: {
        rechazadoEn: true,
        diasReapertura: true,
        reaperturaConsumidaEn: true,
        cargaArchivo: { select: { usuarioId: true, ventanaCargaId: true } },
      },
    }),
  ]);

  const clavePar = (ventanaCargaId: string, usuarioId: string) => `${ventanaCargaId}|${usuarioId}`;
  const paresConPendiente = new Set(
    pendientesFinalizadas.map((grupo) => clavePar(grupo.ventanaCargaId, grupo.usuarioId)),
  );
  // Solo el rechazo pendiente más reciente de cada par, igual que `resolverAutorizacionReemplazo`.
  const ultimoRechazoPorPar = new Map<string, (typeof rechazosPendientes)[number]>();
  for (const rechazo of rechazosPendientes) {
    const clave = clavePar(rechazo.cargaArchivo.ventanaCargaId, rechazo.cargaArchivo.usuarioId);
    if (!ultimoRechazoPorPar.has(clave)) ultimoRechazoPorPar.set(clave, rechazo);
  }

  const paresVistos = new Set<string>();
  const vigentes: { cargaArchivoId: string; ventanaCargaId: string; enReemplazo: boolean }[] = [];
  for (const aprobada of aprobadas) {
    const clave = clavePar(aprobada.ventanaCargaId, aprobada.usuarioId);
    if (paresVistos.has(clave)) continue;
    paresVistos.add(clave);

    const rechazo = ultimoRechazoPorPar.get(clave);
    const { ventanaCarga } = aprobada;
    // RF-36 (ajuste aprobado): con la ventana archivada o despublicada ninguna autorización puede
    // usarse, así que no deja la aprobada "en reemplazo" (mismo criterio que `resolverVentanaHabilitada`).
    const autorizacionUtilizable =
      ventanaAdmiteAutorizaciones(ventanaCarga) &&
      (aprobada.solicitudesReemplazo.some((solicitud) =>
        solicitudUtilizable({ ...solicitud, ventanaFechaVencimiento: ventanaCarga.fechaVencimiento }, ahora),
      ) ||
        (rechazo !== undefined &&
          reaperturaAutorizaReemplazo(rechazo, { fechaVencimiento: ventanaCarga.fechaVencimiento }, aprobada, ahora)));
    const enReemplazo = paresConPendiente.has(clave) || autorizacionUtilizable;

    vigentes.push({ cargaArchivoId: aprobada.id, ventanaCargaId: aprobada.ventanaCargaId, enReemplazo });
  }

  return vigentes;
}

export const prismaCargaArchivoRepository: CargaArchivoRepository = {
  async crear(datos: DatosNuevaCargaArchivo) {
    // Nested write de una sola escritura: la carga y sus errores en una única operación atómica,
    // mismo patrón que `PrismaFormatoExcelRepository.crear`. La subida ya no consume ninguna
    // autorización (solicitud de reemplazo ni reapertura): eso ocurre en `finalizar()`.
    //
    // La escritura anidada corre en una transacción implícita: devuelve solo el id, y el detalle
    // (con relaciones) se lee después del commit. Leer `SELECCION_DETALLE` dentro de la transacción
    // hace que Prisma 7 + adapter-pg lance consultas paralelas sobre su única conexión (aviso de
    // deprecación de `pg`, error en pg@9). Mismo criterio en `darVistoBueno`, `finalizar` y
    // `rechazar`.
    const creada = await prisma.cargaArchivo.create({
      data: datosCreacionCargaArchivo(datos),
      select: { id: true },
    });

    return leerDetalleTrasEscritura(creada.id);
  },

  async obtenerPorId(id) {
    const registro = await prisma.cargaArchivo.findUnique({ where: { id }, select: SELECCION_DETALLE });
    return registro ? aCargaArchivo(registro) : null;
  },

  async obtenerPropiaPorId(id, usuarioId) {
    const registro = await prisma.cargaArchivo.findFirst({ where: { id, usuarioId }, select: SELECCION_DETALLE });
    return registro ? aCargaArchivo(registro) : null;
  },

  async obtenerAprobadaPorId(id) {
    const registro = await prisma.cargaArchivo.findFirst({
      where: { id, estado: "APROBADA" },
      select: SELECCION_DETALLE,
    });
    return registro ? aCargaArchivo(registro) : null;
  },

  async obtenerAprobadaVigentePorUsuarioYVentana(usuarioId, ventanaCargaId) {
    // La "vigente" es la APROBADA más reciente por `vistoBuenoEn` cuya publicación no fue
    // desactivada: una aprobación ya superada por un reemplazo (publicación `activo = false`) nunca
    // revive como vigente, aunque después se rechace la carga que la reemplazó.
    const registro = await prisma.cargaArchivo.findFirst({
      where: { usuarioId, ventanaCargaId, ...FILTRO_APROBADA_NO_SUPERADA },
      orderBy: { vistoBuenoEn: "desc" },
      select: SELECCION_DETALLE,
    });
    return registro ? aCargaArchivo(registro) : null;
  },

  async obtenerUltimaPorUsuarioYVentana(usuarioId, ventanaCargaId) {
    return prisma.cargaArchivo.findFirst({
      where: { usuarioId, ventanaCargaId },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true },
    });
  },

  async obtenerPendienteFinalizadaPorUsuarioYVentana(usuarioId, ventanaCargaId) {
    const registro = await prisma.cargaArchivo.findFirst({
      where: { usuarioId, ventanaCargaId, estado: "PENDIENTE_VISTO_BUENO", finalizadaEn: { not: null } },
      select: SELECCION_DETALLE,
    });
    return registro ? aCargaArchivo(registro) : null;
  },

  async obtenerContenidoParaProcesar(id, usuarioId) {
    // A diferencia de `obtenerParaDescarga`, no exige `estado = APROBADA`: se necesita el binario
    // antes de esa transición (`DarVistoBueno` reparsea el archivo para construir la publicación).
    const registro = await prisma.cargaArchivo.findFirst({
      where: { id, usuarioId },
      select: {
        tipoContenidoArchivo: true,
        contenidoArchivo: true,
      },
    });

    if (!registro) return null;

    return {
      contenidoArchivo: Buffer.from(registro.contenidoArchivo),
      tipoContenidoArchivo: registro.tipoContenidoArchivo,
    };
  },

  async listarPropias(filtro) {
    const where = {
      usuarioId: filtro.usuarioId,
      ...(filtro.estado ? { estado: filtro.estado } : {}),
      ...(filtro.formatoExcelId ? { formatoExcelId: filtro.formatoExcelId } : {}),
    };

    // `Promise.all` sin transacción (no `$transaction` de arreglo): con Prisma 7 + adapter-pg, una
    // selección con relaciones dentro de una transacción de arreglo dispara consultas paralelas
    // sobre la única conexión de la tx (aviso de deprecación de `pg`). En READ COMMITTED la
    // transacción tampoco daba una foto consistente entre filas y conteo.
    const [registros, total] = await Promise.all([
      prisma.cargaArchivo.findMany({
        where,
        select: SELECCION_RESUMEN_CON_PUBLICACION,
        orderBy: { createdAt: "desc" },
        skip: (filtro.pagina - 1) * filtro.tamano,
        take: filtro.tamano,
      }),
      prisma.cargaArchivo.count({ where }),
    ]);

    return { filas: registros.map(aCargaArchivoResumenConPublicacion), total };
  },

  async listarDeterminantesPanelPropias(usuarioId) {
    // Ownership en el `WHERE`. Tope defensivo (no paginado): por construcción hay a lo más una
    // publicación activa y una pendiente finalizada por ventana; solo las aprobaciones antiguas sin
    // publicación pueden acumularse.
    const registros = await prisma.cargaArchivo.findMany({
      where: {
        usuarioId,
        OR: [FILTRO_APROBADA_NO_SUPERADA, { estado: "PENDIENTE_VISTO_BUENO", finalizadaEn: { not: null } }],
      },
      select: SELECCION_RESUMEN_CON_PUBLICACION,
      orderBy: { createdAt: "desc" },
      take: TOPE_DETERMINANTES_PANEL,
    });

    // Alcanzar el tope no debería ocurrir; si ocurre, alguna tarjeta podría quedar en un estado
    // incorrecto. Se registra como falla técnica (solo el id del usuario y el tope).
    if (registros.length >= TOPE_DETERMINANTES_PANEL) {
      logger.error("Tope alcanzado al listar las cargas determinantes del panel del notificador", {
        usuarioId,
        tope: TOPE_DETERMINANTES_PANEL,
      });
    }

    return registros.map(aCargaArchivoResumenConPublicacion);
  },

  async listarPropiasAprobadas(usuarioId) {
    // Ownership (`usuarioId`) y `estado IN (APROBADA, RECHAZADA)` siempre en el mismo `WHERE`,
    // nunca filtrado en JS después. Incluye `RECHAZADA`: una carga rechazada, aprobada antes o no
    // (RF-22 rechaza también una `PENDIENTE_VISTO_BUENO` que nunca llegó a publicarse), sigue
    // siendo parte del histórico de "Mis cargas" de esa combinación (formato, ventana), con el
    // motivo visible. Tope defensivo (no paginado): evita traer un histórico sin límite si un
    // notificador acumula miles de correcciones sucesivas; la agrupación/paginación de GRUPOS vive
    // en `application/ListarCargasPropiasExitosas.ts`.
    //
    // `NULLS LAST` explícito: una `RECHAZADA` de origen `PENDIENTE_VISTO_BUENO` (RF-22) nunca tuvo
    // `vistoBuenoEn`; sin este orden, Postgres coloca los `NULL` primero en `DESC` por defecto, y
    // esa fila se colaría como "vigente" de su grupo en `agruparCargasAprobadasPorVentana` en vez
    // de la carga que sí llegó a aprobarse.
    const registros = await prisma.cargaArchivo.findMany({
      where: { usuarioId, estado: { in: ["APROBADA", "RECHAZADA"] } },
      select: SELECCION_RESUMEN_PROPIA,
      orderBy: { vistoBuenoEn: { sort: "desc", nulls: "last" } },
      take: 500,
    });

    return registros.map(aCargaArchivoResumenPropia);
  },

  async listarAprobadas(filtro) {
    // El filtro `estado = APROBADA` se aplica siempre aquí, a nivel de consulta SQL, nunca solo
    // en la UI: `/api/dashboard/cargas/*` depende de esta garantía.
    const where = {
      estado: "APROBADA" as const,
      ...(filtro.formatoExcelId ? { formatoExcelId: filtro.formatoExcelId } : {}),
      ...(filtro.ventanaCargaId ? { ventanaCargaId: filtro.ventanaCargaId } : {}),
    };

    const [registros, total] = await prisma.$transaction([
      prisma.cargaArchivo.findMany({
        where,
        select: SELECCION_RESUMEN,
        orderBy: { vistoBuenoEn: "desc" },
        skip: (filtro.pagina - 1) * filtro.tamano,
        take: filtro.tamano,
      }),
      prisma.cargaArchivo.count({ where }),
    ]);

    return { filas: registros.map(aCargaArchivoResumen), total };
  },

  async listarPendientesODecididas(filtro: FiltroListadoCargasPendientesODecididas) {
    // Mismo criterio que `listarAprobadas`: el `WHERE` compuesto se aplica siempre aquí, a nivel de
    // consulta SQL, nunca solo en la UI.
    const where = {
      ventanaCargaId: filtro.ventanaCargaId,
      OR: [
        { estado: "APROBADA" as const },
        { estado: "PENDIENTE_VISTO_BUENO" as const, finalizadaEn: { not: null } },
      ],
    };

    // `Promise.all` sin transacción, mismo motivo que `listarPropias`.
    const [registros, total] = await Promise.all([
      prisma.cargaArchivo.findMany({
        where,
        // Con `publicacion.activo` (join 1:1, sin N+1): la tabla distingue una `APROBADA` ya
        // superada por un reemplazo ("Reemplazada", sin "Rechazar").
        select: SELECCION_RESUMEN_CON_PUBLICACION,
        // Más reciente primero por fecha de ingreso: a diferencia de `listarAprobadas`
        // (`vistoBuenoEn desc`), una `PENDIENTE_VISTO_BUENO` finalizada todavía no tiene
        // `vistoBuenoEn`, así que ese campo dejaría de servir para ordenar esta tabla mixta.
        orderBy: { createdAt: "desc" },
        skip: (filtro.pagina - 1) * filtro.tamano,
        take: filtro.tamano,
      }),
      prisma.cargaArchivo.count({ where }),
    ]);

    return { filas: registros.map(aCargaArchivoResumenConPublicacion), total };
  },

  async contarPendientesFinalizadas() {
    // Mismo predicado que identifica una carga lista para la revisión. Se ejecuta directamente
    // en la base de datos para que el encabezado no tenga que cargar todas las cargas pendientes.
    return prisma.cargaArchivo.count({
      where: { estado: "PENDIENTE_VISTO_BUENO", finalizadaEn: { not: null } },
    });
  },

  async darVistoBueno(id, aprobadoPorId, publicacion: DatosPublicacionCarga) {
    // Transacción interactiva: la transición de estado, la publicación completa (cabecera + TODO
    // el detalle) y la eventual desactivación de la publicación reemplazada corren atómicas. No
    // puede quedar una carga APROBADA sin su publicación completa, ni una publicación anterior sin
    // desactivar si la nueva ya se aprobó.
    //
    // `timeout` explícito (por encima del defecto de Prisma, 5000ms): con el tope de RF-14
    // (`TOPE_FILAS_DATOS = 20_000`) esta transacción puede llegar a hacer 4 lotes de `createMany`
    // además del resto de las escrituras; 5s puede no alcanzar fuera de localhost.
    const aprobada = await prisma.$transaction(async (tx) => {
      // Corrección (fin de la autoaprobación): ya no filtra por `usuarioId` (quien aprueba es un
      // tercero, no el dueño de la carga), y exige `finalizadaEn` no nulo (el notificador ya
      // finalizó y envió). Si cualquiera no calza, no toca ninguna fila. Cierra la ventana de
      // carrera de un doble clic o dos pestañas.
      const resultado = await tx.cargaArchivo.updateMany({
        where: { id, estado: "PENDIENTE_VISTO_BUENO", finalizadaEn: { not: null } },
        data: { estado: "APROBADA", vistoBuenoEn: new Date(), vistoBuenoPorId: aprobadoPorId },
      });

      if (resultado.count === 0) return false;

      const publicada = await tx.cargaArchivoPublicada.create({
        data: { cargaArchivoId: id, publicadoPorId: aprobadoPorId },
        select: { id: true },
      });

      // Inserción masiva troceada en lotes, todos dentro de esta misma transacción abierta: nunca
      // un INSERT por fila.
      for (let inicio = 0; inicio < publicacion.filas.length; inicio += TAMANO_LOTE_FILAS_PUBLICADAS) {
        const lote = publicacion.filas.slice(inicio, inicio + TAMANO_LOTE_FILAS_PUBLICADAS);

        await tx.cargaArchivoPublicadaFila.createMany({
          data: lote.map((fila) => ({
            cargaArchivoPublicadaId: publicada.id,
            numeroFila: fila.numeroFila,
            valores: serializarFilaParaPublicar(fila.valores),
          })),
        });
      }

      // Si esta aprobación reemplaza a la vigente de su combinación (usuario, ventana), TODAS las
      // publicaciones activas de esa combinación distintas de la nueva dejan de ser visibles para el
      // revisor (baja lógica, sus filas de detalle se conservan intactas) y quedan enlazadas a esta
      // carga con el motivo resuelto en `DarVistoBueno`. Barrer la combinación completa (y no solo
      // una carga anterior puntual) garantiza que nunca queden dos publicaciones activas, llegue
      // esta carga por solicitud de reemplazo o por reapertura tras un rechazo.
      if (publicacion.reemplazo) {
        const combinacion = await tx.cargaArchivo.findUnique({
          where: { id },
          select: { usuarioId: true, ventanaCargaId: true },
        });

        // Imposible en la práctica (la fila se acaba de actualizar en esta misma tx). Se lanza en
        // vez de devolver `null` para que Prisma revierta la transición y la publicación ya
        // insertadas: un `return` confirmaría esas escrituras.
        if (!combinacion) throw new Error("Carga inexistente al desactivar publicaciones reemplazadas");

        await tx.cargaArchivoPublicada.updateMany({
          where: {
            activo: true,
            cargaArchivoId: { not: id },
            cargaArchivo: { usuarioId: combinacion.usuarioId, ventanaCargaId: combinacion.ventanaCargaId },
          },
          data: {
            activo: false,
            desactivadaEn: new Date(),
            reemplazadaPorCargaArchivoId: id,
            motivoDesactivacion: publicacion.reemplazo.motivo,
            motivoDesactivacionTipo: "REEMPLAZO",
          },
        });
      }

      return true;
    }, { timeout: 15_000 });

    // Detalle leído después del commit (ver comentario de `crear`).
    return aprobada ? leerDetalleTrasEscritura(id) : null;
  },

  async finalizar(id, usuarioId, consumo): Promise<ResultadoFinalizarCargaArchivo> {
    let finalizada: boolean;

    try {
      finalizada = await prisma.$transaction(async (tx): Promise<boolean> => {
        const ahora = new Date();

        // (a) `updateMany` condicional y atómico: ownership (`usuarioId`), estado y
        // `finalizadaEn IS NULL` en el mismo `WHERE`. Cierra la carrera de un doble clic.
        const resultado = await tx.cargaArchivo.updateMany({
          where: { id, usuarioId, estado: "PENDIENTE_VISTO_BUENO", finalizadaEn: null },
          data: { finalizadaEn: ahora },
        });

        if (resultado.count === 0) return false;

        // Imposible en la práctica (la fila se acaba de actualizar en esta tx): se lanza para
        // revertir, nunca `return`, que confirmaría las escrituras previas.
        const carga = await tx.cargaArchivo.findUnique({ where: { id }, select: { ventanaCargaId: true } });
        if (!carga) throw new Error("Carga inexistente tras marcarla finalizada");

        const combinacion = { usuarioId, ventanaCargaId: carga.ventanaCargaId };

        // (b) Otra carga de la combinación ya finalizada y sin decidir. Ante dos finalizaciones
        // simultáneas que pasen este conteo a la vez, el índice único parcial
        // `carga_archivo_pendiente_finalizada_key` rechaza la segunda con P2002 (traducido abajo).
        const otrasPendientes = await tx.cargaArchivo.count({
          where: {
            ...combinacion,
            id: { not: id },
            estado: "PENDIENTE_VISTO_BUENO",
            finalizadaEn: { not: null },
          },
        });

        if (otrasPendientes > 0) throw new RollbackFinalizar("CARGA_PENDIENTE_DECISION");

        // (c) Consumo de la solicitud de reemplazo (id resuelto por el servidor, nunca del
        // cliente). Escritura cross-módulo dentro de esta misma transacción, a través de la
        // función de infraestructura de `solicitudes-reemplazo`.
        if (consumo.solicitudReemplazoId) {
          const consumida = await marcarSolicitudUtilizadaEnTransaccion(tx, consumo.solicitudReemplazoId, id);
          if (!consumida) throw new RollbackFinalizar("REEMPLAZO_NO_AUTORIZADO");
        }

        // (d) Reaperturas pendientes de la combinación, SIEMPRE (ventana abierta o cerrada): la
        // más reciente queda enlazada a esta carga (`reaperturaConsumidaPorCargaArchivoId`, 1:1) y
        // el resto solo recibe `reaperturaConsumidaEn` (apaga avisos duplicados del banner). Si
        // esta carga ya figura como consumidora de una reapertura (dato heredado de cuando se
        // consumía al subir), no se enlaza otra, para no violar la unicidad 1:1.
        // Una sola lectura: las pendientes de la combinación y, si existe, la ya enlazada a esta carga.
        const rechazos = await tx.cargaArchivoRechazo.findMany({
          where: {
            OR: [
              { reaperturaConsumidaEn: null, cargaArchivo: combinacion },
              { reaperturaConsumidaPorCargaArchivoId: id },
            ],
          },
          orderBy: { rechazadoEn: "desc" },
          select: { id: true, reaperturaConsumidaEn: true, reaperturaConsumidaPorCargaArchivoId: true },
        });
        const reaperturaMasReciente = rechazos.find((rechazo) => rechazo.reaperturaConsumidaEn === null);
        const yaConsumioReapertura = rechazos.some((rechazo) => rechazo.reaperturaConsumidaPorCargaArchivoId === id);

        if (reaperturaMasReciente && !yaConsumioReapertura) {
          await tx.cargaArchivoRechazo.updateMany({
            where: { id: reaperturaMasReciente.id, reaperturaConsumidaEn: null },
            data: { reaperturaConsumidaEn: ahora, reaperturaConsumidaPorCargaArchivoId: id },
          });
        }

        await tx.cargaArchivoRechazo.updateMany({
          where: { reaperturaConsumidaEn: null, cargaArchivo: combinacion },
          data: { reaperturaConsumidaEn: ahora },
        });

        return true;
      });
    } catch (error) {
      if (error instanceof RollbackFinalizar) {
        return { ok: false, motivo: error.motivo };
      }

      // Solo la violación del índice parcial de una `PENDIENTE_VISTO_BUENO` finalizada por (usuario,
      // ventana) es un desenlace de negocio. Cualquier otro P2002 se relanza (la ruta lo registra
      // como error técnico).
      if (esViolacionIndicePendienteFinalizada(error)) {
        return { ok: false, motivo: "CARGA_PENDIENTE_DECISION" };
      }

      throw error;
    }

    if (!finalizada) return { ok: false, motivo: "NO_ENCONTRADO" };

    // (e) Detalle leído después del commit (ver comentario de `crear`).
    return { ok: true, carga: await leerDetalleTrasEscritura(id) };
  },

  async contarNotificadoresReportaronPorVentana(ventanaCargaIds, ahora) {
    const conteoPorVentana: Record<string, number> = {};
    for (const vigente of await resolverAprobadasVigentesEnReemplazo(ventanaCargaIds, ahora)) {
      if (!vigente.enReemplazo) {
        conteoPorVentana[vigente.ventanaCargaId] = (conteoPorVentana[vigente.ventanaCargaId] ?? 0) + 1;
      }
    }
    return conteoPorVentana;
  },

  async listarIdsAprobadasEnReemplazo(ventanaCargaId, ahora) {
    const vigentes = await resolverAprobadasVigentesEnReemplazo([ventanaCargaId], ahora);
    return vigentes.filter((vigente) => vigente.enReemplazo).map((vigente) => vigente.cargaArchivoId);
  },

  async obtenerParaDescarga(id) {
    // Única consulta de todo el módulo que trae `contenidoArchivo` para un revisor. Una pendiente
    // solo queda disponible una vez finalizada por su dueño; un borrador o una carga con errores
    // permanece inaccesible incluso para ADMIN/REVISOR_REPOSITORIO.
    const registro = await prisma.cargaArchivo.findFirst({
      where: {
        id,
        OR: [{ estado: "APROBADA" }, { estado: "PENDIENTE_VISTO_BUENO", finalizadaEn: { not: null } }],
      },
      select: { nombreArchivoOriginal: true, tipoContenidoArchivo: true, contenidoArchivo: true },
    });

    if (!registro) return null;

    return {
      nombreArchivoOriginal: registro.nombreArchivoOriginal,
      tipoContenidoArchivo: registro.tipoContenidoArchivo,
      contenidoArchivo: Buffer.from(registro.contenidoArchivo),
    };
  },

  async obtenerPropiaParaDescarga(id, usuarioId) {
    const registro = await prisma.cargaArchivo.findFirst({
      where: { id, usuarioId },
      select: { nombreArchivoOriginal: true, tipoContenidoArchivo: true, contenidoArchivo: true },
    });

    if (!registro) return null;

    return {
      nombreArchivoOriginal: registro.nombreArchivoOriginal,
      tipoContenidoArchivo: registro.tipoContenidoArchivo,
      contenidoArchivo: Buffer.from(registro.contenidoArchivo),
    };
  },

  async rechazar(id, datos: DatosRechazoCargaArchivo) {
    // Transacción interactiva, mismo criterio que `darVistoBueno`: la transición de estado, el
    // registro del rechazo y la desactivación de la publicación corren atómicas.
    const rechazada = await prisma.$transaction(async (tx) => {
      // Leído ANTES del `updateMany` (dentro de la misma transacción): determina si el origen fue
      // `APROBADA` (hubo publicación que desactivar) o `PENDIENTE_VISTO_BUENO` finalizada (nunca
      // hubo publicación, se salta ese paso sin error).
      // RF-36: también el N vigente de la ventana, que se COPIA en el rechazo (`diasReapertura`)
      // dentro de esta misma transacción: editar la ventana después no cambia el plazo otorgado.
      const previo = await tx.cargaArchivo.findUnique({
        where: { id },
        select: { estado: true, ventanaCarga: { select: { diasVigenciaReemplazo: true } } },
      });

      if (!previo) return false;

      // `updateMany` con `estado IN (APROBADA, PENDIENTE_VISTO_BUENO con finalizadaEn no nulo)` en
      // el mismo `WHERE`: si la carga no existe o ya no está en ninguno de esos dos estados, no
      // toca ninguna fila. Sin restricción de `usuarioId`: cualquier ADMIN/REVISOR_REPOSITORIO
      // puede rechazar cualquier carga (simétrico, mismo criterio que `RevisarSolicitudReemplazo`).
      // Una `APROBADA` ya superada por un reemplazo (publicación `activo = false`) NO es
      // rechazable: su rechazo crearía una reapertura posterior a la aprobación vigente, que
      // autorizaría (`reaperturaAutorizaReemplazo`) un reemplazo que nadie pidió. Mismo predicado
      // de "no superada" que la vigente.
      const resultado = await tx.cargaArchivo.updateMany({
        where: {
          id,
          OR: [FILTRO_APROBADA_NO_SUPERADA, { estado: "PENDIENTE_VISTO_BUENO", finalizadaEn: { not: null } }],
        },
        data: { estado: "RECHAZADA" },
      });

      if (resultado.count === 0) return false;

      await tx.cargaArchivoRechazo.create({
        data: {
          cargaArchivoId: id,
          rechazadoPorId: datos.rechazadoPorId,
          motivo: datos.motivo,
          diasReapertura: previo.ventanaCarga.diasVigenciaReemplazo,
        },
      });

      // Una solicitud de reemplazo todavía PENDIENTE sobre esta carga pierde sentido: el rechazo ya
      // reabre la combinación. Se cierra en la misma transacción (escritura cross-módulo directa por
      // Prisma: debe quedar dentro de esta transacción). Una solicitud ya APROBADA (camino RF-22, que es el que
      // dispara este rechazo) no se toca.
      await tx.solicitudReemplazoCarga.updateMany({
        where: { cargaArchivoId: id, estado: "PENDIENTE" },
        data: {
          estado: "RECHAZADA",
          revisadoPorId: datos.rechazadoPorId,
          revisadoEn: new Date(),
          comentarioRevision: COMENTARIO_SOLICITUD_CERRADA_POR_RECHAZO,
        },
      });

      // La publicación deja de ser visible para el revisor (baja lógica, su detalle se conserva
      // intacto), igual que en un reemplazo, pero sin `reemplazadaPorCargaArchivoId`: en el momento
      // del rechazo todavía no existe una carga de reemplazo. Solo aplica si el origen era
      // `APROBADA`: una `PENDIENTE_VISTO_BUENO` nunca llegó a publicarse.
      if (previo.estado === "APROBADA") {
        await tx.cargaArchivoPublicada.updateMany({
          where: { cargaArchivoId: id },
          data: {
            activo: false,
            desactivadaEn: new Date(),
            motivoDesactivacion: datos.motivo,
            motivoDesactivacionTipo: "RECHAZO",
          },
        });
      }

      return true;
    });

    // Detalle leído después del commit (ver comentario de `crear`).
    return rechazada ? leerDetalleTrasEscritura(id) : null;
  },

  async obtenerReaperturaPendientePorUsuarioYVentana(usuarioId, ventanaCargaId) {
    const registro = await prisma.cargaArchivoRechazo.findFirst({
      where: {
        reaperturaConsumidaEn: null,
        cargaArchivo: { usuarioId, ventanaCargaId },
      },
      orderBy: { rechazadoEn: "desc" },
      select: SELECCION_RECHAZO_ENTIDAD,
    });

    return registro ? aCargaArchivoRechazo(registro) : null;
  },

  async listarPendientesPorUsuario(usuarioId) {
    const registros = await prisma.cargaArchivoRechazo.findMany({
      where: {
        reaperturaConsumidaEn: null,
        cargaArchivo: { usuarioId },
      },
      orderBy: { rechazadoEn: "desc" },
      select: SELECCION_RECHAZO_ENTIDAD,
      take: 100,
    });

    return registros.map(aCargaArchivoRechazo);
  },

  async listarRechazadas(filtro) {
    // Mismo criterio que `listarAprobadas`: `estado = RECHAZADA` siempre a nivel de consulta SQL.
    const where = {
      estado: "RECHAZADA" as const,
      ...(filtro.ventanaCargaId ? { ventanaCargaId: filtro.ventanaCargaId } : {}),
    };

    const [registros, total] = await prisma.$transaction([
      prisma.cargaArchivo.findMany({
        where,
        select: SELECCION_RESUMEN,
        orderBy: { updatedAt: "desc" },
        skip: (filtro.pagina - 1) * filtro.tamano,
        take: filtro.tamano,
      }),
      prisma.cargaArchivo.count({ where }),
    ]);

    return { filas: registros.map(aCargaArchivoResumen), total };
  },
};
