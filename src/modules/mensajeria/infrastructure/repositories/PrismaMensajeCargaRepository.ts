import { prisma } from "@/infrastructure/database/prisma";
import { nombreCompleto } from "@/modules/usuarios/domain/entities/Usuario";
import type {
  ConversacionVentanaResumen,
  MensajeCarga,
  MensajeHilo,
  ResumenMensajesPorVentana,
} from "@/modules/mensajeria/domain/entities/MensajeCarga";
import type { MensajeCargaRepository } from "@/modules/mensajeria/domain/repositories/MensajeCargaRepository";

const SELECCION_MENSAJE = {
  id: true,
  cargaArchivoId: true,
  ventanaCargaId: true,
  notificadorId: true,
  autorId: true,
  ladoAutor: true,
  contenido: true,
  creadoEn: true,
  leidoEn: true,
} as const;

// JOIN acotado del hilo: solo el nombre del autor y el nombre del archivo que etiqueta cada
// mensaje, en la MISMA consulta (nunca una consulta por mensaje).
const SELECCION_MENSAJE_HILO = {
  ...SELECCION_MENSAJE,
  autor: { select: { nombres: true, apellidos: true } },
  cargaArchivo: { select: { nombreArchivoOriginal: true } },
} as const;

type RegistroMensaje = MensajeCarga;

type RegistroMensajeHilo = RegistroMensaje & {
  autor: { nombres: string; apellidos: string };
  cargaArchivo: { nombreArchivoOriginal: string };
};

function aMensajeCarga(registro: RegistroMensaje): MensajeCarga {
  return {
    id: registro.id,
    cargaArchivoId: registro.cargaArchivoId,
    ventanaCargaId: registro.ventanaCargaId,
    notificadorId: registro.notificadorId,
    autorId: registro.autorId,
    ladoAutor: registro.ladoAutor,
    contenido: registro.contenido,
    creadoEn: registro.creadoEn,
    leidoEn: registro.leidoEn,
  };
}

function aMensajeHilo(registro: RegistroMensajeHilo): MensajeHilo {
  return {
    ...aMensajeCarga(registro),
    autorNombre: nombreCompleto(registro.autor),
    nombreArchivoOriginal: registro.cargaArchivo.nombreArchivoOriginal,
  };
}

export const prismaMensajeCargaRepository: MensajeCargaRepository = {
  async crear(datos) {
    const registro = await prisma.mensajeCarga.create({
      data: {
        cargaArchivoId: datos.cargaArchivoId,
        ventanaCargaId: datos.ventanaCargaId,
        notificadorId: datos.notificadorId,
        autorId: datos.autorId,
        ladoAutor: datos.ladoAutor,
        contenido: datos.contenido,
        creadoEn: datos.creadoEn,
      },
      select: SELECCION_MENSAJE_HILO,
    });

    return aMensajeHilo(registro);
  },

  async obtenerUltimoMensaje(notificadorId, ventanaCargaId, ladoAutor) {
    const registro = await prisma.mensajeCarga.findFirst({
      where: { notificadorId, ventanaCargaId, ...(ladoAutor ? { ladoAutor } : {}) },
      orderBy: [{ creadoEn: "desc" }, { id: "desc" }],
      select: SELECCION_MENSAJE,
    });

    return registro ? aMensajeCarga(registro) : null;
  },

  async contarNoLeidosAnteriores(filtro) {
    // Cubierto por el índice (notificadorId, ventanaCargaId, creadoEn).
    return prisma.mensajeCarga.count({
      where: {
        notificadorId: filtro.notificadorId,
        ventanaCargaId: filtro.ventanaCargaId,
        ladoAutor: filtro.ladoAutor,
        leidoEn: null,
        creadoEn: { lt: filtro.creadoAntesDe },
      },
    });
  },

  async listarHilo(notificadorId, ventanaCargaId, tope) {
    // Se pide uno más que el tope solo para saber si hay mensajes más antiguos fuera del corte.
    const registros = await prisma.mensajeCarga.findMany({
      where: { notificadorId, ventanaCargaId },
      orderBy: [{ creadoEn: "desc" }, { id: "desc" }],
      take: tope + 1,
      select: SELECCION_MENSAJE_HILO,
    });

    const hayMasAntiguos = registros.length > tope;
    const recientes = hayMasAntiguos ? registros.slice(0, tope) : registros;

    return { mensajes: recientes.reverse().map(aMensajeHilo), hayMasAntiguos };
  },

  async listarConversacionesVentana(ventanaCargaId) {
    // Tres consultas fijas, sin importar cuántos notificadores haya: último mensaje por
    // notificador, no leídos por notificador y los datos visibles de esos notificadores.
    const [ultimos, noLeidos] = await Promise.all([
      prisma.mensajeCarga.groupBy({
        by: ["notificadorId"],
        where: { ventanaCargaId },
        _max: { creadoEn: true },
      }),
      prisma.mensajeCarga.groupBy({
        by: ["notificadorId"],
        where: { ventanaCargaId, ladoAutor: "NOTIFICADOR", leidoEn: null },
        _count: { _all: true },
      }),
    ]);

    if (ultimos.length === 0) {
      return [];
    }

    const notificadores = await prisma.usuario.findMany({
      where: { id: { in: ultimos.map((fila) => fila.notificadorId) } },
      select: { id: true, nombres: true, apellidos: true, rut: true },
    });

    const noLeidosPorNotificador = new Map(noLeidos.map((fila) => [fila.notificadorId, fila._count._all]));
    const notificadorPorId = new Map(notificadores.map((notificador) => [notificador.id, notificador]));

    return ultimos.flatMap((fila): ConversacionVentanaResumen[] => {
      const notificador = notificadorPorId.get(fila.notificadorId);
      const ultimoMensajeEn = fila._max.creadoEn;

      if (!notificador || !ultimoMensajeEn) return [];

      return [
        {
          notificadorId: notificador.id,
          nombreCompleto: nombreCompleto(notificador),
          rut: notificador.rut,
          noLeidos: noLeidosPorNotificador.get(notificador.id) ?? 0,
          ultimoMensajeEn,
        },
      ];
    });
  },

  async obtenerInterlocutorNotificador(notificadorId) {
    const registro = await prisma.usuario.findUnique({
      where: { id: notificadorId },
      select: { id: true, nombres: true, apellidos: true, rut: true },
    });

    return registro ? { id: registro.id, nombreCompleto: nombreCompleto(registro), rut: registro.rut } : null;
  },

  async marcarLeidos(filtro) {
    const resultado = await prisma.mensajeCarga.updateMany({
      where: {
        notificadorId: filtro.notificadorId,
        ventanaCargaId: filtro.ventanaCargaId,
        ladoAutor: filtro.ladoAutor,
        leidoEn: null,
        creadoEn: { lte: filtro.hasta },
      },
      data: { leidoEn: filtro.leidoEn },
    });

    return resultado.count;
  },

  async resumirPorVentana(filtro) {
    const acotamiento = filtro.notificadorId ? { notificadorId: filtro.notificadorId } : {};
    const acotamientoTotales = filtro.ventanaCargaIdsConTarjeta
      ? { ...acotamiento, ventanaCargaId: { in: filtro.ventanaCargaIdsConTarjeta } }
      : acotamiento;

    const [totales, noLeidos] = await Promise.all([
      // Totales: solo de las ventanas con tarjeta (si se acotó).
      prisma.mensajeCarga.groupBy({
        by: ["ventanaCargaId"],
        where: acotamientoTotales,
        _count: { _all: true },
      }),
      // No leídos: de TODAS las ventanas; el banner necesita también las cerradas.
      prisma.mensajeCarga.groupBy({
        by: ["ventanaCargaId"],
        where: { ...acotamiento, ladoAutor: filtro.ladoNoLeido, leidoEn: null },
        _count: { _all: true },
      }),
    ]);

    const noLeidosPorVentana: Record<string, number> = {};
    for (const fila of noLeidos) {
      noLeidosPorVentana[fila.ventanaCargaId] = fila._count._all;
    }

    const porVentana: ResumenMensajesPorVentana = {};
    for (const fila of totales) {
      porVentana[fila.ventanaCargaId] = {
        total: fila._count._all,
        noLeidos: noLeidosPorVentana[fila.ventanaCargaId] ?? 0,
      };
    }

    return { porVentana, noLeidosPorVentana };
  },

  async obtenerEtiquetasVentanas(ventanaCargaIds) {
    if (ventanaCargaIds.length === 0) return [];

    const registros = await prisma.ventanaCarga.findMany({
      where: { id: { in: ventanaCargaIds } },
      select: { id: true, anio: true, formatoExcel: { select: { nombre: true } } },
      orderBy: [{ anio: "desc" }, { id: "asc" }],
    });

    return registros.map((registro) => ({
      ventanaCargaId: registro.id,
      formatoExcelNombre: registro.formatoExcel.nombre,
      anio: registro.anio,
    }));
  },
};
