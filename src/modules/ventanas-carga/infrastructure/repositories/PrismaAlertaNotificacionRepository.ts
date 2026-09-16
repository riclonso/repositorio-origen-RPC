import { prisma } from "@/infrastructure/database/prisma";
import { nombreCompleto } from "@/modules/usuarios/domain/entities/Usuario";
import type {
  AlertaNotificacionRepository,
  FiltroLotesAlerta,
} from "@/modules/ventanas-carga/domain/repositories/AlertaNotificacionRepository";
import type {
  DestinatarioAlertaVista,
  LoteAlertaVentana,
  ResumenAlertasVentana,
  TipoAlertaNotificacion,
  TotalAlertaVentana,
} from "@/modules/ventanas-carga/domain/entities/AlertaNotificacion";

// Tipos AUTOMATICA/MANUAL_MASIVA/MANUAL_INDIVIDUAL agrupados bajo dos categorías en la UI
// (`TablaLotesAlertaVentana` recibe una u otra por prop): "AUTOMATICA" o "MANUAL" (ambos manuales
// juntos, distinguibles por `tipo` dentro de la fila).
const TIPOS_MANUALES: TipoAlertaNotificacion[] = ["MANUAL_MASIVA", "MANUAL_INDIVIDUAL"];

function whereCategoria(filtro: Pick<FiltroLotesAlerta, "ventanaCargaId" | "categoria">) {
  return {
    ventanaCargaId: filtro.ventanaCargaId,
    tipo: filtro.categoria === "AUTOMATICA" ? ("AUTOMATICA" as const) : { in: TIPOS_MANUALES },
  };
}

export const prismaAlertaNotificacionRepository: AlertaNotificacionRepository = {
  async crearLote(filas) {
    if (filas.length === 0) return;

    // `skipDuplicates: true`: absorbe en silencio cualquier colisión contra el índice único
    // parcial de deduplicación automática, en vez de fallar todo el lote por una fila puntual.
    await prisma.alertaNotificacionVentana.createMany({
      data: filas.map((fila) => ({
        loteId: fila.loteId,
        ventanaCargaId: fila.ventanaCargaId,
        usuarioId: fila.usuarioId,
        tipo: fila.tipo,
        resultado: fila.resultado,
        asunto: fila.asunto,
        mensaje: fila.mensaje,
        detalleError: fila.detalleError,
        disparadoPorId: fila.disparadoPorId,
        fechaProgramada: fila.fechaProgramada,
      })),
      skipDuplicates: true,
    });
  },

  async listarLotesPorVentana(filtro) {
    const condicion = whereCategoria(filtro);

    // Total de lotes distintos, agregado en el propio motor (GROUP BY sin traer filas), no en JS.
    const todosLosLotes = await prisma.alertaNotificacionVentana.groupBy({
      by: ["loteId"],
      where: condicion,
    });
    const total = todosLosLotes.length;

    if (total === 0) {
      return { filas: [], total: 0 };
    }

    // Página de lotes (una fila por `loteId`), con la fecha de creación del lote resuelta como el
    // mínimo de sus filas (todas comparten prácticamente el mismo instante).
    const gruposPagina = await prisma.alertaNotificacionVentana.groupBy({
      by: ["loteId", "tipo", "disparadoPorId"],
      where: condicion,
      _min: { createdAt: true },
      orderBy: { _min: { createdAt: "desc" } },
      skip: (filtro.pagina - 1) * filtro.tamano,
      take: filtro.tamano,
    });

    const loteIds = gruposPagina.map((grupo) => grupo.loteId);

    // Conteos de éxito/error por lote, en una sola consulta adicional (nunca una por lote).
    const conteosPorResultado = await prisma.alertaNotificacionVentana.groupBy({
      by: ["loteId", "resultado"],
      where: { loteId: { in: loteIds } },
      _count: true,
    });

    const conteos = new Map<string, { exitos: number; errores: number }>();
    for (const grupo of conteosPorResultado) {
      const actual = conteos.get(grupo.loteId) ?? { exitos: 0, errores: 0 };
      if (grupo.resultado === "EXITO") actual.exitos += grupo._count;
      else actual.errores += grupo._count;
      conteos.set(grupo.loteId, actual);
    }

    // Nombres de quien disparó cada lote manual, en una sola consulta batch (nunca N+1).
    const idsDisparadores = [
      ...new Set(gruposPagina.map((grupo) => grupo.disparadoPorId).filter((id): id is string => id !== null)),
    ];
    const disparadores =
      idsDisparadores.length > 0
        ? await prisma.usuario.findMany({
            where: { id: { in: idsDisparadores } },
            select: { id: true, nombres: true, apellidos: true },
          })
        : [];
    const nombreDisparadorPorId = new Map(
      disparadores.map((usuario) => [usuario.id, nombreCompleto(usuario)]),
    );

    const filas: LoteAlertaVentana[] = gruposPagina.map((grupo) => ({
      loteId: grupo.loteId,
      tipo: grupo.tipo,
      disparadoPorId: grupo.disparadoPorId,
      disparadoPorNombre: grupo.disparadoPorId ? nombreDisparadorPorId.get(grupo.disparadoPorId) ?? null : null,
      creadoEn: grupo._min.createdAt ?? new Date(0),
      cantidadExitos: conteos.get(grupo.loteId)?.exitos ?? 0,
      cantidadErrores: conteos.get(grupo.loteId)?.errores ?? 0,
    }));

    return { filas, total };
  },

  async listarDestinatariosDeLotes(loteIds) {
    if (loteIds.length === 0) return {};

    const registros = await prisma.alertaNotificacionVentana.findMany({
      where: { loteId: { in: loteIds } },
      select: {
        loteId: true,
        usuarioId: true,
        resultado: true,
        detalleError: true,
        createdAt: true,
        usuario: { select: { nombres: true, apellidos: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const porLote: Record<string, DestinatarioAlertaVista[]> = {};
    for (const registro of registros) {
      const fila: DestinatarioAlertaVista = {
        usuarioId: registro.usuarioId,
        nombreCompleto: nombreCompleto(registro.usuario),
        email: registro.usuario.email,
        resultado: registro.resultado,
        detalleError: registro.detalleError,
        createdAt: registro.createdAt,
      };

      (porLote[registro.loteId] ??= []).push(fila);
    }

    return porLote;
  },

  async obtenerResumenPorVentanas(ventanaCargaIds) {
    if (ventanaCargaIds.length === 0) return {};

    // Filtrado a `tipo: "AUTOMATICA"`: este resumen alimenta únicamente el badge de envío
    // automático del tablero de seguimiento (`resolverEstadoAlertaVentana`, que retorna
    // "NO_CONFIGURADA" cuando la ventana no tiene envío automático configurado, sin mirar este
    // resumen). Si se agregaran también los envíos MANUAL_MASIVA/MANUAL_INDIVIDUAL aquí, una
    // ventana sin envío automático configurado pero con un envío manual fallido mostraría
    // igual "Alertas no configuradas", escondiendo el error — el historial manual ya es visible en
    // el detalle de la ventana, que es donde corresponde mirarlo.
    const [exitosos, conErrores] = await Promise.all([
      prisma.alertaNotificacionVentana.groupBy({
        by: ["ventanaCargaId"],
        where: { ventanaCargaId: { in: ventanaCargaIds }, tipo: "AUTOMATICA", resultado: "EXITO" },
        _max: { createdAt: true },
      }),
      prisma.alertaNotificacionVentana.groupBy({
        by: ["ventanaCargaId"],
        where: { ventanaCargaId: { in: ventanaCargaIds }, tipo: "AUTOMATICA", resultado: "ERROR" },
        _max: { createdAt: true },
      }),
    ]);

    const resumen: Record<string, ResumenAlertasVentana> = {};
    for (const id of ventanaCargaIds) {
      resumen[id] = { ultimoEnvioExitosoEn: null, ultimoEnvioConErrorEn: null };
    }
    for (const grupo of exitosos) {
      resumen[grupo.ventanaCargaId].ultimoEnvioExitosoEn = grupo._max.createdAt ?? null;
    }
    for (const grupo of conErrores) {
      resumen[grupo.ventanaCargaId].ultimoEnvioConErrorEn = grupo._max.createdAt ?? null;
    }

    return resumen;
  },

  async obtenerTotalesPorVentana(ventanaCargaId) {
    const grupos = await prisma.alertaNotificacionVentana.groupBy({
      by: ["tipo", "resultado"],
      where: { ventanaCargaId },
      _count: true,
    });

    return grupos.map(
      (grupo): TotalAlertaVentana => ({
        tipo: grupo.tipo,
        resultado: grupo.resultado,
        cantidad: grupo._count,
      }),
    );
  },

  async listarUsuariosConEnvioExitoso(ventanaCargaId, fechaProgramada) {
    const registros = await prisma.alertaNotificacionVentana.findMany({
      where: { ventanaCargaId, fechaProgramada, tipo: "AUTOMATICA", resultado: "EXITO" },
      select: { usuarioId: true },
    });

    return new Set(registros.map((registro) => registro.usuarioId));
  },
};
