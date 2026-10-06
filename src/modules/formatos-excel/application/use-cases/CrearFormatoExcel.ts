import type {
  FormatoExcel,
  SeparadorCsv,
  TipoArchivo,
  TipoDatoColumna,
  TipoReglaValidacion,
} from "@/modules/formatos-excel/domain/entities/FormatoExcel";
import type { FormatoExcelRepository } from "@/modules/formatos-excel/domain/repositories/FormatoExcelRepository";
import { FormatoDuplicadoError } from "@/modules/formatos-excel/domain/errors/FormatoDuplicadoError";
import {
  resolverTiposEnumerados,
  type RechazoTiposEnumerados,
} from "@/modules/formatos-excel/application/resolverTiposEnumerados";

export type DatosColumnaCreacion = {
  nombre: string;
  requerida: boolean;
  tipoDato: TipoDatoColumna;
  tipoEnumeradoNombre: string | null;
};

export type DatosTipoEnumeradoCreacion = {
  nombre: string;
  valores: string[];
};

export type DatosReglaValidacionCreacion = {
  tipo: TipoReglaValidacion;
  columnas: string[];
  mensaje: string;
};

export type DatosCreacionFormatoExcel = {
  nombre: string;
  descripcion: string | null;
  nombreArchivoPlantilla: string;
  tipoContenidoPlantilla: string;
  // Detectado por el servidor a partir del contenido real del archivo; nunca del cliente.
  tipoArchivo: TipoArchivo;
  // El que eligió el usuario en el asistente. Debe coincidir con `tipoArchivo`.
  tipoArchivoDeclarado: TipoArchivo;
  separadorCsv: SeparadorCsv | null;
  contenidoPlantilla: Buffer;
  columnas: DatosColumnaCreacion[];
  reglasValidacion: DatosReglaValidacionCreacion[];
  tiposEnumerados: DatosTipoEnumeradoCreacion[];
};

export type ResultadoCrearFormatoExcel =
  | { ok: true; formato: FormatoExcel }
  | { ok: false; motivo: "TIPO_NO_COINCIDE" }
  | { ok: false; motivo: "DUPLICADO"; nombre: string }
  | RechazoTiposEnumerados;

export async function crearFormatoExcel(
  datos: DatosCreacionFormatoExcel,
  dependencias: { repositorio: FormatoExcelRepository },
): Promise<ResultadoCrearFormatoExcel> {
  if (datos.tipoArchivoDeclarado !== datos.tipoArchivo) {
    return { ok: false, motivo: "TIPO_NO_COINCIDE" };
  }

  // Antes de consultar la base de datos: una referencia inválida no necesita ninguna lectura.
  // También fija el orden de columnas y tipos enumerados por posición.
  const resueltos = resolverTiposEnumerados(datos.columnas, datos.tiposEnumerados);

  if (!resueltos.ok) {
    return resueltos;
  }

  const existente = await dependencias.repositorio.buscarPorNombre(datos.nombre);

  if (existente) {
    return { ok: false, motivo: "DUPLICADO", nombre: datos.nombre };
  }

  // El orden lo fija el servidor por la posición del elemento en el arreglo recibido: nunca se
  // confía en un valor de orden enviado por el cliente.
  const reglasValidacionConOrden = datos.reglasValidacion.map((regla, indice) => ({
    ...regla,
    orden: indice + 1,
  }));

  try {
    const formato = await dependencias.repositorio.crear({
      nombre: datos.nombre,
      descripcion: datos.descripcion,
      nombreArchivoPlantilla: datos.nombreArchivoPlantilla,
      tipoContenidoPlantilla: datos.tipoContenidoPlantilla,
      tipoArchivo: datos.tipoArchivo,
      // Defensa en profundidad: aunque el esquema ya exige esa coherencia, un EXCEL nunca
      // persiste separador.
      separadorCsv: datos.tipoArchivo === "CSV" ? datos.separadorCsv : null,
      contenidoPlantilla: datos.contenidoPlantilla,
      columnas: resueltos.columnas,
      reglasValidacion: reglasValidacionConOrden,
      tiposEnumerados: resueltos.tiposEnumerados,
    });

    return { ok: true, formato };
  } catch (error) {
    // Cierra la ventana de carrera entre `buscarPorNombre` y el INSERT.
    if (error instanceof FormatoDuplicadoError) {
      return { ok: false, motivo: "DUPLICADO", nombre: datos.nombre };
    }

    throw error;
  }
}
