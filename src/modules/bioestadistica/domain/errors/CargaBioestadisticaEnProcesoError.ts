// RF-37: el índice único parcial `carga_bioestadistica_procesando_key` rechazó crear la cabecera:
// ya hay otro archivo en procesamiento para el mismo usuario, año y tipo.
export class CargaBioestadisticaEnProcesoError extends Error {
  constructor() {
    super("Ya hay un archivo en procesamiento para este año y tipo");
    this.name = "CargaBioestadisticaEnProcesoError";
  }
}
