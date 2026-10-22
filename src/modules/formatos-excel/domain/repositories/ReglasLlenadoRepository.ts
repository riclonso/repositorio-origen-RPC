import type {
  DatosGuardarReglasLlenado,
  ReglasLlenadoFormato,
  ReglasLlenadoVista,
} from "@/modules/formatos-excel/domain/entities/ReglasLlenadoFormato";

export type ResultadoGuardarReglasLlenado =
  | { ok: true; actual: ReglasLlenadoFormato; anterior: ReglasLlenadoFormato | null }
  | { ok: false; motivo: "FORMATO_NO_ENCONTRADO" };

export interface ReglasLlenadoRepository {
  formatoExiste(formatoExcelId: string): Promise<boolean>;
  obtenerPorFormato(formatoExcelId: string): Promise<ReglasLlenadoFormato | null>;
  obtenerVistaPorFormato(formatoExcelId: string): Promise<ReglasLlenadoVista | null>;
  // Crea o reemplaza (UPDATE) en una transacción que bloquea la fila del formato, para que dos subidas
  // simultáneas no dejen un archivo huérfano. Devuelve la fila anterior (para borrar su archivo tras
  // el commit) o `FORMATO_NO_ENCONTRADO` si el formato ya no existe.
  guardar(datos: DatosGuardarReglasLlenado): Promise<ResultadoGuardarReglasLlenado>;
  // Elimina la fila y la devuelve (para borrar su archivo); `null` si no había.
  eliminar(formatoExcelId: string): Promise<ReglasLlenadoFormato | null>;
}
