import { logger } from "@/infrastructure/logging/logger";
import { detalleErrorSeguro } from "@/infrastructure/logging/detalleErrorSeguro";
import { obtenerReglasLlenadoParaNotificador } from "@/modules/formatos-excel/application/use-cases/ObtenerReglasLlenadoParaNotificador";
import {
  MENSAJE_ERROR_INTERNO,
  exigirNotificador,
  idRutaSchema,
  respuestaError,
  respuestaSinAcceso,
} from "@/app/api/_lib/http";
import { dependenciasLecturaReglas, respuestaDescargaReglas } from "@/app/api/formatos-excel/_lib/reglasLlenado";
import { autorizadorVentanaNotificador } from "@/app/notificador/_lib/tarjetasNotificador";

const MENSAJE_NO_DISPONIBLE = "Las reglas para llenado de archivo no están disponibles";

// RF-45: descarga de las reglas de llenado desde una tarjeta de `/notificador`. Solo NOTIFICADOR_RPC
// (ADMIN y REVISOR reciben 403: usan la ruta administrativa). Se autoriza con EXACTAMENTE el mismo
// predicado que da la tarjeta (`resolverTarjetasNotificador`): ventana ajena, sin publicar, archivada,
// sin tarjeta o formato sin archivo responden el mismo 404. No se audita.
export async function GET(_request: Request, contexto: { params: Promise<{ ventanaId: string }> }) {
  const [{ ventanaId }, acceso] = await Promise.all([contexto.params, exigirNotificador()]);

  if (!acceso.ok) {
    return respuestaSinAcceso(acceso.estado);
  }

  const idValido = idRutaSchema.safeParse(ventanaId);

  if (!idValido.success) {
    return respuestaError(MENSAJE_NO_DISPONIBLE, 404, { codigo: "NO_ENCONTRADO" });
  }

  try {
    const archivo = await obtenerReglasLlenadoParaNotificador(acceso.sesion.sub, idValido.data, {
      ...dependenciasLecturaReglas,
      autorizador: autorizadorVentanaNotificador,
    });

    if (!archivo) {
      return respuestaError(MENSAJE_NO_DISPONIBLE, 404, { codigo: "NO_ENCONTRADO" });
    }

    return respuestaDescargaReglas(archivo);
  } catch (error) {
    logger.error("Error al descargar las reglas de llenado desde el panel del notificador", {
      ventanaCargaId: idValido.data,
      ...detalleErrorSeguro(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
