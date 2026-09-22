import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { obtenerVentanaCarga } from "@/modules/ventanas-carga/application/use-cases/ObtenerVentanaCarga";
import { editarVentanaCarga } from "@/modules/ventanas-carga/application/use-cases/EditarVentanaCarga";
import { eliminarVentanaCarga } from "@/modules/ventanas-carga/application/use-cases/EliminarVentanaCarga";
import { prismaVentanaCargaRepository } from "@/modules/ventanas-carga/infrastructure/repositories/PrismaVentanaCargaRepository";
import { prismaFormatoExcelRepository } from "@/modules/formatos-excel/infrastructure/repositories/PrismaFormatoExcelRepository";
import { auditarVentanaCarga } from "@/modules/ventanas-carga/infrastructure/auditoria/auditarVentanaCarga";
import { editarVentanaCargaSchema } from "@/modules/ventanas-carga/schemas/ventana-carga.schema";
import { estaAbierta } from "@/modules/ventanas-carga/domain/entities/VentanaCarga";
import {
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_INTERNO,
  MENSAJE_NO_ENCONTRADO,
  aVentanaCargaDTO,
  exigirAdminORevisor,
  idVentanaCargaSchema,
  respuestaError,
  respuestaFormatoInvalido,
  respuestaRangoInvalido,
  respuestaSinAcceso,
  respuestaSinPermisoEliminar,
  respuestaVentanaEliminada,
} from "@/app/api/dashboard/ventanas-carga/_lib/http";

export async function GET(_request: Request, contexto: { params: Promise<{ id: string }> }) {
  const [{ id }, acceso] = await Promise.all([contexto.params, exigirAdminORevisor()]);

  if (!acceso.ok) {
    return respuestaSinAcceso(acceso.estado);
  }

  const idValido = idVentanaCargaSchema.safeParse(id);

  if (!idValido.success) {
    return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
  }

  try {
    const ventana = await obtenerVentanaCarga(idValido.data, { repositorio: prismaVentanaCargaRepository });

    if (!ventana) {
      return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
    }

    return NextResponse.json({ ventana: aVentanaCargaDTO(ventana) });
  } catch (error) {
    logger.error("Error al obtener una ventana de carga", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}

// Edita las fechas de apertura/vencimiento de una ventana ya existente. `anio` es inmutable y no
// se recibe aquí. Se permite editar aunque la ventana ya tenga cargas asociadas (decisión
// explícita del diseño de RF-15): este endpoint no comprueba cargas existentes.
export async function PUT(request: Request, contexto: { params: Promise<{ id: string }> }) {
  const [{ id }, acceso, cuerpo] = await Promise.all([
    contexto.params,
    exigirAdminORevisor(),
    request.json().catch(() => null),
  ]);

  if (!acceso.ok) {
    if (acceso.estado === 403) {
      auditarVentanaCarga(acceso.sesion, request, {
        accion: "VENTANA_CARGA_EDITADA",
        resultado: "RECHAZADO",
        motivo: "SIN_PERMISO",
        ventanaCargaId: id,
      });
    }

    return respuestaSinAcceso(acceso.estado);
  }

  const idValido = idVentanaCargaSchema.safeParse(id);

  if (!idValido.success) {
    return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
  }

  const datos = editarVentanaCargaSchema.safeParse(cuerpo);

  if (!datos.success) {
    const primerProblema = datos.error.issues[0];
    return respuestaError(primerProblema?.message ?? MENSAJE_DATOS_INVALIDOS, 400, {
      campo: primerProblema?.path[0] ? String(primerProblema.path[0]) : undefined,
    });
  }

  try {
    const resultado = await editarVentanaCarga(idValido.data, datos.data, {
      repositorio: prismaVentanaCargaRepository,
      repositorioFormatosExcel: prismaFormatoExcelRepository,
    });

    if (!resultado.ok) {
      if (resultado.motivo === "VENTANA_NO_ENCONTRADA") {
        auditarVentanaCarga(acceso.sesion, request, {
          accion: "VENTANA_CARGA_EDITADA",
          resultado: "RECHAZADO",
          motivo: "NO_ENCONTRADO",
          ventanaCargaId: idValido.data,
        });
        return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
      }

      if (resultado.motivo === "VENTANA_ELIMINADA") {
        auditarVentanaCarga(acceso.sesion, request, {
          accion: "VENTANA_CARGA_EDITADA",
          resultado: "RECHAZADO",
          motivo: "VENTANA_ELIMINADA",
          ventanaCargaId: idValido.data,
        });
        return respuestaVentanaEliminada();
      }

      if (resultado.motivo === "FORMATO_INVALIDO") {
        auditarVentanaCarga(acceso.sesion, request, {
          accion: "VENTANA_CARGA_EDITADA",
          resultado: "RECHAZADO",
          motivo: "FORMATO_INVALIDO",
          ventanaCargaId: idValido.data,
          formatoExcelId: datos.data.formatoExcelId,
        });
        return respuestaFormatoInvalido();
      }

      auditarVentanaCarga(acceso.sesion, request, {
        accion: "VENTANA_CARGA_EDITADA",
        resultado: "RECHAZADO",
        motivo: "RANGO_INVALIDO",
        ventanaCargaId: idValido.data,
        fechaApertura: datos.data.fechaApertura,
        fechaVencimiento: datos.data.fechaVencimiento,
      });
      return respuestaRangoInvalido(
        "La fecha de vencimiento debe ser posterior a la fecha de apertura",
      );
    }

    auditarVentanaCarga(acceso.sesion, request, {
      accion: "VENTANA_CARGA_EDITADA",
      resultado: "EXITO",
      ventanaCargaId: resultado.ventana.id,
      anio: resultado.ventana.anio,
      fechaApertura: resultado.ventana.fechaApertura,
      fechaVencimiento: resultado.ventana.fechaVencimiento,
      formatoExcelId: resultado.ventana.formatoExcelId,
    });

    const ahora = new Date();
    return NextResponse.json({
      ventana: aVentanaCargaDTO({ ...resultado.ventana, abierta: estaAbierta(resultado.ventana, ahora) }),
    });
  } catch (error) {
    logger.error("Error al editar una ventana de carga", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}

// Elimina una ventana: física si no tiene cargas asociadas, lógica si ya tiene alguna (ver
// `eliminarVentanaCarga`). ADMIN puede eliminar cualquiera; REVISOR_REPOSITORIO solo las que él
// mismo creó — la única acción de RF-15 con esa asimetría entre ambos perfiles.
export async function DELETE(request: Request, contexto: { params: Promise<{ id: string }> }) {
  const [{ id }, acceso] = await Promise.all([contexto.params, exigirAdminORevisor()]);

  if (!acceso.ok) {
    if (acceso.estado === 403) {
      auditarVentanaCarga(acceso.sesion, request, {
        accion: "VENTANA_CARGA_ELIMINADA",
        resultado: "RECHAZADO",
        motivo: "SIN_PERMISO",
        ventanaCargaId: id,
      });
    }

    return respuestaSinAcceso(acceso.estado);
  }

  const idValido = idVentanaCargaSchema.safeParse(id);

  if (!idValido.success) {
    return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
  }

  try {
    const resultado = await eliminarVentanaCarga(
      idValido.data,
      { id: acceso.sesion.sub, perfil: acceso.sesion.perfil },
      { repositorio: prismaVentanaCargaRepository },
    );

    if (!resultado.ok) {
      if (resultado.motivo === "SIN_PERMISO") {
        auditarVentanaCarga(acceso.sesion, request, {
          accion: "VENTANA_CARGA_ELIMINADA",
          resultado: "RECHAZADO",
          motivo: "SIN_PERMISO",
          ventanaCargaId: idValido.data,
        });
        return respuestaSinPermisoEliminar();
      }

      auditarVentanaCarga(acceso.sesion, request, {
        accion: "VENTANA_CARGA_ELIMINADA",
        resultado: "RECHAZADO",
        motivo: "NO_ENCONTRADO",
        ventanaCargaId: idValido.data,
      });
      return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
    }

    auditarVentanaCarga(acceso.sesion, request, {
      accion: "VENTANA_CARGA_ELIMINADA",
      resultado: "EXITO",
      ventanaCargaId: idValido.data,
      anio: resultado.anio,
      tipoEliminacionVentana: resultado.tipo,
    });

    return NextResponse.json({ tipo: resultado.tipo });
  } catch (error) {
    logger.error("Error al eliminar una ventana de carga", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
