import {
  fechaHoraNotificacion,
  type CargaArchivoParaDescarga,
} from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import type { CargaArchivoRepository } from "@/modules/reporte-excel/domain/repositories/CargaArchivoRepository";
import type { AlmacenArchivosCarga, GeneradorDescargaCarga } from "@/modules/reporte-excel/application/ports";

export type ModoDescargaCarga = "notificacion" | "original";

export type ArchivoCargaDescargable = {
  flujo: ReadableStream<Uint8Array>;
  tipoContenido: string;
  // El nombre EXACTO con que se subió (también en la descarga con la columna agregada).
  nombreArchivo: string;
  // Solo en el original (byte a byte); una descarga generada no lo conoce de antemano.
  tamanoBytes?: number;
  // Si se agregó la columna "Fecha y hora de notificación".
  conFechaNotificacion: boolean;
};

export type ResultadoObtenerArchivoCarga =
  | { ok: true; archivo: ArchivoCargaDescargable }
  // No existe, no es del actor o su estado no permite descargarla: 404 uniforme.
  | { ok: false; motivo: "NO_ENCONTRADO" }
  // La carga existe pero su archivo ya no está en disco: también 404 hacia afuera, pero quien llama
  // lo registra en errores.txt (es una falla de operación, no de negocio).
  | { ok: false; motivo: "ARCHIVO_AUSENTE" };

function flujoDesdeBuffer(contenido: Buffer): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controlador) {
      controlador.enqueue(new Uint8Array(contenido));
      controlador.close();
    },
  });
}

async function abrirOriginal(
  carga: CargaArchivoParaDescarga,
  almacen: AlmacenArchivosCarga,
): Promise<ResultadoObtenerArchivoCarga> {
  if (carga.fuente.tipo === "bd") {
    return {
      ok: true,
      archivo: {
        flujo: flujoDesdeBuffer(carga.fuente.contenido),
        tipoContenido: carga.tipoContenidoArchivo,
        nombreArchivo: carga.nombreArchivoOriginal,
        tamanoBytes: carga.fuente.contenido.byteLength,
        conFechaNotificacion: false,
      },
    };
  }

  const abierto = await almacen.abrirLectura(carga.fuente.referencia);
  if (!abierto) return { ok: false, motivo: "ARCHIVO_AUSENTE" };

  return {
    ok: true,
    archivo: {
      flujo: abierto.flujo,
      tipoContenido: carga.tipoContenidoArchivo,
      nombreArchivo: carga.nombreArchivoOriginal,
      tamanoBytes: abierto.tamanoBytes,
      conFechaNotificacion: false,
    },
  };
}

// RF-38: descarga de una carga del notificador. `usuarioId` no nulo = el propio notificador (ownership en
// el `WHERE`, cualquier estado); `null` = ADMIN/REVISOR_REPOSITORIO (solo `APROBADA` o `PENDIENTE`
// finalizada). En modo `notificacion`, si la carga ya fue notificada (`fechaHoraNotificacion` no nula)
// se genera en streaming la copia con la columna agregada; si no, se entrega el original. En modo
// `original`, siempre el archivo tal como se subió. La referencia sale siempre de la base.
export async function obtenerArchivoCargaParaDescarga(
  // `solicitanteId`: quien descarga (la sesión), para que el generador limite a una por persona.
  entrada: { cargaId: string; usuarioId: string | null; modo: ModoDescargaCarga; solicitanteId?: string; signal?: AbortSignal },
  dependencias: {
    repositorio: CargaArchivoRepository;
    almacen: AlmacenArchivosCarga;
    generador: GeneradorDescargaCarga;
  },
): Promise<ResultadoObtenerArchivoCarga> {
  const carga =
    entrada.usuarioId === null
      ? await dependencias.repositorio.obtenerParaDescarga(entrada.cargaId)
      : await dependencias.repositorio.obtenerPropiaParaDescarga(entrada.cargaId, entrada.usuarioId);

  if (!carga) return { ok: false, motivo: "NO_ENCONTRADO" };

  const fecha = entrada.modo === "notificacion" ? fechaHoraNotificacion(carga) : null;
  if (fecha === null) return abrirOriginal(carga, dependencias.almacen);

  if (carga.fuente.tipo === "disco") {
    // Comprobación barata de que el archivo sigue en disco, para responder 404 (y no 500) si falta.
    const abierto = await dependencias.almacen.abrirLectura(carga.fuente.referencia);
    if (!abierto) return { ok: false, motivo: "ARCHIVO_AUSENTE" };
    await abierto.flujo.cancel().catch(() => undefined);
  }

  const generado = await dependencias.generador.generar({
    fuente: carga.fuente.tipo === "disco" ? { referencia: carga.fuente.referencia } : { contenido: carga.fuente.contenido },
    tipoContenido: carga.tipoContenidoArchivo,
    fechaNotificacion: fecha,
    solicitanteId: entrada.solicitanteId,
    signal: entrada.signal,
  });

  return {
    ok: true,
    archivo: {
      flujo: generado.flujo,
      tipoContenido: generado.tipoContenido,
      nombreArchivo: carga.nombreArchivoOriginal,
      conFechaNotificacion: true,
    },
  };
}
