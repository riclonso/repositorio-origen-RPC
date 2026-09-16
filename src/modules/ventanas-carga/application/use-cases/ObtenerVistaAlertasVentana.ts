import type { VentanaCarga } from "@/modules/ventanas-carga/domain/entities/VentanaCarga";
import { calcularDiasRestantes } from "@/modules/ventanas-carga/domain/entities/VentanaCarga";
import { resolverPlantillaAlerta, sanitizarMensajeResueltoHtml } from "@/modules/ventanas-carga/domain/entities/PlantillaAlerta";
import type {
  DestinatarioAlertaVista,
  NotificadorPendiente,
  PaginaLotesAlerta,
  TotalAlertaVentana,
} from "@/modules/ventanas-carga/domain/entities/AlertaNotificacion";
import type { VentanaCargaRepository } from "@/modules/ventanas-carga/domain/repositories/VentanaCargaRepository";
import type { AlertaNotificacionRepository } from "@/modules/ventanas-carga/domain/repositories/AlertaNotificacionRepository";
import type { EnviadorCorreoAlerta } from "@/modules/ventanas-carga/application/ports";
import { nombreCompleto } from "@/modules/usuarios/domain/entities/Usuario";

export type NotificadorPendienteConMensaje = NotificadorPendiente & {
  // Mensaje ya resuelto (placeholders + enlace reales) y sanitizado, precargado en el modal de
  // envío individual (`ModalEnviarAlertaIndividual`). El operador puede seguir editándolo antes
  // de confirmar; el servidor lo vuelve a sanitizar en `EnviarAlertaIndividualVentana`.
  mensajePrevio: string;
};

export type VistaAlertasVentana = {
  correoDisponible: boolean;
  pendientes: NotificadorPendienteConMensaje[];
  lotesAutomaticos: PaginaLotesAlerta;
  lotesManuales: PaginaLotesAlerta;
  destinatariosPorLote: Record<string, DestinatarioAlertaVista[]>;
  totales: TotalAlertaVentana[];
};

export type PaginacionVistaAlertasVentana = {
  paginaAutomatica: number;
  paginaManual: number;
  tamano: number;
};

export type DependenciasVistaAlertasVentana = {
  repositorioVentanas: VentanaCargaRepository;
  repositorioAlertas: AlertaNotificacionRepository;
  enviadorCorreo: EnviadorCorreoAlerta;
};

// Agrega todo lo que necesita la sección "Alertas por email" de `DetalleVentanaCarga`: los
// pendientes (con su mensaje ya resuelto para precargar el modal individual), el historial
// paginado en sus dos categorías, los destinatarios de los lotes de la página actual (ya
// precargados, sin llamada de red por fila al expandir el acordeón) y los totales agregados.
// Recibe la ventana ya resuelta por el llamador (nunca la vuelve a buscar), mismo criterio que
// `ObtenerResumenSeguimientoVentanasAbiertas` de orquestar sin repetir consultas.
export async function obtenerVistaAlertasVentana(
  ventana: VentanaCarga,
  paginacion: PaginacionVistaAlertasVentana,
  dependencias: DependenciasVistaAlertasVentana,
  ahora: Date = new Date(),
): Promise<VistaAlertasVentana> {
  const correoDisponible = dependencias.enviadorCorreo.disponible();
  // Sin SMTP configurado no hay URL real que resolver: se usa un marcador visual para que la
  // previsualización no rompa la pantalla. El envío real seguirá fallando con un mensaje claro
  // (`AlertaVentanaMailer.enviar` lanza si `configSmtp` es `null`).
  const urlEnlaceSistema = correoDisponible ? dependencias.enviadorCorreo.construirUrlEnlaceSistema() : "#";

  const [pendientesBase, lotesAutomaticos, lotesManuales, totales] = await Promise.all([
    dependencias.repositorioVentanas.listarNotificadoresPendientes(ventana.id),
    dependencias.repositorioAlertas.listarLotesPorVentana({
      ventanaCargaId: ventana.id,
      categoria: "AUTOMATICA",
      pagina: paginacion.paginaAutomatica,
      tamano: paginacion.tamano,
    }),
    dependencias.repositorioAlertas.listarLotesPorVentana({
      ventanaCargaId: ventana.id,
      categoria: "MANUAL",
      pagina: paginacion.paginaManual,
      tamano: paginacion.tamano,
    }),
    dependencias.repositorioAlertas.obtenerTotalesPorVentana(ventana.id),
  ]);

  const diasRestantes = calcularDiasRestantes(ventana.fechaVencimiento, ahora);

  const pendientes: NotificadorPendienteConMensaje[] = pendientesBase.map((pendiente) => {
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

    return { ...pendiente, mensajePrevio: sanitizarMensajeResueltoHtml(mensajeResuelto, urlEnlaceSistema) };
  });

  const loteIds = [...lotesAutomaticos.filas, ...lotesManuales.filas].map((lote) => lote.loteId);
  const destinatariosPorLote = await dependencias.repositorioAlertas.listarDestinatariosDeLotes(loteIds);

  return { correoDisponible, pendientes, lotesAutomaticos, lotesManuales, destinatariosPorLote, totales };
}
