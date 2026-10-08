import type { ManifiestoSubida } from "../schemas/subida.schema";
export interface RepositorioSesionesSubida {
  guardar(manifiesto: ManifiestoSubida): Promise<void>;
  concatenar(manifiesto: ManifiestoSubida): ReadableStream<Uint8Array>;
  eliminarPartes(id: string): Promise<void>;
}
export interface ReceptorArchivoCompleto {
  recibir(manifiesto: ManifiestoSubida, cuerpo: ReadableStream<Uint8Array>): Promise<Response>;
  recuperar(manifiesto: ManifiestoSubida): Promise<Response | null>;
}
