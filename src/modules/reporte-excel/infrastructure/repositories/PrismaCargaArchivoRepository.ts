import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/database/prisma";
import { nombreCompleto } from "@/modules/usuarios/domain/entities/Usuario";
import type { CargaArchivoRepository } from "@/modules/reporte-excel/domain/repositories/CargaArchivoRepository";
import type {
  CargaArchivo,
  DatosNuevaCargaArchivo,
  DatosPublicacionCarga,
  DatosRechazoCargaArchivo,
  ErrorCargaArchivo,
  FiltroListadoCargasPendientesODecididas,
  InfoRechazoCargaArchivo,
  ValorCeldaArchivo,
} from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import type { CargaArchivoRechazo } from "@/modules/reporte-excel/domain/entities/CargaArchivoRechazo";

// Filas de detalle insertadas por sentencia `createMany`: `TOPE_FILAS_DATOS` (20.000, ver
// `domain/entities/CargaArchivo.ts`) por hasta ~4 columnas de parámetros por fila se acerca al
// límite de 65.535 parámetros ligados de PostgreSQL, así que se trocea. Todos los lotes corren
// dentro de la MISMA transacción abierta (ver `darVistoBueno`), no una por lote de forma aislada.
const TAMANO_LOTE_FILAS_PUBLICADAS = 5_000;

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
  "usuarioId" | "tipoContenidoArchivo" | "vistoBuenoPorId" | "updatedAt" | "errores"
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
    reaperturaConsumidaEn: registro.reaperturaConsumidaEn,
    reaperturaConsumidaPorCargaArchivoId: registro.reaperturaConsumidaPorCargaArchivoId,
    createdAt: registro.createdAt,
  };
}

function datosCreacionCargaArchivo(datos: DatosNuevaCargaArchivo, id?: string) {
  return {
    ...(id ? { id } : {}),
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

export const prismaCargaArchivoRepository: CargaArchivoRepository = {
  async crear(datos: DatosNuevaCargaArchivo) {
    // Camino normal (sin reemplazo ni reapertura pendiente de consumir): nido de una sola
    // escritura, la carga y sus errores en una única operación atómica, mismo patrón que
    // `PrismaFormatoExcelRepository.crear`.
    if (!datos.solicitudReemplazoAConsumirId && !datos.cargaArchivoRechazoAConsumirId) {
      const registro = await prisma.cargaArchivo.create({
        data: datosCreacionCargaArchivo(datos),
        select: SELECCION_DETALLE,
      });

      return aCargaArchivo(registro);
    }

    // Extensión "solicitudes de reemplazo"/"rechazo de cargas aprobadas": la autorización (una u
    // otra, nunca ambas a la vez) se consume por el intento de subida en sí (exista o no error de
    // validación en él), en la MISMA transacción que crea esta carga — nunca dos escrituras
    // sueltas que puedan quedar a medio camino. El id se genera en el cliente (en vez de dejarlo
    // al `@default(uuid())` de Prisma) para poder referenciarlo en la segunda sentencia de la
    // transacción en forma de arreglo sin depender del resultado de la primera.
    //
    // Nota de módulo: `solicitud_reemplazo_carga` pertenece al módulo `solicitudes-reemplazo`, no
    // a este. Se actualiza aquí, directo por Prisma, en vez de a través de
    // `SolicitudReemplazoCargaRepository`, porque la transacción de array de Prisma exige que cada
    // elemento sea la promesa de una operación de este mismo cliente: envolverla en otro
    // repositorio no la dejaría dentro de la misma transacción. Mismo criterio de acceso
    // cross-módulo desde infraestructura que ya usa `auditarCargaArchivo.ts` (importa
    // `prismaUsuarioRepository` directo para resolver el RUT del actor).
    const idNuevo = randomUUID();
    const ahora = new Date();

    const operaciones: Prisma.PrismaPromise<unknown>[] = [
      prisma.cargaArchivo.create({
        data: datosCreacionCargaArchivo(datos, idNuevo),
        select: SELECCION_DETALLE,
      }),
    ];

    if (datos.solicitudReemplazoAConsumirId) {
      operaciones.push(
        prisma.solicitudReemplazoCarga.updateMany({
          where: { id: datos.solicitudReemplazoAConsumirId, estado: "APROBADA", utilizadaEn: null },
          data: { utilizadaEn: ahora, nuevaCargaArchivoId: idNuevo },
        }),
      );
    }

    if (datos.cargaArchivoRechazoAConsumirId) {
      operaciones.push(
        prisma.cargaArchivoRechazo.updateMany({
          where: { id: datos.cargaArchivoRechazoAConsumirId, reaperturaConsumidaEn: null },
          data: { reaperturaConsumidaEn: ahora, reaperturaConsumidaPorCargaArchivoId: idNuevo },
        }),
      );

      // Cualquier OTRO rechazo sin consumir de esta misma combinación (usuario, ventana) queda
      // superado por esta subida (p.ej. dos reemplazos aprobados sucesivos sobre la misma ventana
      // antes de subir el archivo nuevo): se marca resuelto igual, pero sin apuntarlo a esta carga
      // como su "consumidor" (`reaperturaConsumidaPorCargaArchivoId` es una relación 1:1, ya la usa
      // el `updateMany` de arriba con `cargaArchivoRechazoAConsumirId`). Sin esto, un rechazo viejo
      // suelto seguía apareciendo en `BannerReaperturaCarga` (`/notificador`) como una segunda
      // alerta duplicada para la misma `ventanaCargaId`.
      operaciones.push(
        prisma.cargaArchivoRechazo.updateMany({
          where: {
            id: { not: datos.cargaArchivoRechazoAConsumirId },
            reaperturaConsumidaEn: null,
            cargaArchivo: { usuarioId: datos.usuarioId, ventanaCargaId: datos.ventanaCargaId },
          },
          data: { reaperturaConsumidaEn: ahora },
        }),
      );
    }

    const [registro] = (await prisma.$transaction(operaciones)) as [RegistroDetalle, ...unknown[]];

    return aCargaArchivo(registro);
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
    // La "vigente" es la APROBADA más reciente por `vistoBuenoEn`: un notificador puede tener
    // varias cargas APROBADA en la misma ventana (correcciones/reemplazos sucesivos), mismo
    // criterio que `agruparCargasAprobadasPorVentana`.
    const registro = await prisma.cargaArchivo.findFirst({
      where: { usuarioId, ventanaCargaId, estado: "APROBADA" },
      orderBy: { vistoBuenoEn: "desc" },
      select: SELECCION_DETALLE,
    });
    return registro ? aCargaArchivo(registro) : null;
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
      select: { tipoContenidoArchivo: true, contenidoArchivo: true },
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

    const [registros, total] = await prisma.$transaction([
      prisma.cargaArchivo.findMany({
        where,
        select: SELECCION_RESUMEN,
        orderBy: { createdAt: "desc" },
        skip: (filtro.pagina - 1) * filtro.tamano,
        take: filtro.tamano,
      }),
      prisma.cargaArchivo.count({ where }),
    ]);

    return { filas: registros.map(aCargaArchivoResumen), total };
  },

  async listarPropiasAprobadas(usuarioId) {
    // Ownership (`usuarioId`) y `estado IN (APROBADA, RECHAZADA)` siempre en el mismo `WHERE`,
    // nunca filtrado en JS después. Incluye `RECHAZADA`: una carga rechazada YA fue `APROBADA`
    // antes (conserva su `vistoBuenoEn`), así que sigue siendo parte del histórico de "Mis cargas"
    // de esa combinación (formato, ventana), ahora con el motivo del rechazo visible. Tope
    // defensivo (no paginado): evita traer un histórico sin límite si un notificador acumula miles
    // de correcciones sucesivas; la agrupación/paginación de GRUPOS vive en
    // `application/ListarCargasPropiasExitosas.ts`.
    const registros = await prisma.cargaArchivo.findMany({
      where: { usuarioId, estado: { in: ["APROBADA", "RECHAZADA"] } },
      select: SELECCION_RESUMEN,
      orderBy: { vistoBuenoEn: "desc" },
      take: 500,
    });

    return registros.map(aCargaArchivoResumen);
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

    const [registros, total] = await prisma.$transaction([
      prisma.cargaArchivo.findMany({
        where,
        select: SELECCION_RESUMEN,
        // Más reciente primero por fecha de ingreso: a diferencia de `listarAprobadas`
        // (`vistoBuenoEn desc`), una `PENDIENTE_VISTO_BUENO` finalizada todavía no tiene
        // `vistoBuenoEn`, así que ese campo dejaría de servir para ordenar esta tabla mixta.
        orderBy: { createdAt: "desc" },
        skip: (filtro.pagina - 1) * filtro.tamano,
        take: filtro.tamano,
      }),
      prisma.cargaArchivo.count({ where }),
    ]);

    return { filas: registros.map(aCargaArchivoResumen), total };
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
    return prisma.$transaction(async (tx) => {
      // Corrección (fin de la autoaprobación): ya no filtra por `usuarioId` (quien aprueba es un
      // tercero, no el dueño de la carga), y exige `finalizadaEn` no nulo (el notificador ya
      // finalizó y envió). Si cualquiera no calza, no toca ninguna fila. Cierra la ventana de
      // carrera de un doble clic o dos pestañas.
      const resultado = await tx.cargaArchivo.updateMany({
        where: { id, estado: "PENDIENTE_VISTO_BUENO", finalizadaEn: { not: null } },
        data: { estado: "APROBADA", vistoBuenoEn: new Date(), vistoBuenoPorId: aprobadoPorId },
      });

      if (resultado.count === 0) return null;

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

      // Si esta carga nació de un reemplazo consumido, la publicación anterior deja de ser
      // visible para el revisor (baja lógica, sus filas de detalle se conservan intactas) y queda
      // enlazada a esta carga con el motivo que el notificador escribió al pedir el reemplazo.
      if (publicacion.reemplazo) {
        await tx.cargaArchivoPublicada.updateMany({
          where: { cargaArchivoId: publicacion.reemplazo.cargaArchivoIdAnterior },
          data: {
            activo: false,
            desactivadaEn: new Date(),
            reemplazadaPorCargaArchivoId: id,
            motivoDesactivacion: publicacion.reemplazo.motivo,
            motivoDesactivacionTipo: "REEMPLAZO",
          },
        });
      }

      const registro = await tx.cargaArchivo.findUnique({ where: { id }, select: SELECCION_DETALLE });
      return registro ? aCargaArchivo(registro) : null;
    }, { timeout: 15_000 });
  },

  async finalizar(id, usuarioId) {
    // `updateMany` condicional y atómico: ownership (`usuarioId`), estado y `finalizadaEn IS NULL`
    // en el mismo `WHERE`. Cierra la ventana de carrera de un doble clic o dos pestañas.
    const resultado = await prisma.cargaArchivo.updateMany({
      where: { id, usuarioId, estado: "PENDIENTE_VISTO_BUENO", finalizadaEn: null },
      data: { finalizadaEn: new Date() },
    });

    if (resultado.count === 0) return null;

    const registro = await prisma.cargaArchivo.findUnique({ where: { id }, select: SELECCION_DETALLE });
    return registro ? aCargaArchivo(registro) : null;
  },

  async contarNotificadoresDistintosPorVentana(ventanaCargaIds) {
    if (ventanaCargaIds.length === 0) return {};

    // Se agrupa por el PAR (ventanaCargaId, usuarioId) y NO se usa un `_count` plano de filas por
    // `ventanaCargaId`: `CargaArchivo` no tiene restricción de unicidad sobre
    // `(usuarioId, ventanaCargaId)`, así que un mismo notificador puede tener varias cargas
    // APROBADA en la misma ventana (correcciones sucesivas). Agrupar solo por `ventanaCargaId`
    // sobre-contaría a ese notificador una vez por cada carga aprobada que tenga. Agrupar por el
    // par produce como mucho una fila por combinación (ventana, usuario) realmente existente, así
    // que reducir contando filas por `ventanaCargaId` en JS sí refleja usuarios DISTINTOS. No
    // "simplificar" esto a un `_count` directo: reintroduciría el sobre-conteo.
    const grupos = await prisma.cargaArchivo.groupBy({
      by: ["ventanaCargaId", "usuarioId"],
      where: { ventanaCargaId: { in: ventanaCargaIds }, estado: "APROBADA" },
    });

    const conteoPorVentana: Record<string, number> = {};
    for (const grupo of grupos) {
      conteoPorVentana[grupo.ventanaCargaId] = (conteoPorVentana[grupo.ventanaCargaId] ?? 0) + 1;
    }

    return conteoPorVentana;
  },

  async obtenerParaDescarga(id) {
    // Única consulta de todo el módulo que trae `contenidoArchivo`, y solo si ya está aprobada.
    const registro = await prisma.cargaArchivo.findFirst({
      where: { id, estado: "APROBADA" },
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
    return prisma.$transaction(async (tx) => {
      // Leído ANTES del `updateMany` (dentro de la misma transacción): determina si el origen fue
      // `APROBADA` (hubo publicación que desactivar) o `PENDIENTE_VISTO_BUENO` finalizada (nunca
      // hubo publicación, se salta ese paso sin error).
      const previo = await tx.cargaArchivo.findUnique({ where: { id }, select: { estado: true } });

      if (!previo) return null;

      // `updateMany` con `estado IN (APROBADA, PENDIENTE_VISTO_BUENO con finalizadaEn no nulo)` en
      // el mismo `WHERE`: si la carga no existe o ya no está en ninguno de esos dos estados, no
      // toca ninguna fila. Sin restricción de `usuarioId`: cualquier ADMIN/REVISOR_REPOSITORIO
      // puede rechazar cualquier carga (simétrico, mismo criterio que `RevisarSolicitudReemplazo`).
      const resultado = await tx.cargaArchivo.updateMany({
        where: {
          id,
          OR: [{ estado: "APROBADA" }, { estado: "PENDIENTE_VISTO_BUENO", finalizadaEn: { not: null } }],
        },
        data: { estado: "RECHAZADA" },
      });

      if (resultado.count === 0) return null;

      await tx.cargaArchivoRechazo.create({
        data: { cargaArchivoId: id, rechazadoPorId: datos.rechazadoPorId, motivo: datos.motivo },
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

      const registro = await tx.cargaArchivo.findUnique({ where: { id }, select: SELECCION_DETALLE });
      return registro ? aCargaArchivo(registro) : null;
    });
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
