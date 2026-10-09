import type { BandejaRevision, NotificacionRevision } from "../domain/NotificacionRevision";

// Una confirmación repetida o de un evento anterior no descuenta una nueva notificación.
export function registrarLecturaEnBandeja(bandeja: BandejaRevision, aviso: NotificacionRevision): BandejaRevision {
  const coincide = (actual: NotificacionRevision) => actual.id === aviso.id && actual.fecha === aviso.fecha;
  const pendiente = bandeja.notificaciones.some(actual => coincide(actual) && !actual.leido);
  if (!pendiente) return bandeja;
  return {
    ...bandeja,
    noLeidas: Math.max(0, bandeja.noLeidas - 1),
    notificaciones: bandeja.notificaciones.map(actual => coincide(actual) ? { ...actual, leido: true } : actual),
  };
}
