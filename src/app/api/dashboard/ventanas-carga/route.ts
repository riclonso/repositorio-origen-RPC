import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { listarVentanasCarga } from "@/modules/ventanas-carga/application/use-cases/ListarVentanasCarga";
import { crearVentanaCarga } from "@/modules/ventanas-carga/application/use-cases/CrearVentanaCarga";
import { prismaVentanaCargaRepository } from "@/modules/ventanas-carga/infrastructure/repositories/PrismaVentanaCargaRepository";
import { prismaFormatoExcelRepository } from "@/modules/formatos-excel/infrastructure/repositories/PrismaFormatoExcelRepository";
import { auditarVentanaCarga } from "@/modules/ventanas-carga/infrastructure/auditoria/auditarVentanaCarga";
import { crearVentanaCargaSchema } from "@/modules/ventanas-carga/schemas/ventana-carga.schema";
import {
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_INTERNO,
  aVentanaCargaDTO,
  exigirAdminORevisor,
  respuestaAnioDuplicado,
  respuestaError,
  respuestaFormatoInvalido,
  respuestaRangoInvalido,
  respuestaSinAcceso,
} from "@/app/api/dashboard/ventanas-carga/_lib/http";
import { estaAbierta } from "@/modules/ventanas-carga/domain/entities/VentanaCarga";

// Lecturas no se auditan (mismo criterio que `formatos-excel`/`usuarios`): solo se audita el
// cambio de estado, no quién lo consultó.
export async function GET() {
  const acceso = await exigirAdminORevisor();

  if (!acceso.ok) {
    return respuestaSinAcceso(acceso.estado);
  }

  try {
    const ventanas = await listarVentanasCarga({ repositorio: prismaVentanaCargaRepository });
    return NextResponse.json({ datos: ventanas.map(aVentanaCargaDTO) });
  } catch (error) {
    logger.error("Error al listar las ventanas de carga", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}

// Crea una ventana de carga (año + fechas de apertura/vencimiento). Solo ADMIN y
// REVISOR_REPOSITORIO pueden crearlas (RF-15).
export async function POST(request: Request) {
  const acceso = await exigirAdminORevisor();

  if (!acceso.ok) {
    if (acceso.estado === 403) {
      auditarVentanaCarga(acceso.sesion, request, {
        accion: "VENTANA_CARGA_CREADA",
        resultado: "RECHAZADO",
        motivo: "SIN_PERMISO",
      });
    }

    return respuestaSinAcceso(acceso.estado);
  }

  const cuerpo = await request.json().catch(() => null);
  const datos = crearVentanaCargaSchema.safeParse(cuerpo);

  if (!datos.success) {
    const primerProblema = datos.error.issues[0];
    return respuestaError(primerProblema?.message ?? MENSAJE_DATOS_INVALIDOS, 400, {
      campo: primerProblema?.path[0] ? String(primerProblema.path[0]) : undefined,
    });
  }

  try {
    const resultado = await crearVentanaCarga(
      {
        anio: datos.data.anio,
        fechaApertura: datos.data.fechaApertura,
        fechaVencimiento: datos.data.fechaVencimiento,
        formatoExcelId: datos.data.formatoExcelId,
        creadoPorId: acceso.sesion.sub,
      },
      { repositorio: prismaVentanaCargaRepository, repositorioFormatosExcel: prismaFormatoExcelRepository },
    );

    if (!resultado.ok) {
      if (resultado.motivo === "RANGO_INVALIDO") {
        auditarVentanaCarga(acceso.sesion, request, {
          accion: "VENTANA_CARGA_CREADA",
          resultado: "RECHAZADO",
          motivo: "RANGO_INVALIDO",
          anio: datos.data.anio,
          fechaApertura: datos.data.fechaApertura,
          fechaVencimiento: datos.data.fechaVencimiento,
        });
        return respuestaRangoInvalido(
          "La fecha de vencimiento debe ser posterior a la fecha de apertura",
        );
      }

      if (resultado.motivo === "FORMATO_INVALIDO") {
        auditarVentanaCarga(acceso.sesion, request, {
          accion: "VENTANA_CARGA_CREADA",
          resultado: "RECHAZADO",
          motivo: "FORMATO_INVALIDO",
          anio: datos.data.anio,
          formatoExcelId: datos.data.formatoExcelId,
        });
        return respuestaFormatoInvalido();
      }

      auditarVentanaCarga(acceso.sesion, request, {
        accion: "VENTANA_CARGA_CREADA",
        resultado: "RECHAZADO",
        motivo: "ANIO_DUPLICADO",
        anio: datos.data.anio,
      });
      return respuestaAnioDuplicado(datos.data.anio);
    }

    auditarVentanaCarga(acceso.sesion, request, {
      accion: "VENTANA_CARGA_CREADA",
      resultado: "EXITO",
      ventanaCargaId: resultado.ventana.id,
      anio: resultado.ventana.anio,
      fechaApertura: resultado.ventana.fechaApertura,
      fechaVencimiento: resultado.ventana.fechaVencimiento,
      formatoExcelId: resultado.ventana.formatoExcelId,
    });

    const ahora = new Date();
    return NextResponse.json(
      { ventana: aVentanaCargaDTO({ ...resultado.ventana, abierta: estaAbierta(resultado.ventana, ahora) }) },
      { status: 201 },
    );
  } catch (error) {
    logger.error("Error al crear una ventana de carga", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
