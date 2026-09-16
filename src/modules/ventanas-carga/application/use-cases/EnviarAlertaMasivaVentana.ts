import type { VentanaCargaRepository } from "@/modules/ventanas-carga/domain/repositories/VentanaCargaRepository";
import type { AlertaNotificacionRepository } from "@/modules/ventanas-carga/domain/repositories/AlertaNotificacionRepository";
import type { EnviadorCorreoAlerta } from "@/modules/ventanas-carga/application/ports";
import { calcularDiasRestantes } from "@/modules/ventanas-carga/domain/entities/VentanaCarga";
import { resolverPlantillaAlerta, sanitizarMensajeResueltoHtml } from "@/modules/ventanas-carga/domain/entities/PlantillaAlerta";
import { nombreCompleto } from "@/modules/usuarios/domain/entities/Usuario";
import { describirFalloEnvio } from "@/shared/utils/describirFalloEnvio";

export type ResultadoEnvioDestinatario = {
  usuarioId: string;
  resultado: "EXITO" | "ERROR";
};

export type ResultadoEnviarAlertaMasivaVentana =
  | { ok: true; loteId: string; resultados: ResultadoEnvioDestinatario[] }
  | { ok: false; motivo: "VENTANA_NO_ENCONTRADA" }
  | { ok: false; motivo: "SIN_PENDIENTES" };

function asuntoAlerta(formatoExcelNombre: string, anio: number): string {
  return `Recordatorio: reporta tu archivo de ${formatoExcelNombre} (${anio})`;
}

export type DependenciasEnvioAlertaVentana = {
  repositorioVentanas: VentanaCargaRepository;
  repositorioAlertas: AlertaNotificacionRepository;
  enviadorCorreo: EnviadorCorreoAlerta;
};

// RF-17: envío masivo, manual, disparado por un ADMIN/REVISOR_REPOSITORIO. Un solo lote
// (`loteId` nuevo), un intento por destinatario (sin reintento, a diferencia del ciclo
// automático). No genera lote si no hay pendientes: un lote vacío no aportaría nada al historial.
export async function enviarAlertaMasivaVentana(
  id: string,
  actorId: string,
  dependencias: DependenciasEnvioAlertaVentana,
): Promise<ResultadoEnviarAlertaMasivaVentana> {
  const ventana = await dependencias.repositorioVentanas.obtenerPorId(id);

  if (!ventana) {
    return { ok: false, motivo: "VENTANA_NO_ENCONTRADA" };
  }

  const pendientes = await dependencias.repositorioVentanas.listarNotificadoresPendientes(id);

  if (pendientes.length === 0) {
    return { ok: false, motivo: "SIN_PENDIENTES" };
  }

  const loteId = crypto.randomUUID();
  const ahora = new Date();
  const diasRestantes = calcularDiasRestantes(ventana.fechaVencimiento, ahora);
  const asunto = asuntoAlerta(ventana.formatoExcelNombre, ventana.anio);
  const urlEnlaceSistema = dependencias.enviadorCorreo.construirUrlEnlaceSistema();

  const resultados: ResultadoEnvioDestinatario[] = [];
  const filas: Parameters<AlertaNotificacionRepository["crearLote"]>[0] = [];

  for (const pendiente of pendientes) {
    const mensajeResuelto = resolverPlantillaAlerta(
      ventana.plantillaAlerta,
      {
        nombreUsuario: nombreCompleto(pendiente),
        diasRestantes: String(diasRestantes),
        formatoArchivo: ventana.formatoExcelNombre,
        anio: String(ventana.anio),
      },
      urlEnlaceSistema,
    );
    const mensajeSanitizado = sanitizarMensajeResueltoHtml(mensajeResuelto, urlEnlaceSistema);

    try {
      await dependencias.enviadorCorreo.enviar({
        destinatarioEmail: pendiente.email,
        asunto,
        html: mensajeSanitizado,
      });

      resultados.push({ usuarioId: pendiente.id, resultado: "EXITO" });
      filas.push({
        loteId,
        ventanaCargaId: id,
        usuarioId: pendiente.id,
        tipo: "MANUAL_MASIVA",
        resultado: "EXITO",
        asunto,
        mensaje: mensajeSanitizado,
        detalleError: null,
        disparadoPorId: actorId,
        fechaProgramada: null,
      });
    } catch (error) {
      resultados.push({ usuarioId: pendiente.id, resultado: "ERROR" });
      filas.push({
        loteId,
        ventanaCargaId: id,
        usuarioId: pendiente.id,
        tipo: "MANUAL_MASIVA",
        resultado: "ERROR",
        asunto,
        mensaje: mensajeSanitizado,
        detalleError: describirFalloEnvio(error),
        disparadoPorId: actorId,
        fechaProgramada: null,
      });
    }
  }

  await dependencias.repositorioAlertas.crearLote(filas);

  return { ok: true, loteId, resultados };
}
