import type { NotificacionRevision, NotificacionRevisionRepository } from "../domain/NotificacionRevision";

export const TAMANO_PAGINA_NOTIFICACIONES = 4;
export function listarNotificacionesRevision(pagina: number, repositorio: NotificacionRevisionRepository) {
  if (!Number.isSafeInteger(pagina) || pagina < 1 || pagina > 2500) {
    throw new Error("Página de notificaciones inválida");
  }
  return repositorio.listar(pagina);
}

export function paginarNotificaciones(avisos: NotificacionRevision[], pagina: number) {
  const ordenadas = [...avisos].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id));
  const inicio = (pagina - 1) * TAMANO_PAGINA_NOTIFICACIONES;
  return ordenadas.slice(inicio, inicio + TAMANO_PAGINA_NOTIFICACIONES);
}
