import type {
  AlmacenReglasLlenado,
  DetectorTipoDocumento,
  RegistrarFalloNoFatal,
} from "@/modules/formatos-excel/application/ports";
import {
  TAMANO_MAXIMO_REGLAS_LLENADO,
  extensionReglasLlenadoDesdeNombre,
  tipoContenidoReglasLlenado,
  type ExtensionReglasLlenado,
  type ReglasLlenadoFormato,
} from "@/modules/formatos-excel/domain/entities/ReglasLlenadoFormato";
import type { ReglasLlenadoRepository } from "@/modules/formatos-excel/domain/repositories/ReglasLlenadoRepository";

export type EntradaSubirReglasLlenado = {
  formatoExcelId: string;
  nombreArchivoOriginal: string;
  // `null` si el cliente no declaró `Content-Length` (o no es un entero no negativo).
  tamanoDeclarado: number | null;
  cuerpo: ReadableStream<Uint8Array> | null;
  subidoPorId: string;
  ahora: Date;
};

export type DependenciasSubirReglasLlenado = {
  repositorio: ReglasLlenadoRepository;
  almacen: AlmacenReglasLlenado;
  detector: DetectorTipoDocumento;
  generarId: () => string;
  registrarFallo: RegistrarFalloNoFatal;
};

export type MotivoRechazoSubidaReglas =
  | "FORMATO_NO_ENCONTRADO"
  | "SIN_LONGITUD"
  | "EXCEDE_TAMANO"
  | "TIPO_INVALIDO"
  | "VACIO";

export type ResultadoSubirReglasLlenado =
  | { ok: true; reglas: ReglasLlenadoFormato; reemplazo: boolean }
  | { ok: false; motivo: MotivoRechazoSubidaReglas; extension?: ExtensionReglasLlenado };

// Crea o reemplaza el archivo de reglas de llenado de un formato. Todo lo barato (formato, tamaño
// declarado, extensión) se valida ANTES de leer el cuerpo. El reemplazo es: temporal → ruta nueva →
// UPDATE en transacción → tras el commit se borra la ruta anterior (un fallo ahí no revierte nada,
// solo se registra). Si la base falla, se borra el archivo nuevo.
export async function subirReglasLlenado(
  entrada: EntradaSubirReglasLlenado,
  dependencias: DependenciasSubirReglasLlenado,
): Promise<ResultadoSubirReglasLlenado> {
  const { repositorio, almacen, detector, generarId, registrarFallo } = dependencias;

  if (!(await repositorio.formatoExiste(entrada.formatoExcelId))) {
    return { ok: false, motivo: "FORMATO_NO_ENCONTRADO" };
  }

  if (entrada.tamanoDeclarado === null) {
    return { ok: false, motivo: "SIN_LONGITUD" };
  }

  if (entrada.tamanoDeclarado > TAMANO_MAXIMO_REGLAS_LLENADO) {
    return { ok: false, motivo: "EXCEDE_TAMANO" };
  }

  const extension = extensionReglasLlenadoDesdeNombre(entrada.nombreArchivoOriginal);

  if (!extension) {
    return { ok: false, motivo: "TIPO_INVALIDO" };
  }

  if (!entrada.cuerpo || entrada.tamanoDeclarado === 0) {
    return { ok: false, motivo: "VACIO", extension };
  }

  // El límite se vuelve a medir mientras se recibe: el `Content-Length` declarado no es confiable.
  const temporal = await almacen.guardarTemporal(entrada.cuerpo, TAMANO_MAXIMO_REGLAS_LLENADO);

  if (!temporal.ok) {
    return { ok: false, motivo: temporal.motivo, extension };
  }

  let referenciaDefinitiva: string | null = null;

  try {
    if (!(await detector.corresponde(temporal.referenciaTemporal, extension))) {
      await almacen.eliminar(temporal.referenciaTemporal);
      return { ok: false, motivo: "TIPO_INVALIDO", extension };
    }

    referenciaDefinitiva = await almacen.moverDefinitivoEn(
      temporal.referenciaTemporal,
      `${entrada.formatoExcelId}/${generarId()}.${extension}`,
    );

    const resultado = await repositorio.guardar({
      formatoExcelId: entrada.formatoExcelId,
      nombreArchivoOriginal: entrada.nombreArchivoOriginal,
      extension,
      tipoContenido: tipoContenidoReglasLlenado(extension),
      rutaArchivo: referenciaDefinitiva,
      tamanoBytes: temporal.tamanoBytes,
      sha256: temporal.sha256,
      subidoPorId: entrada.subidoPorId,
      subidoEn: entrada.ahora,
    });

    if (!resultado.ok) {
      // El formato se eliminó entre la validación inicial y la transacción.
      await almacen.eliminar(referenciaDefinitiva);
      return { ok: false, motivo: "FORMATO_NO_ENCONTRADO", extension };
    }

    if (resultado.anterior && resultado.anterior.rutaArchivo !== resultado.actual.rutaArchivo) {
      try {
        await almacen.eliminar(resultado.anterior.rutaArchivo);
      } catch (error) {
        registrarFallo("No se pudo eliminar el archivo anterior de reglas de llenado", error);
      }
    }

    return { ok: true, reglas: resultado.actual, reemplazo: resultado.anterior !== null };
  } catch (error) {
    // Falla técnica (detector, disco o base): no debe quedar ni el temporal ni el archivo nuevo.
    await almacen.eliminar(referenciaDefinitiva ?? temporal.referenciaTemporal).catch((errorLimpieza: unknown) => {
      registrarFallo("No se pudo limpiar un archivo de reglas de llenado tras una falla", errorLimpieza);
    });
    throw error;
  }
}
