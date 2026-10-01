import {
  ladoContrario,
  type EtiquetaVentanaMensajes,
  type ResumenMensajesInicio,
} from "@/modules/mensajeria/domain/entities/MensajeCarga";
import type { MensajeCargaRepository } from "@/modules/mensajeria/domain/repositories/MensajeCargaRepository";

// Quién consulta el resumen: el equipo revisor (bandeja compartida, todas las ventanas) o un
// notificador concreto (solo su propio hilo).
export type LectorResumenMensajes = { lado: "REVISOR" } | { lado: "NOTIFICADOR"; notificadorId: string };

// Avisos de los inicios (`/revisor` y `/notificador`), con dos `groupBy` en el repositorio, nunca
// una consulta por tarjeta. Con `idsVentanasConTarjeta`, el conteo de totales se acota a esas
// ventanas; el de no leídos siempre abarca todas (lo usa el banner de ventanas sin tarjeta).
export async function obtenerResumenMensajesPorVentana(
  lector: LectorResumenMensajes,
  dependencias: { repositorio: MensajeCargaRepository },
  idsVentanasConTarjeta?: string[],
): Promise<ResumenMensajesInicio> {
  return dependencias.repositorio.resumirPorVentana({
    notificadorId: lector.lado === "NOTIFICADOR" ? lector.notificadorId : undefined,
    ladoNoLeido: ladoContrario(lector.lado),
    ventanaCargaIdsConTarjeta: idsVentanasConTarjeta,
  });
}

// Ventanas con mensajes sin leer que NO tienen tarjeta en el inicio (cerradas o no listadas), para
// el banner "Tienes mensajes sin leer en: …". Una sola consulta para todas las etiquetas.
export async function listarVentanasConNoLeidosSinTarjeta(
  noLeidosPorVentana: Record<string, number>,
  idsVentanasConTarjeta: string[],
  dependencias: { repositorio: MensajeCargaRepository },
): Promise<EtiquetaVentanaMensajes[]> {
  const conTarjeta = new Set(idsVentanasConTarjeta);
  const idsSinTarjeta = Object.entries(noLeidosPorVentana)
    .filter(([ventanaCargaId, noLeidos]) => noLeidos > 0 && !conTarjeta.has(ventanaCargaId))
    .map(([ventanaCargaId]) => ventanaCargaId);

  if (idsSinTarjeta.length === 0) {
    return [];
  }

  return dependencias.repositorio.obtenerEtiquetasVentanas(idsSinTarjeta);
}
