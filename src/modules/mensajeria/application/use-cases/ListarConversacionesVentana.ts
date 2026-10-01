import type { ConversacionVentanaResumen } from "@/modules/mensajeria/domain/entities/MensajeCarga";
import type { MensajeCargaRepository } from "@/modules/mensajeria/domain/repositories/MensajeCargaRepository";

// Columna izquierda del modal del revisor: notificadores con conversación en una ventana, primero
// los que tienen respuestas sin leer y luego por el mensaje más reciente. Una ventana inexistente
// devuelve una lista vacía (sin distinguirla de una ventana sin mensajes).
export async function listarConversacionesVentana(
  ventanaCargaId: string,
  dependencias: { repositorio: MensajeCargaRepository },
): Promise<ConversacionVentanaResumen[]> {
  const conversaciones = await dependencias.repositorio.listarConversacionesVentana(ventanaCargaId);

  return [...conversaciones].sort((primera, segunda) => {
    const primeraConNoLeidos = primera.noLeidos > 0;
    const segundaConNoLeidos = segunda.noLeidos > 0;

    if (primeraConNoLeidos !== segundaConNoLeidos) {
      return primeraConNoLeidos ? -1 : 1;
    }

    return segunda.ultimoMensajeEn.getTime() - primera.ultimoMensajeEn.getTime();
  });
}
