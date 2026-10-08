// Declaración mínima de utilidades INTERNAS de exceljs 4.4.0 (versión exacta fijada en
// package.json), solo de lo que usa `src/infrastructure/hojas-calculo/leerHojaStreamingExcelJs.ts`
// (RF-38) para interpretar las celdas exactamente como lo hace `xlsx.load` en memoria: el mismo
// analizador SAX y las mismas conversiones de fecha y de entidades. `tests/lector-xlsx-streaming.unit.ts`
// falla si una actualización cambia este contrato.
declare module "exceljs/lib/utils/parse-sax" {
  export type EventoSax =
    | { eventType: "opentag"; value: { name: string; attributes: Record<string, string> } }
    | { eventType: "text"; value: string }
    | { eventType: "closetag"; value: { name: string } };

  export default function parseSax(iterable: AsyncIterable<string | Uint8Array>): AsyncGenerator<EventoSax[]>;
}

declare module "exceljs/lib/utils/utils" {
  export function excelToDate(valor: number, date1904?: boolean): Date;
  export function isDateFmt(formato: string | undefined): boolean;
  export function xmlDecode(texto: string): string;
}

// Objeto con caché interno (`this._hash`): sus métodos deben invocarse sobre el objeto, nunca
// desestructurados.
declare module "exceljs/lib/utils/col-cache" {
  type Direccion = { address: string; col: number; row: number; $col$row: string };
  type Rango = { top: number; left: number; bottom: number; right: number; tl: string; br: string; dimensions: string };

  const colCache: {
    decodeAddress(direccion: string): Direccion;
    decode(referencia: string): Rango | Direccion;
  };
  export default colCache;
}
