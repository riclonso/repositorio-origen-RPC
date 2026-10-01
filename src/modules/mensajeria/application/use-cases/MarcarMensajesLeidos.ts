import { ladoContrario, type LadoMensaje } from "@/modules/mensajeria/domain/entities/MensajeCarga";
import type { MensajeCargaRepository } from "@/modules/mensajeria/domain/repositories/MensajeCargaRepository";

// Marca como leídos los mensajes del lado CONTRARIO a quien lee, solo hasta `hasta` (fecha del
// último mensaje que el cliente realmente mostró): un mensaje que llegue entre la lectura del hilo
// y esta marca sigue sin leer. Idempotente. Del lado revisor la bandeja es compartida: lo que lee
// un revisor queda leído para todos.
export async function marcarMensajesLeidos(
  datos: { notificadorId: string; ventanaCargaId: string; ladoLector: LadoMensaje; hasta: Date },
  dependencias: { repositorio: MensajeCargaRepository },
): Promise<number> {
  return dependencias.repositorio.marcarLeidos({
    notificadorId: datos.notificadorId,
    ventanaCargaId: datos.ventanaCargaId,
    ladoAutor: ladoContrario(datos.ladoLector),
    hasta: datos.hasta,
    leidoEn: new Date(),
  });
}
