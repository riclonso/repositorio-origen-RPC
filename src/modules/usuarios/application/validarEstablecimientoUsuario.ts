import type { EstablecimientoRepository } from "@/modules/establecimiento/domain/repositories/EstablecimientoRepository";
import { perfilExigeEstablecimiento } from "@/modules/perfiles/domain/entities/Perfil";

export type MotivoEstablecimientoRechazado = "ESTABLECIMIENTO_REQUERIDO" | "ESTABLECIMIENTO_INVALIDO";

// RF-30, compartida por el alta y la edición. Vive en `application/` (y no solo en el esquema Zod)
// para que no se salte llamando a la API con un cuerpo armado a mano:
//  - NOTIFICADOR_RPC y BIOESTADISTICA (RF-37) deben pertenecer a un establecimiento
//    (`perfilExigeEstablecimiento`); para el resto de los perfiles es opcional.
//  - El establecimiento indicado debe existir y estar activo, SALVO que sea el que la persona ya
//    tiene (`establecimientoActualId`): conservarlo siempre es válido aunque haya sido dado de baja,
//    mismo criterio que `conservaSuPerfil` en `ActualizarUsuario`. En el alta no hay actual (`null`).
// Devuelve el motivo del rechazo o `null` si la combinación es válida.
export async function validarEstablecimientoUsuario(
  perfilCodigo: string,
  establecimientoId: string | null,
  establecimientoActualId: string | null,
  repositorioEstablecimientos: EstablecimientoRepository,
): Promise<MotivoEstablecimientoRechazado | null> {
  if (establecimientoId === null) {
    return perfilExigeEstablecimiento(perfilCodigo) ? "ESTABLECIMIENTO_REQUERIDO" : null;
  }

  if (establecimientoId === establecimientoActualId) {
    return null;
  }

  return (await repositorioEstablecimientos.existeActivo(establecimientoId))
    ? null
    : "ESTABLECIMIENTO_INVALIDO";
}
