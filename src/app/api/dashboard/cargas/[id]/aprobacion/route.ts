import { NextResponse, after } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { darVistoBueno } from "@/modules/reporte-excel/application/use-cases/DarVistoBueno";
import { prismaCargaArchivoRepository } from "@/modules/reporte-excel/infrastructure/repositories/PrismaCargaArchivoRepository";
import { lectorArchivoReporteExcelJs } from "@/modules/reporte-excel/infrastructure/lectura-archivo/LectorArchivoReporteExcelJs";
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
    const resultado = await darVistoBueno(idValido.data, acceso.sesion.sub, {
      repositorio: prismaCargaArchivoRepository,
      lector: lectorArchivoReporteExcelJs,
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
    after(async () => {
      const { carga } = resultado;

      if (!vistoBuenoCargaMailer.disponible()) {
        return;
      }

      const copia = {
        formatoExcelNombre: carga.formatoExcelNombre,
        anio: carga.anio,
        nombreArchivoOriginal: carga.nombreArchivoOriginal,
      };

      try {
        const notificador = await prismaUsuarioRepository.obtenerPorId(carga.usuarioId);

        if (notificador) {
          await vistoBuenoCargaMailer.enviarConfirmacionNotificador({
            notificador: { nombres: notificador.nombres, email: notificador.email },
            ...copia,
          });
        }
      } catch (error) {
        logger.error("Error al enviar el correo de confirmación de aprobación al notificador", {
          cargaArchivoId: carga.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      try {
        await vistoBuenoCargaMailer.enviarConfirmacionRevisores(copia);
      } catch (error) {
        logger.error("Error al enviar el correo de confirmación de aprobación al equipo revisor", {
          cargaArchivoId: carga.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    return NextResponse.json({ carga: aCargaArchivoDTO(resultado.carga) });
  } catch (error) {
    logger.error("Error al aprobar una carga de archivo", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
