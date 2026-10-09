export type NotificacionRevision = {
  id: string;
  nombre: string;
  accion: "ARCHIVO_ENVIADO" | "REEMPLAZO_SOLICITADO";
  ventanaCargaId: string;
  fecha: string;
  leido: boolean;
};

export type BandejaRevision = { notificaciones: NotificacionRevision[]; total: number; noLeidas: number };
export interface NotificacionRevisionRepository {
  listar(pagina: number, usuarioId: string): Promise<BandejaRevision>;
  marcarLeida(usuarioId: string, avisoId: string, fecha: Date): Promise<boolean>;
}
