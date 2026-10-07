import type { CargaBioestadisticaRepository } from "@/modules/bioestadistica/domain/repositories/CargaBioestadisticaRepository";
import type { AlmacenArchivos, ArchivoAbierto } from "@/modules/bioestadistica/application/ports";

export type ArchivoParaDescarga = ArchivoAbierto & {
  nombreArchivoOriginal: string;
  tipoContenidoArchivo: string;
};

// RF-37: abre en streaming el archivo original de una carga ACTIVA o REEMPLAZADA. Con `usuarioId`
// (área Bioestadística) exige que sea propia, en el `WHERE`; sin él (ADMIN y REVISOR_REPOSITORIO)
// cualquiera. `null` = 404 uniforme (no existe, es ajena, no está en un estado descargable o su
// archivo ya no está en disco). La referencia sale siempre de la base, nunca del cliente.
export async function obtenerArchivoCargaBioestadistica(
  entrada: { cargaId: string; usuarioId: string | null },
  dependencias: { repositorio: CargaBioestadisticaRepository; almacen: AlmacenArchivos },
): Promise<ArchivoParaDescarga | null> {
  const archivo =
    entrada.usuarioId === null
      ? await dependencias.repositorio.obtenerArchivo(entrada.cargaId)
      : await dependencias.repositorio.obtenerArchivoPropio(entrada.cargaId, entrada.usuarioId);

  if (!archivo) return null;

  const abierto = await dependencias.almacen.abrirLectura(archivo.referenciaArchivo);
  if (!abierto) return null;

  return {
    ...abierto,
    nombreArchivoOriginal: archivo.nombreArchivoOriginal,
    tipoContenidoArchivo: archivo.tipoContenidoArchivo,
  };
}
