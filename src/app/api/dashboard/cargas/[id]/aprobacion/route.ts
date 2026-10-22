import { NextResponse, after } from "next/server";
import { ejecutarAvisoCorreo } from "@/infrastructure/email/ejecutarAvisoCorreo";
import {
  destinatarioUsuario,
  registrarFallaCorreo,
  ventanaFallaCorreo,
} from "@/infrastructure/logging/fallasCorreo";
import { logger } from "@/infrastructure/logging/logger";
import type { DatosCorreoConfirmacionVistoBueno } from "@/modules/reporte-excel/application/ports";
import { darVistoBueno } from "@/modules/reporte-excel/application/use-cases/DarVistoBueno";
import type { CargaArchivo } from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import type { DestinatarioEquipoRevisor } from "@/modules/usuarios/domain/entities/DestinatarioEquipoRevisor";
import {
  aDestinatarioFallaCorreo,
  destinatarioEquipoRevisorSinConsultar,
} from "@/modules/usuarios/infrastructure/destinatarios/obtenerDestinatariosEquipoRevisor";
import { prismaCargaArchivoRepository } from "@/modules/reporte-excel/infrastructure/repositories/PrismaCargaArchivoRepository";
import { vistoBuenoCargaMailer } from "@/modules/reporte-excel/infrastructure/email/VistoBuenoCargaMailer";
import { auditarCargaArchivo } from "@/modules/reporte-excel/infrastructure/auditoria/auditarCargaArchivo";
import { prismaSolicitudReemplazoCargaRepository } from "@/modules/solicitudes-reemplazo/infrastructure/repositories/PrismaSolicitudReemplazoCargaRepository";
import { prismaUsuarioRepository } from "@/modules/usuarios/infrastructure/repositories/PrismaUsuarioRepository";
import {
  MENSAJE_ERROR_INTERNO,
  MENSAJE_NO_ENCONTRADO,
  aCargaArchivoDTO,
  exigirAdminORevisor,
  idCargaArchivoSchema,
  respuestaCargaNoPendiente,
  respuestaError,
  respuestaSinAcceso,
} from "@/app/api/dashboard/cargas/_lib/http";

const ACCION = "CARGA_ARCHIVO_APROBADA" as const;

function copiaCorreo(carga: CargaArchivo): Omit<DatosCorreoConfirmacionVistoBueno, "notificador"> {
  return {
    formatoExcelNombre: carga.formatoExcelNombre,
    anio: carga.anio,
    nombreArchivoOriginal: carga.nombreArchivoOriginal,
  };
}

// RF-44: cada falla (sin SMTP, preparación o envío) queda en `fallas-correo.txt`; nunca lanza.
function confirmarAlNotificador(carga: CargaArchivo): Promise<void> {
  return ejecutarAvisoCorreo({
    tipoAviso: "APROBACION_CARGA_NOTIFICADOR",
    ventana: ventanaFallaCorreo(carga),
    referencias: { cargaArchivoId: carga.id },
    destinatarioConocido: destinatarioUsuario({ id: carga.usuarioId, rut: carga.usuarioRut }),
    disponible: () => vistoBuenoCargaMailer.disponible(),
    preparar: () => prismaUsuarioRepository.obtenerPorId(carga.usuarioId),
    destinatarioDe: (notificador) => destinatarioUsuario(notificador),
    enviar: (notificador) =>
      vistoBuenoCargaMailer.enviarConfirmacionNotificador({
        notificador: { nombres: notificador.nombres, email: notificador.email },
        ...copiaCorreo(carga),
      }),
  });
}

// Un correo por destinatario del equipo revisor, con captura POR destinatario: un fallo no corta a
// los demás y cada uno queda registrado. Sin SMTP, una sola entrada (sin
// consultar a qué revisores iría).
async function confirmarAlEquipoRevisor(carga: CargaArchivo): Promise<void> {
  const contexto = {
    tipoAviso: "APROBACION_CARGA_REVISORES" as const,
    ventana: ventanaFallaCorreo(carga),
    referencias: { cargaArchivoId: carga.id },
  };

  if (!vistoBuenoCargaMailer.disponible()) {
    registrarFallaCorreo({ ...contexto, etapa: "SIN_CONFIGURACION", destinatario: destinatarioEquipoRevisorSinConsultar() });
    return;
  }

  let destinatarios: DestinatarioEquipoRevisor[];

  try {
    destinatarios = await vistoBuenoCargaMailer.resolverDestinatariosRevisores();
  } catch (error) {
    registrarFallaCorreo({
      ...contexto,
      etapa: "PREPARACION",
      destinatario: destinatarioEquipoRevisorSinConsultar(),
      error,
    });
    return;
  }

  // Lanzados juntos sin ráfaga real de conexiones: el transporte SMTP es un pool con
  // `maxConnections: 1` (`SmtpMailer.ts`), que encola los mensajes y los envía de a uno.
  const copia = copiaCorreo(carga);
  await Promise.all(
    destinatarios.map((destinatario) =>
      vistoBuenoCargaMailer.enviarConfirmacionRevisor(destinatario, copia).catch((error: unknown) => {
        registrarFallaCorreo({ ...contexto, etapa: "ENVIO", destinatario: aDestinatarioFallaCorreo(destinatario), error });
      }),
    ),
  );
}

// Corrección (fin de la autoaprobación): la aprobación ya no la da el notificador dueño de la
// carga, sino un tercero (ADMIN o REVISOR_REPOSITORIO), sobre una carga `PENDIENTE_VISTO_BUENO` que
// el notificador ya finalizó y envió. Es irreversible: no hay endpoint ni UI para deshacerla. El
// correo de confirmación (al notificador y al equipo revisor) se DIFIERE con `after()`, mismo
// patrón que el resto del módulo.
export async function POST(request: Request, contexto: { params: Promise<{ id: string }> }) {
  const [{ id }, acceso] = await Promise.all([contexto.params, exigirAdminORevisor()]);

  if (!acceso.ok) {
    return respuestaSinAcceso(acceso.estado);
  }

  const idValido = idCargaArchivoSchema.safeParse(id);

  if (!idValido.success) {
    return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
  }

  try {
    // RF-38: el visto bueno ya no relee el archivo ni copia filas: solo la transición y la cabecera.
    const resultado = await darVistoBueno(idValido.data, acceso.sesion.sub, {
      repositorio: prismaCargaArchivoRepository,
      repositorioSolicitudesReemplazo: prismaSolicitudReemplazoCargaRepository,
    });

    if (!resultado.ok) {
      auditarCargaArchivo(acceso.sesion, request, {
        accion: ACCION,
        resultado: "RECHAZADO",
        motivo: resultado.motivo,
        cargaArchivoId: idValido.data,
      });

      if (resultado.motivo === "NO_ENCONTRADO") {
        return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
      }

      return respuestaCargaNoPendiente();
    }

    auditarCargaArchivo(acceso.sesion, request, {
      accion: ACCION,
      resultado: "EXITO",
      cargaArchivoId: resultado.carga.id,
      formatoExcelId: resultado.carga.formatoExcelId,
      usuarioObjetivoId: resultado.carga.usuarioId,
      usuarioObjetivoRut: resultado.carga.usuarioRut,
    });

    // Confirmación de aprobación DIFERIDA con after(): al notificador dueño de la carga y al
    // buzón compartido del equipo revisor (o, si no está configurado, a cada revisor activo
    // individualmente). Nunca bloquea ni revierte la aprobación ya persistida.
    const { carga } = resultado;
    after(async () => {
      await confirmarAlNotificador(carga);
      await confirmarAlEquipoRevisor(carga);
    });

    return NextResponse.json({ carga: aCargaArchivoDTO(resultado.carga) });
  } catch (error) {
    logger.error("Error al aprobar una carga de archivo", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
