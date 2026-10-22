// RF-45: archivo con las reglas para llenar el archivo a notificar. Uno por formato (1:0..1): sirve
// para todas las ventanas del formato y reemplazarlo afecta a todas. Sin historial de versiones.

export const EXTENSIONES_REGLAS_LLENADO = ["docx", "doc", "xlsx", "xls", "txt"] as const;

export type ExtensionReglasLlenado = (typeof EXTENSIONES_REGLAS_LLENADO)[number];

export const TAMANO_MAXIMO_REGLAS_LLENADO = 20 * 1024 * 1024;

// El tipo de contenido se deriva SIEMPRE de la extensión ya validada contra el contenido real, nunca
// del `Content-Type` que declara el cliente.
const TIPOS_CONTENIDO: Record<ExtensionReglasLlenado, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  txt: "text/plain; charset=utf-8",
};

export function tipoContenidoReglasLlenado(extension: ExtensionReglasLlenado): string {
  return TIPOS_CONTENIDO[extension];
}

export function esExtensionReglasLlenado(valor: string): valor is ExtensionReglasLlenado {
  return (EXTENSIONES_REGLAS_LLENADO as readonly string[]).includes(valor);
}

// Extensión (en minúsculas) del nombre original, solo si está en la lista blanca.
export function extensionReglasLlenadoDesdeNombre(nombreArchivo: string): ExtensionReglasLlenado | null {
  const coincidencia = /\.([a-z0-9]+)$/i.exec(nombreArchivo.trim());
  const extension = coincidencia?.[1]?.toLowerCase() ?? "";
  return esExtensionReglasLlenado(extension) ? extension : null;
}

export type ReglasLlenadoFormato = {
  id: string;
  formatoExcelId: string;
  // Solo para mostrar y para el nombre de la descarga; nunca forma parte de la ruta en disco.
  nombreArchivoOriginal: string;
  extension: ExtensionReglasLlenado;
  tipoContenido: string;
  // Referencia relativa generada por el servidor: `<formatoExcelId>/<uuid>.<extension>`.
  rutaArchivo: string;
  tamanoBytes: number;
  sha256: string;
  subidoPorId: string;
  subidoEn: Date;
};

// Vista administrativa (ADMIN/REVISOR): sin ruta ni hash, con el nombre de quien subió.
export type ReglasLlenadoVista = {
  formatoExcelId: string;
  nombreArchivoOriginal: string;
  extension: ExtensionReglasLlenado;
  tamanoBytes: number;
  subidoEn: Date;
  subidoPorNombre: string;
};

export type DatosGuardarReglasLlenado = {
  formatoExcelId: string;
  nombreArchivoOriginal: string;
  extension: ExtensionReglasLlenado;
  tipoContenido: string;
  rutaArchivo: string;
  tamanoBytes: number;
  sha256: string;
  subidoPorId: string;
  subidoEn: Date;
};
