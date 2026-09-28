import type { SeparadorCsv } from "@/modules/formatos-excel/domain/entities/FormatoExcel";

// Opciones de lectura de un CSV. `separadorCsv` se ignora al leer un `.xlsx`.
export type OpcionesLecturaArchivo = { separadorCsv: SeparadorCsv | null };

// Interfaz técnica del módulo. `application/` nunca importa `exceljs` directamente: solo depende
// de este puerto. Agnóstica de si la plantilla es `.xlsx` o `.csv`; esa decisión la toma la
// implementación de `infrastructure/` a partir del `tipoContenido` recibido.
export interface LectorPlantilla {
  leer(
    buffer: Buffer,
    tipoContenido: string,
    opciones: OpcionesLecturaArchivo,
  ): Promise<{ orden: number; nombre: string }[]>;
}
