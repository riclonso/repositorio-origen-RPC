import { ErrorSubida } from "../domain/ErrorSubida";
import { TAMANO_PARTE, type ManifiestoSubida } from "../schemas/subida.schema";
import type { ReceptorArchivoCompleto, RepositorioSesionesSubida } from "./ports";
export async function completarSubida(manifiesto: ManifiestoSubida, repositorio: RepositorioSesionesSubida, receptor: ReceptorArchivoCompleto): Promise<Response> {
  if (manifiesto.resultado) return Response.json(manifiesto.resultado.cuerpo, { status: manifiesto.resultado.estado });
  if (manifiesto.partes.length !== Math.ceil(manifiesto.tamanoBytes / TAMANO_PARTE)) throw new ErrorSubida("PARTES_INCOMPLETAS",409,"Faltan partes del archivo");
  // El ID reservado permite recuperar la respuesta si el proceso terminó entre crear la carga y guardar el manifiesto.
  const recuperada = await receptor.recuperar(manifiesto);
  manifiesto.estado = "COMPLETANDO"; await repositorio.guardar(manifiesto);
  try {
    const respuesta = recuperada ?? await receptor.recibir(manifiesto, repositorio.concatenar(manifiesto));
    const cuerpo: unknown = await respuesta.json();
    if (respuesta.status >= 500) { manifiesto.estado = "RECEPCION"; await repositorio.guardar(manifiesto); return Response.json(cuerpo,{status:respuesta.status}); }
    manifiesto.resultado = { estado: respuesta.status, cuerpo }; manifiesto.estado = "COMPLETADA";
    await repositorio.guardar(manifiesto); await repositorio.eliminarPartes(manifiesto.id);
    return Response.json(cuerpo, { status: respuesta.status });
  } catch (error) { manifiesto.estado = "RECEPCION"; await repositorio.guardar(manifiesto); throw error; }
}
