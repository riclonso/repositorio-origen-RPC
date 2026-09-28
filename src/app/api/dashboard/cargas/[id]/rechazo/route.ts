import { NextResponse, after } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { rechazarCarga } from "@/modules/reporte-excel/application/use-cases/RechazarCarga";
import { prismaCargaArchivoRepository } from "@/modules/reporte-excel/infrastructure/repositories/PrismaCargaArchivoRepository";
import { rechazoCargaMailer } from "@/modules/reporte-excel/infrastructure/email/RechazoCargaMailer";
import { auditarCargaArchivo } from "@/modules/reporte-excel/infrastructure/auditoria/auditarCargaArchivo";
import { rechazarCargaSchema } from "@/modules/reporte-excel/schemas/reporte-excel.schema";
import { prismaUsuarioRepository } from "@/modules/usuarios/infrastructure/repositories/PrismaUsuarioRepository";
import {
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_INTERNO,
  MENSAJE_NO_ENCONTRADO,
  aCargaArchivoDTO,
  exigirAdminORevisor,
  idCargaArchivoSchema,
  respuestaCargaNoRechazable,
  respuestaError,
  respuestaSinAcceso,
} from "@/app/api/dashboard/cargas/_lib/http";

const ACCION = "CARGA_ARCHIVO_RECHAZADA" as const;

// Rechazo unilateral de una carga `APROBADA` o `PENDIENTE_VISTO_BUENO` ya finalizada por el
// notificador (RF-20 ampliado): cualquier ADMIN o REVISOR_REPOSITORIO puede rechazar cualquier
// carga (simétrico, mismo criterio que `RevisarSolicitudReemplazo`), sin restricción de autoría.
// Irreversible: no hay endpoint para deshacerlo. El correo al notificador se DIFIERE con `after()`,
// mismo patrón que `PATCH /api/dashboard/solicitudes-reemplazo/[id]`.
export async function POST(request: Request, contexto: { params: Promise<{ id: string }> }) {
  const [{ id }, acceso] = await Promise.all([contexto.params, exigirAdminORevisor()]);

  if (!acceso.ok) {
    return respuestaSinAcceso(acceso.estado);
  }

  const idValido = idCargaArchivoSchema.safeParse(id);

  if (!idValido.success) {
    return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
  }

  const cuerpo = await request.json().catch(() => null);
  const datos = rechazarCargaSchema.safeParse(cuerpo);

  if (!datos.success) {
    return respuestaError(datos.error.issues[0]?.message ?? MENSAJE_DATOS_INVALIDOS, 400);
  }

  try {
    const resultado = await rechazarCarga(
      idValido.data,
      { rechazadoPorId: acceso.sesion.sub, motivo: datos.data.motivo },
      { repositorio: prismaCargaArchivoRepository },
    );

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

      return respuestaCargaNoRechazable();
    }

    const { carga, estadoOrigen } = resultado;

    // El motivo (texto libre) NUNCA se registra en auditoría, solo metadata estructurada, mismo
    // criterio que `motivo`/`comentarioRevision` de solicitudes de reemplazo.
    auditarCargaArchivo(acceso.sesion, request, {
      accion: ACCION,
      resultado: "EXITO",
      cargaArchivoId: carga.id,
      formatoExcelId: carga.formatoExcelId,
      usuarioObjetivoId: carga.usuarioId,
      usuarioObjetivoRut: carga.usuarioRut,
      estadoOrigenRechazo: estadoOrigen,
      origenRechazo: "DECISION_UNILATERAL",
    });

    // El correo se DIFIERE con after(): el rechazo ya quedó guardado y no depende de que el relay
    // SMTP esté configurado ni de que el envío tenga éxito.
    after(async () => {
      try {
        const destinatario = await prismaUsuarioRepository.obtenerPorId(carga.usuarioId);

        if (!destinatario || !rechazoCargaMailer.disponible()) {
          return;
        }

        await rechazoCargaMailer.enviarRechazo({
          destinatario: { nombres: destinatario.nombres, email: destinatario.email },
          formatoExcelNombre: carga.formatoExcelNombre,
          anio: carga.anio,
          nombreArchivoOriginal: carga.nombreArchivoOriginal,
          motivo: datos.data.motivo,
        });
      } catch (error) {
        logger.error("Error al enviar el correo de rechazo de una carga de archivo", {
          cargaArchivoId: carga.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    return NextResponse.json({ carga: aCargaArchivoDTO(carga) });
  } catch (error) {
    logger.error("Error al rechazar una carga de archivo", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
