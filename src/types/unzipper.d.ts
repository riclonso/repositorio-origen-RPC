// Declaración mínima de `unzipper` (sin tipos publicados), solo de lo que usa
// `src/infrastructure/hojas-calculo/leerHojaStreamingExcelJs.ts` (RF-37): abrir un ZIP por su
// directorio central con una fuente propia y leer entradas sueltas en streaming.
declare module "unzipper" {
  import type { Readable } from "node:stream";

  export type FuenteZip = {
    stream(offset: number, length?: number): Readable;
    size(): Promise<number>;
  };

  export type EntradaZip = {
    path: string;
    type: "File" | "Directory";
    uncompressedSize: number;
    stream(password?: string): Readable;
  };

  export type DirectorioZip = { files: EntradaZip[] };

  export const Open: {
    custom(fuente: FuenteZip): Promise<DirectorioZip>;
  };
}
