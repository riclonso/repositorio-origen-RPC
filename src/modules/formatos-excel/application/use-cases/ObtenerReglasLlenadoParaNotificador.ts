import type {
  AlmacenReglasLlenado,
  ArchivoReglasAbierto,
  AutorizadorVentanaNotificador,
} from "@/modules/formatos-excel/application/ports";
import type {
  ReglasLlenadoFormato,
  ReglasLlenadoVista,
} from "@/modules/formatos-excel/domain/entities/ReglasLlenadoFormato";
import type { ReglasLlenadoRepository } from "@/modules/formatos-excel/domain/repositories/ReglasLlenadoRepository";

export type ArchivoReglasLlenado = { reglas: ReglasLlenadoFormato; archivo: ArchivoReglasAbierto };

type DependenciasLectura = { repositorio: ReglasLlenadoRepository; almacen: AlmacenReglasLlenado };

// Datos para la sección de la pantalla de edición del formato (ADMIN/REVISOR).
export function obtenerVistaReglasLlenado(
  formatoExcelId: string,
  dependencias: { repositorio: ReglasLlenadoRepository },
): Promise<ReglasLlenadoVista | null> {
  return dependencias.repositorio.obtenerVistaPorFormato(formatoExcelId);
}

// Descarga administrativa (ADMIN/REVISOR) y base de la del notificador: `null` si el formato no tiene
// archivo de reglas o el archivo ya no está en disco.
export async function abrirReglasLlenado(
  formatoExcelId: string,
  dependencias: DependenciasLectura,
): Promise<ArchivoReglasLlenado | null> {
  const reglas = await dependencias.repositorio.obtenerPorFormato(formatoExcelId);
  if (!reglas) return null;

  const archivo = await dependencias.almacen.abrirLectura(reglas.rutaArchivo);
  return archivo ? { reglas, archivo } : null;
}

// RF-45: el notificador solo descarga las reglas de una ventana que tiene tarjeta en su panel
// (exactamente el mismo predicado que `/notificador`). Cualquier otro caso es `null` (404), sin
// distinguir "ventana ajena" de "sin archivo".
export async function obtenerReglasLlenadoParaNotificador(
  usuarioId: string,
  ventanaCargaId: string,
  dependencias: DependenciasLectura & { autorizador: AutorizadorVentanaNotificador },
): Promise<ArchivoReglasLlenado | null> {
  const formatoExcelId = await dependencias.autorizador.formatoDeVentanaConTarjeta(usuarioId, ventanaCargaId);
  if (!formatoExcelId) return null;

  return abrirReglasLlenado(formatoExcelId, dependencias);
}
