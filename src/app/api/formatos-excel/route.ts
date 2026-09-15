import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { listarFormatosExcel } from "@/modules/formatos-excel/application/use-cases/ListarFormatosExcel";
import { crearFormatoExcel } from "@/modules/formatos-excel/application/use-cases/CrearFormatoExcel";
import { prismaFormatoExcelRepository } from "@/modules/formatos-excel/infrastructure/repositories/PrismaFormatoExcelRepository";
import { auditarFormatoExcel } from "@/modules/formatos-excel/infrastructure/auditoria/auditarFormatoExcel";
import { crearFormatoExcelSchema } from "@/modules/formatos-excel/schemas/formato-excel.schema";
import {
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_INTERNO,
  TAMANO_MAXIMO_PLANTILLA,
  aFormatoExcelDTO,
  aFormatoExcelResumenDTO,
  exigirAdminORevisor,
  respuestaArchivoInvalido,
  respuestaDuplicado,
  respuestaError,
  respuestaSinAcceso,
  tipoArchivoDesdeTipoContenido,
  tipoContenidoDesdeArchivo,
  tipoContenidoDesdeNombre,
} from "@/app/api/formatos-excel/_lib/http";

// Las lecturas no se auditan: llenarían el archivo sin aportar trazabilidad de cambios (mismo
// criterio que el mantenedor de usuarios).
export async function GET() {
  const acceso = await exigirAdminORevisor();

  if (!acceso.ok) {
    return respuestaSinAcceso(acceso.estado);
  }

  try {
    const formatos = await listarFormatosExcel({ repositorio: prismaFormatoExcelRepository });
    return NextResponse.json({ datos: formatos.map(aFormatoExcelResumenDTO) });
  } catch (error) {
    logger.error("Error al listar formatos de archivo", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}

// La plantilla se reenvía completa en este POST (no hay estado de sesión entre los pasos del
// asistente): `archivo` es el binario, `nombre`/`descripcion`/`columnas` son el resto del
// formulario, `columnas` viaja como JSON dentro del campo multipart.
export async function POST(request: Request) {
  const acceso = await exigirAdminORevisor();

  if (!acceso.ok) {
    if (acceso.estado === 403) {
      auditarFormatoExcel(acceso.sesion, request, {
        accion: "FORMATO_EXCEL_CREADO",
        resultado: "RECHAZADO",
        motivo: "SIN_PERMISO",
      });
    }

    return respuestaSinAcceso(acceso.estado);
  }

  const formData = await request.formData().catch(() => null);
  const archivo = formData?.get("archivo");
  const nombre = formData?.get("nombre");
  const descripcion = formData?.get("descripcion");
  const columnasBruto = formData?.get("columnas");
  const reglasValidacionBruto = formData?.get("reglasValidacion");

  if (!(archivo instanceof File)) {
    auditarFormatoExcel(acceso.sesion, request, {
      accion: "FORMATO_EXCEL_CREADO",
      resultado: "RECHAZADO",
      motivo: "ARCHIVO_INVALIDO",
    });
    return respuestaArchivoInvalido("Selecciona un archivo de plantilla");
  }

  // Primer filtro, barato: rechaza una extensión no soportada sin leer el archivo completo.
  if (!tipoContenidoDesdeNombre(archivo.name)) {
    auditarFormatoExcel(acceso.sesion, request, {
      accion: "FORMATO_EXCEL_CREADO",
      resultado: "RECHAZADO",
      motivo: "ARCHIVO_INVALIDO",
    });
    return respuestaArchivoInvalido("El archivo debe tener extensión .xlsx o .csv");
  }

  if (archivo.size > TAMANO_MAXIMO_PLANTILLA) {
    auditarFormatoExcel(acceso.sesion, request, {
      accion: "FORMATO_EXCEL_CREADO",
      resultado: "RECHAZADO",
      motivo: "ARCHIVO_INVALIDO",
    });
    return respuestaArchivoInvalido("El archivo no puede superar los 10 MB");
  }

  let columnasJson: unknown = null;

  if (typeof columnasBruto === "string") {
    try {
      columnasJson = JSON.parse(columnasBruto);
    } catch {
      columnasJson = null;
    }
  }

  // `undefined` (y no `null`) para que, si el campo no viaja en el FormData, el `.default([])`
  // del esquema aplique en vez de fallar la validación.
  let reglasValidacionJson: unknown = undefined;

  if (typeof reglasValidacionBruto === "string") {
    try {
      reglasValidacionJson = JSON.parse(reglasValidacionBruto);
    } catch {
      reglasValidacionJson = null;
    }
  }

  const datos = crearFormatoExcelSchema.safeParse({
    nombre: typeof nombre === "string" ? nombre : "",
    descripcion: typeof descripcion === "string" ? descripcion : undefined,
    columnas: columnasJson,
    reglasValidacion: reglasValidacionJson,
  });

  if (!datos.success) {
    return respuestaError(datos.error.issues[0]?.message ?? MENSAJE_DATOS_INVALIDOS, 400);
  }

  try {
    const buffer = Buffer.from(await archivo.arrayBuffer());

    if (buffer.byteLength > TAMANO_MAXIMO_PLANTILLA) {
      auditarFormatoExcel(acceso.sesion, request, {
        accion: "FORMATO_EXCEL_CREADO",
        resultado: "RECHAZADO",
        motivo: "ARCHIVO_INVALIDO",
      });
      return respuestaArchivoInvalido("El archivo no puede superar los 10 MB");
    }

    // Validación de fondo: la firma real de los primeros bytes, no solo la extensión del
    // nombre (trivial de falsificar renombrando el archivo). El valor persistido en
    // `tipoContenidoPlantilla` —el mismo que luego se sirve tal cual como `Content-Type` en la
    // descarga— sale de aquí, nunca de lo que declaró el cliente.
    const tipoContenido = tipoContenidoDesdeArchivo(archivo.name, buffer);

    if (!tipoContenido) {
      auditarFormatoExcel(acceso.sesion, request, {
        accion: "FORMATO_EXCEL_CREADO",
        resultado: "RECHAZADO",
        motivo: "ARCHIVO_INVALIDO",
      });
      return respuestaArchivoInvalido("El contenido del archivo no corresponde a su extensión");
    }

    const resultado = await crearFormatoExcel(
      {
        nombre: datos.data.nombre,
        descripcion: datos.data.descripcion,
        nombreArchivoPlantilla: archivo.name,
        tipoContenidoPlantilla: tipoContenido,
        tipoArchivo: tipoArchivoDesdeTipoContenido(tipoContenido),
        contenidoPlantilla: buffer,
        columnas: datos.data.columnas,
        reglasValidacion: datos.data.reglasValidacion,
      },
      { repositorio: prismaFormatoExcelRepository },
    );

    if (!resultado.ok) {
      auditarFormatoExcel(acceso.sesion, request, {
        accion: "FORMATO_EXCEL_CREADO",
        resultado: "RECHAZADO",
        motivo: "DUPLICADO",
        formatoExcelNombre: resultado.nombre,
      });
      return respuestaDuplicado(resultado.nombre);
    }

    auditarFormatoExcel(acceso.sesion, request, {
      accion: "FORMATO_EXCEL_CREADO",
      resultado: "EXITO",
      formatoExcelId: resultado.formato.id,
      formatoExcelNombre: resultado.formato.nombre,
    });

    return NextResponse.json({ formato: aFormatoExcelDTO(resultado.formato) }, { status: 201 });
  } catch (error) {
    logger.error("Error al crear un formato de archivo", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
