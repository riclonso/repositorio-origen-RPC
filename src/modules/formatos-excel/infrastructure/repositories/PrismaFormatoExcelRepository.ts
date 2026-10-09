import { configuracionComparacionFechasSchema } from "@/modules/formatos-excel/schemas/formato-excel.schema";
import { Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/database/prisma";
import { CODIGO_PERFIL_NOTIFICADOR } from "@/modules/perfiles/domain/entities/Perfil";
import type { FormatoExcelRepository } from "@/modules/formatos-excel/domain/repositories/FormatoExcelRepository";
import type {
  ColumnaFormatoExcel,
  DatosEdicionFormatoExcel,
  DatosNuevoFormatoExcel,
  FormatoExcel,
  FormatoExcelResumen,
  ReglaValidacionFormatoExcel,
  TipoEnumeradoFormatoExcel,
} from "@/modules/formatos-excel/domain/entities/FormatoExcel";
import { FormatoDuplicadoError } from "@/modules/formatos-excel/domain/errors/FormatoDuplicadoError";
import { ConflictoConcurrenteError } from "@/modules/formatos-excel/domain/errors/ConflictoConcurrenteError";
import {
  clasificarCambiosAsignacion,
  type BloqueoFormatoUnico,
  type ResultadoAsignacionMasivaRepositorio,
  type ResultadoDesactivacionFormato,
  type ResultadoEliminacionFormato,
} from "@/modules/formatos-excel/domain/entities/AsignacionFormato";

// Selección explícita: `contenidoPlantilla` NUNCA sale de aquí. Ninguna lectura lo trae: la
// plantilla que se descarga se genera desde las columnas configuradas, no desde ese binario.
const SELECCION_COLUMNA = {
  id: true,
  orden: true,
  nombre: true,
  requerida: true,
  tipoDato: true,
  tipoEnumeradoNombre: true,
} as const;

const SELECCION_TIPO_ENUMERADO = {
  id: true,
  orden: true,
  nombre: true,
  valores: true,
} as const;

const SELECCION_REGLA = {
  id: true,
  orden: true,
  tipo: true,
  columnas: true,
  mensaje: true,
  configuracion: true,
} as const;

const SELECCION_DETALLE = {
  id: true,
  nombre: true,
  descripcion: true,
  nombreArchivoPlantilla: true,
  tipoContenidoPlantilla: true,
  tipoArchivo: true,
  separadorCsv: true,
  activo: true,
  createdAt: true,
  updatedAt: true,
  columnas: { select: SELECCION_COLUMNA, orderBy: { orden: "asc" } },
  reglasValidacion: { select: SELECCION_REGLA, orderBy: { orden: "asc" } },
  // Anidado en la misma lectura (sin N+1). Nunca en `listar()`, que solo cuenta hijos.
  tiposEnumerados: { select: SELECCION_TIPO_ENUMERADO, orderBy: { orden: "asc" } },
} as const;

type RegistroDetalle = {
  id: string;
  nombre: string;
  descripcion: string | null;
  nombreArchivoPlantilla: string;
  tipoContenidoPlantilla: string;
  tipoArchivo: FormatoExcel["tipoArchivo"];
  separadorCsv: FormatoExcel["separadorCsv"];
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
  columnas: ColumnaFormatoExcel[];
  reglasValidacion: (Omit<ReglaValidacionFormatoExcel, "configuracion"> & { configuracion: Prisma.JsonValue })[];
  tiposEnumerados: TipoEnumeradoFormatoExcel[];
};

function aFormatoExcel(registro: RegistroDetalle): FormatoExcel {
  return {
    id: registro.id,
    nombre: registro.nombre,
    descripcion: registro.descripcion,
    nombreArchivoPlantilla: registro.nombreArchivoPlantilla,
    tipoContenidoPlantilla: registro.tipoContenidoPlantilla,
    tipoArchivo: registro.tipoArchivo,
    separadorCsv: registro.separadorCsv,
    activo: registro.activo,
    createdAt: registro.createdAt,
    updatedAt: registro.updatedAt,
    columnas: registro.columnas,
    reglasValidacion: registro.reglasValidacion.map((regla) => ({ ...regla, configuracion: regla.configuracion === null ? null : configuracionComparacionFechasSchema.parse(regla.configuracion) })),
    tiposEnumerados: registro.tiposEnumerados,
  };
}

function aCreacionColumnas(
  columnas: DatosNuevoFormatoExcel["columnas"],
): Prisma.ColumnaFormatoExcelCreateWithoutFormatoExcelInput[] {
  return columnas.map((columna) => ({
    orden: columna.orden,
    nombre: columna.nombre,
    requerida: columna.requerida,
    tipoDato: columna.tipoDato,
    tipoEnumeradoNombre: columna.tipoEnumeradoNombre,
  }));
}

function aCreacionTiposEnumerados(
  tiposEnumerados: DatosNuevoFormatoExcel["tiposEnumerados"],
): Prisma.TipoEnumeradoFormatoExcelCreateWithoutFormatoExcelInput[] {
  return tiposEnumerados.map((tipo) => ({ orden: tipo.orden, nombre: tipo.nombre, valores: tipo.valores }));
}

const CODIGO_UNIQUE_VIOLADO = "P2002";

// El nombre se comprueba antes de escribir, así que llegar aquí significa que alguien lo tomó
// entre la comprobación y el INSERT/UPDATE (ventana de carrera). Se traduce a un error de
// dominio para que el borde responda 409 y no un 500 por violación de restricción única.
function traducirConflicto(error: unknown, nombre: string): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === CODIGO_UNIQUE_VIOLADO) {
    throw new FormatoDuplicadoError(nombre);
  }

  throw error;
}

// `@prisma/adapter-pg` traduce el SQLSTATE 40001 de PostgreSQL (fallo de serialización) a
// `TransactionWriteConflict`, que Prisma expone como P2034. Se traduce a un error de dominio para
// que `application/` responda "vuelve a intentarlo" sin conocer los códigos del ORM.
const CODIGO_CONFLICTO_TRANSACCION = "P2034";

function esConflictoSerializacion(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === CODIGO_CONFLICTO_TRANSACCION;
}

// `Serializable` en las escrituras que dependen de filas de OTROS formatos (la regla "único
// formato" mira todas las asignaciones del usuario). Protege frente a otras transacciones
// Serializable de este repositorio. Frente a las escrituras de `PrismaUsuarioRepository` (Read
// Committed) solo cubre el conflicto escritura-escritura sobre la misma fila de
// `usuario_formato_excel` (40001 → P2034); un cambio concurrente de perfil/activo del usuario no
// se detecta.
const OPCIONES_SERIALIZABLE = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable } as const;

type ClienteTransaccion = Prisma.TransactionClient;

// Notificadores (activos e inactivos) cuyas asignaciones son TODAS de este formato. Una sola
// consulta: `some` asegura que lo tienen y `every` que no tienen ningún otro.
async function buscarBloqueoFormatoUnico(
  tx: ClienteTransaccion,
  formatoExcelId: string,
): Promise<BloqueoFormatoUnico | null> {
  const notificadores = await tx.usuario.findMany({
    where: {
      perfilCodigo: CODIGO_PERFIL_NOTIFICADOR,
      formatosAsignados: { some: { formatoExcelId }, every: { formatoExcelId } },
    },
    select: { id: true, activo: true },
  });

  if (notificadores.length === 0) return null;

  const cantidadActivos = notificadores.filter((notificador) => notificador.activo).length;
  return {
    usuariosIds: notificadores.map((notificador) => notificador.id),
    cantidadActivos,
    cantidadInactivos: notificadores.length - cantidadActivos,
  };
}

export const prismaFormatoExcelRepository: FormatoExcelRepository = {
  async listar(): Promise<FormatoExcelResumen[]> {
    const registros = await prisma.formatoExcel.findMany({
      select: {
        id: true,
        nombre: true,
        descripcion: true,
        tipoArchivo: true,
        separadorCsv: true,
        activo: true,
        createdAt: true,
        _count: { select: { columnas: true, reglasValidacion: true, usuariosAsignados: true, ventanasCarga: true } },
      },
      orderBy: { nombre: "asc" },
    });

    return registros.map((registro) => ({
      id: registro.id,
      nombre: registro.nombre,
      descripcion: registro.descripcion,
      tipoArchivo: registro.tipoArchivo,
      separadorCsv: registro.separadorCsv,
      activo: registro.activo,
      createdAt: registro.createdAt,
      cantidadColumnas: registro._count.columnas,
      cantidadReglas: registro._count.reglasValidacion,
      cantidadUsuariosAsignados: registro._count.usuariosAsignados,
      cantidadVentanasCarga: registro._count.ventanasCarga,
      puedeEliminar: registro._count.ventanasCarga === 0,
    }));
  },

  async obtenerPorId(id) {
    const registro = await prisma.formatoExcel.findUnique({ where: { id }, select: SELECCION_DETALLE });
    return registro ? aFormatoExcel(registro) : null;
  },

  async existeActivo(id) {
    const registro = await prisma.formatoExcel.findFirst({
      where: { id, activo: true },
      select: { id: true },
    });

    return registro !== null;
  },

  async obtenerActivosEntre(ids) {
    if (ids.length === 0) return [];

    const registros = await prisma.formatoExcel.findMany({
      where: { id: { in: ids }, activo: true },
      select: { id: true },
    });

    return registros.map((registro) => registro.id);
  },

  async estaAsignadoYActivo(usuarioId, formatoExcelId) {
    // Una sola consulta contra la tabla de asociación, con el estado del formato filtrado en el
    // mismo `WHERE` (nunca dos llamadas separadas que dejen ventana de carrera).
    const asignacion = await prisma.usuarioFormatoExcel.findFirst({
      where: { usuarioId, formatoExcelId, formatoExcel: { activo: true } },
      select: { id: true },
    });

    return asignacion !== null;
  },

  async listarAsignadosAUsuario(usuarioId) {
    const asignaciones = await prisma.usuarioFormatoExcel.findMany({
      where: { usuarioId, formatoExcel: { activo: true } },
      select: {
        formatoExcel: {
          select: {
            id: true,
            nombre: true,
            descripcion: true,
            tipoArchivo: true,
            separadorCsv: true,
            activo: true,
            createdAt: true,
            _count: { select: { columnas: true, reglasValidacion: true, usuariosAsignados: true } },
          },
        },
      },
      orderBy: { formatoExcel: { nombre: "asc" } },
    });

    return asignaciones.map(({ formatoExcel }) => ({
      id: formatoExcel.id,
      nombre: formatoExcel.nombre,
      descripcion: formatoExcel.descripcion,
      tipoArchivo: formatoExcel.tipoArchivo,
      separadorCsv: formatoExcel.separadorCsv,
      activo: formatoExcel.activo,
      createdAt: formatoExcel.createdAt,
      cantidadColumnas: formatoExcel._count.columnas,
      cantidadReglas: formatoExcel._count.reglasValidacion,
      cantidadUsuariosAsignados: formatoExcel._count.usuariosAsignados,
      cantidadVentanasCarga: 0,
      // Esta vista alimenta el selector del notificador, no el mantenedor; no se consulta la
      // relación de ventanas para mantenerla liviana y nunca ofrece acciones de eliminación.
      puedeEliminar: false,
    }));
  },

  async crear(datos: DatosNuevoFormatoExcel) {
    try {
      // Nido de una sola escritura: Prisma ejecuta la creación del formato y de sus columnas
      // como una única operación atómica.
      const registro = await prisma.formatoExcel.create({
        data: {
          nombre: datos.nombre,
          descripcion: datos.descripcion,
          nombreArchivoPlantilla: datos.nombreArchivoPlantilla,
          tipoContenidoPlantilla: datos.tipoContenidoPlantilla,
          tipoArchivo: datos.tipoArchivo,
          separadorCsv: datos.separadorCsv,
          // `Uint8Array.from` produce un `Uint8Array<ArrayBuffer>` "de fábrica", el tipo exacto
          // que exige el campo `Bytes` generado por Prisma; el `Buffer<ArrayBufferLike>` de Node
          // es más amplio (admite `SharedArrayBuffer`) y por eso no encaja directo.
          contenidoPlantilla: Uint8Array.from(datos.contenidoPlantilla),
          columnas: { create: aCreacionColumnas(datos.columnas) },
          tiposEnumerados: { create: aCreacionTiposEnumerados(datos.tiposEnumerados) },
          reglasValidacion: {
            create: datos.reglasValidacion.map((regla) => ({
              orden: regla.orden,
              tipo: regla.tipo,
              columnas: regla.columnas,
              mensaje: regla.mensaje,
              configuracion: regla.configuracion ?? Prisma.DbNull,
            })),
          },
        },
        select: SELECCION_DETALLE,
      });

      return aFormatoExcel(registro);
    } catch (error) {
      traducirConflicto(error, datos.nombre);
    }
  },

  async actualizar(id, datos: DatosEdicionFormatoExcel) {
    try {
      // `deleteMany` + `create` sobre la misma relación, dentro de la misma llamada a `update`:
      // Prisma lo ejecuta como una única operación atómica, así que el reemplazo del set
      // completo de columnas nunca deja al formato con columnas a medio reemplazar.
      const registro = await prisma.formatoExcel.update({
        where: { id },
        data: {
          nombre: datos.nombre,
          descripcion: datos.descripcion,
          separadorCsv: datos.separadorCsv,
          columnas: { deleteMany: {}, create: aCreacionColumnas(datos.columnas) },
          // Mismo reemplazo completo, en la misma escritura atómica que columnas y reglas.
          tiposEnumerados: { deleteMany: {}, create: aCreacionTiposEnumerados(datos.tiposEnumerados) },
          reglasValidacion: {
            deleteMany: {},
            create: datos.reglasValidacion.map((regla) => ({
              orden: regla.orden,
              tipo: regla.tipo,
              columnas: regla.columnas,
              mensaje: regla.mensaje,
              configuracion: regla.configuracion ?? Prisma.DbNull,
            })),
          },
        },
        select: SELECCION_DETALLE,
      });

      return aFormatoExcel(registro);
    } catch (error) {
      traducirConflicto(error, datos.nombre);
    }
  },

  async cambiarEstado(id, activo) {
    const registro = await prisma.formatoExcel.update({
      where: { id },
      data: { activo },
      select: SELECCION_DETALLE,
    });

    return aFormatoExcel(registro);
  },

  async desactivarQuitandoAsignaciones(id): Promise<ResultadoDesactivacionFormato> {
    try {
      return await prisma.$transaction(async (tx): Promise<ResultadoDesactivacionFormato> => {
        const actual = await tx.formatoExcel.findUnique({ where: { id }, select: SELECCION_DETALLE });
        if (!actual) return { estado: "NO_ENCONTRADO" };

        // Ya inactivo: no se limpian asignaciones heredadas de antes de esta regla.
        if (!actual.activo) return { estado: "SIN_CAMBIO", formato: aFormatoExcel(actual) };

        const bloqueo = await buscarBloqueoFormatoUnico(tx, id);
        if (bloqueo) return { estado: "BLOQUEADO", nombre: actual.nombre, bloqueo };

        // Se leen los ids solo para la auditoría; las asignaciones de usuarios que no son
        // notificadores (heredadas) se borran igual, sin bloquear.
        const asignaciones = await tx.usuarioFormatoExcel.findMany({
          where: { formatoExcelId: id },
          select: { usuarioId: true },
        });

        await tx.usuarioFormatoExcel.deleteMany({ where: { formatoExcelId: id } });
        const registro = await tx.formatoExcel.update({
          where: { id },
          data: { activo: false },
          select: SELECCION_DETALLE,
        });

        return {
          estado: "DESACTIVADO",
          formato: aFormatoExcel(registro),
          asignacionesEliminadasUsuarioIds: asignaciones.map((asignacion) => asignacion.usuarioId),
        };
      }, OPCIONES_SERIALIZABLE);
    } catch (error) {
      if (esConflictoSerializacion(error)) throw new ConflictoConcurrenteError();
      throw error;
    }
  },

  async eliminar(id): Promise<ResultadoEliminacionFormato> {
    try {
      return await prisma.$transaction(async (tx): Promise<ResultadoEliminacionFormato> => {
        const formato = await tx.formatoExcel.findUnique({ where: { id }, select: { id: true } });
        if (!formato) return { estado: "NO_ENCONTRADO" };

        // Se considera activa cualquier ventana vinculada: aunque sus fechas ya hayan pasado o
        // esté archivada, sigue siendo parte del historial y el FK RESTRICT impide borrarla.
        const cantidadVentanas = await tx.ventanaCarga.count({ where: { formatoExcelId: id } });
        if (cantidadVentanas > 0) return { estado: "CON_VENTANAS_ACTIVAS" };

        const bloqueo = await buscarBloqueoFormatoUnico(tx, id);
        if (bloqueo) return { estado: "BLOQUEADO", bloqueo };

        await tx.usuarioFormatoExcel.deleteMany({ where: { formatoExcelId: id } });
        await tx.formatoExcel.delete({ where: { id } });
        return { estado: "ELIMINADO" };
      }, OPCIONES_SERIALIZABLE);
    } catch (error) {
      // Una ventana creada entre la comprobación y el DELETE queda protegida por la base de datos.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        return { estado: "CON_VENTANAS_ACTIVAS" };
      }
      if (esConflictoSerializacion(error)) throw new ConflictoConcurrenteError();
      throw error;
    }
  },

  async listarCandidatosAsignacion(id) {
    const formato = await prisma.formatoExcel.findUnique({ where: { id }, select: { id: true } });
    if (!formato) return null;

    // Una sola consulta: la relación con ESTE formato (a lo más una fila, por el `@@unique`) y el
    // total de asignaciones del usuario viajan anidados en la misma lectura, sin N+1. Selección
    // explícita: nunca email ni `contrasenaHash`.
    const usuarios = await prisma.usuario.findMany({
      where: { perfilCodigo: CODIGO_PERFIL_NOTIFICADOR, activo: true },
      select: {
        id: true,
        nombres: true,
        apellidos: true,
        rut: true,
        // El modal agrupa por establecimiento: viaja en la misma lectura (relación a uno).
        establecimientoId: true,
        establecimiento: { select: { nombre: true } },
        formatosAsignados: { where: { formatoExcelId: id }, select: { id: true } },
        _count: { select: { formatosAsignados: true } },
      },
      orderBy: [{ apellidos: "asc" }, { nombres: "asc" }],
    });

    return usuarios.map((usuario) => {
      const yaAsignado = usuario.formatosAsignados.length > 0;
      return {
        id: usuario.id,
        nombres: usuario.nombres,
        apellidos: usuario.apellidos,
        rut: usuario.rut,
        establecimientoId: usuario.establecimientoId,
        establecimientoNombre: usuario.establecimiento?.nombre ?? null,
        yaAsignado,
        esUnicoFormato: yaAsignado && usuario._count.formatosAsignados === 1,
      };
    });
  },

  async aplicarAsignacionesMasivas(id, agregarIds, quitarIds): Promise<ResultadoAsignacionMasivaRepositorio> {
    const idsLote = [...new Set([...agregarIds, ...quitarIds])];

    try {
      return await prisma.$transaction(async (tx): Promise<ResultadoAsignacionMasivaRepositorio> => {
        const formato = await tx.formatoExcel.findUnique({
          where: { id },
          select: { nombre: true, activo: true },
        });
        if (!formato) return { estado: "NO_ENCONTRADO" };
        if (!formato.activo) return { estado: "FORMATO_INACTIVO", nombre: formato.nombre };

        const usuarios = await tx.usuario.findMany({
          where: { id: { in: idsLote } },
          select: {
            id: true,
            perfilCodigo: true,
            activo: true,
            formatosAsignados: { where: { formatoExcelId: id }, select: { id: true } },
            _count: { select: { formatosAsignados: true } },
          },
        });

        const clasificacion = clasificarCambiosAsignacion(
          agregarIds,
          quitarIds,
          usuarios.map((usuario) => ({
            id: usuario.id,
            perfilCodigo: usuario.perfilCodigo,
            activo: usuario.activo,
            tieneFormato: usuario.formatosAsignados.length > 0,
            cantidadAsignaciones: usuario._count.formatosAsignados,
          })),
        );

        if (clasificacion.aAgregar.length > 0) {
          await tx.usuarioFormatoExcel.createMany({
            data: clasificacion.aAgregar.map((usuarioId) => ({ usuarioId, formatoExcelId: id })),
            skipDuplicates: true,
          });
        }

        if (clasificacion.aQuitar.length > 0) {
          await tx.usuarioFormatoExcel.deleteMany({
            where: { formatoExcelId: id, usuarioId: { in: clasificacion.aQuitar } },
          });
        }

        return { estado: "APLICADO", nombre: formato.nombre, clasificacion };
      }, OPCIONES_SERIALIZABLE);
    } catch (error) {
      if (esConflictoSerializacion(error)) throw new ConflictoConcurrenteError();
      throw error;
    }
  },

  async buscarPorNombre(nombre) {
    const registro = await prisma.formatoExcel.findUnique({ where: { nombre }, select: SELECCION_DETALLE });
    return registro ? aFormatoExcel(registro) : null;
  },

  async contarNotificadoresAsignadosActivosPorFormato(formatoExcelIds) {
    if (formatoExcelIds.length === 0) return {};

    // `usuario_formato_excel` es única por `(usuarioId, formatoExcelId)`
    // (`@@unique([usuarioId, formatoExcelId])`), así que contar FILAS del grupo equivale a contar
    // usuarios DISTINTOS, sin necesidad de un `DISTINCT` adicional.
    const grupos = await prisma.usuarioFormatoExcel.groupBy({
      by: ["formatoExcelId"],
      where: {
        formatoExcelId: { in: formatoExcelIds },
        usuario: { activo: true, perfilCodigo: CODIGO_PERFIL_NOTIFICADOR },
      },
      _count: true,
    });

    return Object.fromEntries(grupos.map((grupo) => [grupo.formatoExcelId, grupo._count]));
  },
};
