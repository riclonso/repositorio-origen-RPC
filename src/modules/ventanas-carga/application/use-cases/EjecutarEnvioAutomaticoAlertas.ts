import type { VentanaCargaRepository } from "@/modules/ventanas-carga/domain/repositories/VentanaCargaRepository";
import type { AlertaNotificacionRepository } from "@/modules/ventanas-carga/domain/repositories/AlertaNotificacionRepository";
import type { NuevaAlertaNotificacion } from "@/modules/ventanas-carga/domain/entities/AlertaNotificacion";
import type { EnviadorCorreoAlerta } from "@/modules/ventanas-carga/application/ports";
import { calcularDiasRestantes, esDiaDeEnvioAutomatico } from "@/modules/ventanas-carga/domain/entities/VentanaCarga";
import { resolverPlantillaAlerta, sanitizarMensajeResueltoHtml } from "@/modules/ventanas-carga/domain/entities/PlantillaAlerta";
import { nombreCompleto } from "@/modules/usuarios/domain/entities/Usuario";
import { describirFalloEnvio } from "@/shared/utils/describirFalloEnvio";

const MAXIMO_INTENTOS_ENVIO_AUTOMATICO = 3;
const ESPERA_ENTRE_INTENTOS_MS = 2_000;

type ResultadoEnvio = { resultado: "EXITO" } | { resultado: "ERROR"; detalleError: string };

// Reintenta hasta `MAXIMO_INTENTOS_ENVIO_AUTOMATICO` veces, con espera fija entre intentos. Solo
// se persiste el resultado FINAL (una fila por destinatario, nunca una por intento).
async function enviarConReintento(enviar: () => Promise<void>): Promise<ResultadoEnvio> {
  let ultimoError: unknown;

  for (let intento = 1; intento <= MAXIMO_INTENTOS_ENVIO_AUTOMATICO; intento++) {
    try {
      await enviar();
      return { resultado: "EXITO" };
    } catch (error) {
      ultimoError = error;
      if (intento < MAXIMO_INTENTOS_ENVIO_AUTOMATICO) {
        await new Promise((resolve) => setTimeout(resolve, ESPERA_ENTRE_INTENTOS_MS));
      }
    }
  }

  return { resultado: "ERROR", detalleError: describirFalloEnvio(ultimoError) };
}

function asuntoAlerta(formatoExcelNombre: string, anio: number): string {
  return `Recordatorio: reporta tu archivo de ${formatoExcelNombre} (${anio})`;
}

// Día calendario UTC "de pared" de `ahora`, truncado a medianoche: mismo convenio de fechas del
// resto del proyecto (nunca se compara contra `now()` de PostgreSQL ni se castea a zona).
function diaCalendarioUtc(ahora: Date): Date {
  return new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate()));
}

export type DependenciasEnvioAutomaticoAlertas = {
  repositorioVentanas: VentanaCargaRepository;
  repositorioAlertas: AlertaNotificacionRepository;
  enviadorCorreo: EnviadorCorreoAlerta;
};

export type ResultadoCicloAutomaticoAlertas = {
  ventanasProcesadas: number;
  enviosExitosos: number;
  enviosConError: number;
};

// RF-17: ciclo diario del scheduler. Recorre las ventanas abiertas y publicadas con alertas
// configuradas, y para las que hoy corresponde enviar (`esDiaDeEnvioAutomatico`), reenvía a cada
// pendiente con reintento. Un lote por ventana (nunca mezcla lotes de ventanas distintas bajo el
// mismo `loteId`). Los envíos automáticos NO se auditan en `logs/auditoria.txt`: esta tabla es su
// registro estructurado; solo un fallo del ciclo COMPLETO (no de un envío puntual) debe
// propagarse para que quien invoque este caso de uso lo registre en `logs/errores.txt`.
export async function ejecutarEnvioAutomaticoAlertas(
  dependencias: DependenciasEnvioAutomaticoAlertas,
  ahora: Date = new Date(),
): Promise<ResultadoCicloAutomaticoAlertas> {
  const fechaProgramada = diaCalendarioUtc(ahora);
  const ventanasAbiertas = await dependencias.repositorioVentanas.listarDisponibles(ahora);
  const ventanasConAlertaHoy = ventanasAbiertas.filter((ventana) => esDiaDeEnvioAutomatico(ventana, ahora));

  let enviosExitosos = 0;
  let enviosConError = 0;

  for (const ventana of ventanasConAlertaHoy) {
    const [pendientes, yaEnviados] = await Promise.all([
      dependencias.repositorioVentanas.listarNotificadoresPendientes(ventana.id),
      dependencias.repositorioAlertas.listarUsuariosConEnvioExitoso(ventana.id, fechaProgramada),
    ]);

    const pendientesSinEnvioHoy = pendientes.filter((pendiente) => !yaEnviados.has(pendiente.id));
    if (pendientesSinEnvioHoy.length === 0) continue;

    const loteId = crypto.randomUUID();
    const diasRestantes = calcularDiasRestantes(ventana.fechaVencimiento, ahora);
    const asunto = asuntoAlerta(ventana.formatoExcelNombre, ventana.anio);
    const urlEnlaceSistema = dependencias.enviadorCorreo.construirUrlEnlaceSistema();

    const filas: NuevaAlertaNotificacion[] = [];

    for (const pendiente of pendientesSinEnvioHoy) {
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

      const resultadoEnvio = await enviarConReintento(() =>
        dependencias.enviadorCorreo.enviar({
          destinatarioEmail: pendiente.email,
          asunto,
          html: mensajeSanitizado,
        }),
      );

      if (resultadoEnvio.resultado === "EXITO") {
        enviosExitosos++;
      } else {
        enviosConError++;
      }

      filas.push({
        loteId,
        ventanaCargaId: ventana.id,
        usuarioId: pendiente.id,
        tipo: "AUTOMATICA",
        resultado: resultadoEnvio.resultado,
        asunto,
        mensaje: mensajeSanitizado,
        detalleError: resultadoEnvio.resultado === "ERROR" ? resultadoEnvio.detalleError : null,
        disparadoPorId: null,
        fechaProgramada,
      });
    }

    await dependencias.repositorioAlertas.crearLote(filas);
  }

  return { ventanasProcesadas: ventanasConAlertaHoy.length, enviosExitosos, enviosConError };
}
