// node --import tsx tests/descarga-xlsx-grande.manual.ts /ruta/al/archivo.xlsx
// Consume y descarta la salida: nunca escribe una copia con datos clínicos en disco.
import { performance } from "node:perf_hooks";
import { generarXlsxGrande } from "../src/modules/reporte-excel/infrastructure/generacion-excel/AnexarFechaXlsxGrande";

async function main() {
  const ruta = process.argv[2];
  if (!ruta) throw new Error("Falta la ruta de entrada");
  const inicio = performance.now();
  const flujo = await generarXlsxGrande({ ruta }, new Date("2026-10-08T19:20:00Z"), () => "Fecha y hora de notificación");
  if (!flujo) throw new Error("El archivo no aplica al camino rápido");
  const lector = flujo.getReader();
  let bytes = 0;
  let maximoRss = 0;
  let primerByte = 0;
  let ultimoReporte = inicio;
  for (;;) {
    const parte = await lector.read();
    if (parte.done) break;
    if (!bytes) primerByte = performance.now() - inicio;
    bytes += parte.value.byteLength;
    maximoRss = Math.max(maximoRss, process.memoryUsage().rss);
    if (performance.now() - ultimoReporte > 15_000) {
      console.log(JSON.stringify({ segundos: Math.round((performance.now() - inicio) / 1000), salidaMB: Math.round(bytes / 1024 ** 2) }));
      ultimoReporte = performance.now();
    }
  }
  console.log(JSON.stringify({ primerByteMs: Math.round(primerByte), segundos: Math.round((performance.now() - inicio) / 1000), salidaBytes: bytes, maximoRssMB: Math.round(maximoRss / 1024 ** 2) }));
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
