import type {
  DatosEdicionFormatoExcel,
  DatosNuevoFormatoExcel,
  FormatoExcel,
  FormatoExcelResumen,
  PlantillaFormatoExcel,
} from "@/modules/formatos-excel/domain/entities/FormatoExcel";

export interface FormatoExcelRepository {
  listar(): Promise<FormatoExcelResumen[]>;
  // RF-14: si el usuario no tiene ese formato asignado y activo (asignación vigente y
  // `FormatoExcel.activo = true`), no puede subir un archivo contra él. Una sola consulta,
  // nunca dos llamadas separadas (asignación + estado) que dejen ventana de carrera.
  estaAsignadoYActivo(usuarioId: string, formatoExcelId: string): Promise<boolean>;
  // Formatos activos asignados a un usuario, para el selector de subida (RF-14). Vista liviana:
  // no trae columnas ni reglas, solo lo necesario para poblar un `<select>`.
  listarAsignadosAUsuario(usuarioId: string): Promise<FormatoExcelResumen[]>;
  obtenerPorId(id: string): Promise<FormatoExcel | null>;
  existeActivo(id: string): Promise<boolean>;
  // Resuelve en UNA sola consulta (`WHERE id IN (...) AND activo = true`) cuáles de los ids
  // recibidos corresponden a un formato existente y vigente. Evita el N+1 de comprobar cada id
  // por separado al validar el arreglo de formatos asignados a un usuario.
  obtenerActivosEntre(ids: string[]): Promise<string[]>;
  // Transaccional: crea el formato, sus columnas y sus reglas de validación en una sola
  // operación atómica.
  crear(datos: DatosNuevoFormatoExcel): Promise<FormatoExcel>;
  // Transaccional: reemplaza el set completo de columnas y de reglas de validación (borra las
  // anteriores, inserta las nuevas) en la misma operación que actualiza `nombre`/`descripcion`.
  actualizar(id: string, datos: DatosEdicionFormatoExcel): Promise<FormatoExcel>;
  cambiarEstado(id: string, activo: boolean): Promise<FormatoExcel>;
  buscarPorNombre(nombre: string): Promise<FormatoExcel | null>;
  // Única operación que trae el binario de la plantilla. La usa exclusivamente el endpoint de
  // descarga.
  obtenerPlantilla(id: string): Promise<PlantillaFormatoExcel | null>;
}
