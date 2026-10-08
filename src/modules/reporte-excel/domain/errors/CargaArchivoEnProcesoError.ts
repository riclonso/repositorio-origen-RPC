// RF-38: el índice único parcial `carga_archivo_procesando_key` rechazó crear la carga: ya hay otro
// archivo validándose para el mismo notificador y ventana (dos subidas simultáneas).
export class CargaArchivoEnProcesoError extends Error {
  constructor() {
    super("Ya hay un archivo validándose para esta combinación");
    this.name = "CargaArchivoEnProcesoError";
  }
}
