// Interfaz técnica del módulo. `application/` nunca importa `exceljs` directamente: solo depende
// de este puerto. Agnóstica de si la plantilla es `.xlsx` o `.csv`; esa decisión la toma la
// implementación de `infrastructure/` a partir del `tipoContenido` recibido.
export interface LectorPlantilla {
  leer(buffer: Buffer, tipoContenido: string): Promise<{ orden: number; nombre: string }[]>;
}
