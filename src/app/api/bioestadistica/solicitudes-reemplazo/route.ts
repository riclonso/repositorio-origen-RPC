import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { solicitarReemplazoBioestadistica } from "@/modules/bioestadistica/application/use-cases/SolicitarReemplazoBioestadistica";
import { prismaCargaBioestadisticaRepository } from "@/modules/bioestadistica/infrastructure/repositories/PrismaCargaBioestadisticaRepository";
import { prismaSolicitudReemplazoBioestadisticaRepository } from "@/modules/bioestadistica/infrastructure/repositories/PrismaSolicitudReemplazoBioestadisticaRepository";
import {
  auditarBioestadistica,
  capturarTransporte,
} from "@/modules/bioestadistica/infrastructure/auditoria/auditarBioestadistica";
import { solicitarReemplazoBioestadisticaSchema } from "@/modules/bioestadistica/schemas/bioestadistica.schema";
import { prismaVentanaCargaRepository } from "@/modules/ventanas-carga/infrastructure/repositories/PrismaVentanaCargaRepository";
import {
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_INTERNO,
  exigirBioestadistica,
  respuestaError,
  respuestaNoEncontrado,
  respuestaSinAcceso,
} from "@/app/api/bioestadistica/_lib/http";

const ACCION = "SOLICITUD_REEMPLAZO_BIOESTADISTICA_CREADA" as const;

const RECHAZOS = {
  NO_ES_VIGENTE: { mensaje: "Solo puedes solicitar el reemplazo de tu archivo vigente para ese año y tipo", estado: 409 },
  VENTANA_NO_DISPONIBLE: {
    mensaje: "Ese año ya no admite reemplazos (sus ventanas fueron archivadas, despublicadas o eliminadas)",
    estado: 409,
  },
  SOLICITUD_DUPLICADA: { mensaje: "Ya existe una solicitud de reemplazo pendiente para este archivo", estado: 409 },
  SOLICITUD_YA_APROBADA_VIGENTE: { mensaje: "Ya tienes una autorización de reemplazo vigente para este archivo", estado: 409 },
} as const;

// RF-37: la persona de Bioestadística solicita reemplazar su archivo vigente de un (año, tipo); se
// admite también con el año cerrado por fecha. La aprobación de ADMIN o REVISOR_REPOSITORIO
// (`PATCH /api/dashboard/solicitudes-reemplazo-bioestadistica/[id]`) habilita la subida. Se auditan
// éxitos y rechazos de negocio, nunca el texto del motivo.
export async function POST(request: Request) {
  const acceso = await exigirBioestadistica();

  if (!acceso.ok) {
    return respuestaSinAcceso(acceso.estado);
  }

  const cuerpo = await request.json().catch(() => null);
  const datos = solicitarReemplazoBioestadisticaSchema.safeParse(cuerpo);

  if (!datos.success) {
    return respuestaError(datos.error.issues[0]?.message ?? MENSAJE_DATOS_INVALIDOS, 400);
  }

  const transporte = capturarTransporte(request);

  try {
    const resultado = await solicitarReemplazoBioestadistica(
      { cargaBioestadisticaId: datos.data.cargaBioestadisticaId, usuarioId: acceso.sesion.sub, motivo: datos.data.motivo },
      {
        repositorio: prismaSolicitudReemplazoBioestadisticaRepository,
        repositorioCargas: prismaCargaBioestadisticaRepository,
        repositorioVentanas: prismaVentanaCargaRepository,
      },
    );

    if (!resultado.ok) {
      auditarBioestadistica(acceso.sesion, transporte, {
        accion: ACCION,
        resultado: "RECHAZADO",
        motivo: resultado.motivo,
        cargaBioestadisticaId: datos.data.cargaBioestadisticaId,
      });

      if (resultado.motivo === "NO_ENCONTRADO") return respuestaNoEncontrado();

      const rechazo = RECHAZOS[resultado.motivo];
      return respuestaError(rechazo.mensaje, rechazo.estado, { codigo: resultado.motivo });
    }

    const { solicitud } = resultado;

    auditarBioestadistica(acceso.sesion, transporte, {
      accion: ACCION,
      resultado: "EXITO",
      anio: solicitud.anio,
      tipoArchivoBioestadistica: solicitud.tipoArchivo,
      cargaBioestadisticaId: solicitud.cargaBioestadisticaId,
      solicitudReemplazoBioestadisticaId: solicitud.id,
    });

    return NextResponse.json({ solicitud: { id: solicitud.id, estado: solicitud.estado } }, { status: 201 });
  } catch (error) {
    logger.error("Error al solicitar el reemplazo de un archivo de Bioestadística", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
