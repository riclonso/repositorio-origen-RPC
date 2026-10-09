export type NotificacionRevision = {
  id: string;
  nombre: string;
  accion: "ARCHIVO_ENVIADO" | "REEMPLAZO_SOLICITADO";
  ventanaCargaId: string;
  fecha: string;
};

export type BandejaRevision = { notificaciones: NotificacionRevision[]; total: number };
export interface NotificacionRevisionRepository {
  listar(pagina: number): Promise<BandejaRevision>;
}
