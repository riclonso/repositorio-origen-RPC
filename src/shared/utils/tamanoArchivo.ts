const BYTES_POR_KB = 1024;
const BYTES_POR_MB = 1024 * 1024;

// Tamaño legible de un archivo ("850 KB", "12.4 MB"). Compartido por el cargador de archivos y los
// listados de archivos de Bioestadística (RF-37). Función pura.
export function formatearTamanoArchivo(bytes: number): string {
  if (bytes < BYTES_POR_MB) return `${Math.max(1, Math.round(bytes / BYTES_POR_KB))} KB`;
  return `${(bytes / BYTES_POR_MB).toFixed(1)} MB`;
}
