declare module "archiver" {
  import { Transform, type Readable } from "node:stream";
  interface ArchivoZip extends Transform {
    append(entrada: Readable, opciones: { name: string }): ArchivoZip;
    finalize(): Promise<void>;
    abort(): ArchivoZip;
  }
  export default function archiver(formato: "zip", opciones: { zlib: { level: number } }): ArchivoZip;
}
