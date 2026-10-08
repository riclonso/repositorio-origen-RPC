// RF-38: COPIA CONGELADA de la validación de archivos del notificador tal como
// existía antes de RF-38 (`ValidarYCargarArchivo.ts`, líneas 241-421, más el lector en memoria
// `LectorArchivoReporteExcelJs`). Es la REFERENCIA de la prueba de equivalencia
// (`tests/equivalencia-validacion.unit.ts`): el validador en streaming de producción debe producir,
// archivo por archivo y formato por formato, exactamente el mismo resultado (estado, filas, total de
// errores y la lista persistida en orden). No se usa en producción y NO debe "arreglarse": cualquier
// cambio aquí invalida la comparación. Se mantiene mientras exista `LectorArchivoReporteExcelJs`.
//
// Lo único que se parametriza es el tope de filas (antes la constante `TOPE_FILAS_DATOS = 20_000`),
// para poder comparar también archivos de más de 20.000 filas con el tope nuevo.
//
// Se reutilizan sin copiar los validadores que el diseño declara "sin cambios" (tipos de dato,
// reglas puras, HTML, filas vacías, conversión de celdas). Se COPIA el rastreador de `FILA_DUPLICADA`
// con su clave textual original (`Map<string, número>`), porque RF-38 cambia esa clave por un resumen.
import type {
  ColumnaFormatoExcel,
  FormatoExcel,
  ReglaValidacionFormatoExcel,
} from "../../src/modules/formatos-excel/domain/entities/FormatoExcel";
import {
  buscarTipoEnumeradoPorNombre,
  mensajeValorNoPermitidoEnumerado,
} from "../../src/modules/formatos-excel/domain/entities/TipoEnumerado";
import type {
  DatosNuevoErrorCargaArchivo,
  EstadoCargaArchivo,
  ValorCeldaArchivo,
} from "../../src/modules/reporte-excel/domain/entities/CargaArchivo";
import {
  celdaVacia,
  filaCompletamenteVacia,
  indiceUltimaFilaConDatos,
} from "../../src/modules/reporte-excel/domain/reglas/filasArchivo";
import {
  crearValidadorColumna,
  serializarValorParaClaveDuplicado,
  type ValidadorCelda,
} from "../../src/modules/reporte-excel/infrastructure/validacion/ValidadoresTipoDato";
import {
  columnasConContenidoHtml,
  cumpleReglaValidacion,
  type ContextoEvaluacionReglas,
} from "../../src/modules/reporte-excel/infrastructure/validacion/EvaluadorReglasValidacion";
import { lectorArchivoReporteExcelJs } from "../../src/modules/reporte-excel/infrastructure/lectura-archivo/LectorArchivoReporteExcelJs";

// Valores congelados de antes de RF-38.
const NUMERO_FILA_ENCABEZADO = 1;
const TOPE_ERRORES_PERSISTIDOS = 500;
export const TOPE_FILAS_DATOS_ANTERIOR = 20_000;

export type ResultadoValidacionReferencia = {
  estado: EstadoCargaArchivo;
  cantidadFilasDatos: number;
  cantidadErrores: number;
  errores: DatosNuevoErrorCargaArchivo[];
};

function normalizarNombre(nombre: string): string {
  return nombre.trim().toLowerCase();
}

function acotarErrores(errores: DatosNuevoErrorCargaArchivo[]): DatosNuevoErrorCargaArchivo[] {
  if (errores.length <= TOPE_ERRORES_PERSISTIDOS) {
    return errores;
  }

  const acotados = errores.slice(0, TOPE_ERRORES_PERSISTIDOS - 1);
  const restantes = errores.length - acotados.length;

  acotados.push({
    numeroFila: 0,
    columna: null,
    tipoError: errores[TOPE_ERRORES_PERSISTIDOS - 1].tipoError,
    mensaje: `... y ${restantes} errores más`,
  });

  return acotados;
}

type ValidacionColumna = {
  columna: ColumnaFormatoExcel;
  validador: ValidadorCelda;
  mensajeTipoInvalido: string;
};

function prepararValidacionesColumnas(formato: FormatoExcel, columnas: ColumnaFormatoExcel[]): ValidacionColumna[] {
  return columnas.map((columna) => {
    let validador: ValidadorCelda;

    try {
      validador = crearValidadorColumna(columna, formato.tiposEnumerados);
    } catch (error) {
      const detalle = error instanceof Error ? error.message : String(error);
      throw new Error(`Formato ${formato.id}: ${detalle}`, { cause: error });
    }

    const tipoEnumerado =
      columna.tipoDato === "ENUMERADO" && columna.tipoEnumeradoNombre !== null
        ? buscarTipoEnumeradoPorNombre(formato.tiposEnumerados, columna.tipoEnumeradoNombre)
        : undefined;

    return {
      columna,
      validador,
      mensajeTipoInvalido: tipoEnumerado
        ? mensajeValorNoPermitidoEnumerado(columna.nombre, tipoEnumerado)
        : `El valor de "${columna.nombre}" no tiene el formato esperado (${columna.tipoDato})`,
    };
  });
}

// Copia del rastreador ORIGINAL de `FILA_DUPLICADA` (clave = texto JSON completo).
type RastreadorFilasDuplicadas = Map<string, Map<string, number>>;

function crearRastreadorFilasDuplicadas(reglas: ReglaValidacionFormatoExcel[]): RastreadorFilasDuplicadas {
  const rastreador: RastreadorFilasDuplicadas = new Map();
  for (const regla of reglas) {
    if (regla.tipo === "FILA_DUPLICADA") rastreador.set(regla.id, new Map());
  }
  return rastreador;
}

function evaluarFilaDuplicada(
  rastreador: RastreadorFilasDuplicadas,
  regla: ReglaValidacionFormatoExcel,
  fila: Record<string, ValorCeldaArchivo>,
  numeroFila: number,
): boolean {
  const clavesPorRegla = rastreador.get(regla.id);
  if (!clavesPorRegla) return false;

  const valoresClave: (string | null)[] = regla.columnas.map((columna) =>
    serializarValorParaClaveDuplicado(fila[columna] ?? null),
  );

  if (valoresClave.every((valor) => valor === null)) return false;

  const clave = JSON.stringify(valoresClave);
  if (clavesPorRegla.has(clave)) return true;

  clavesPorRegla.set(clave, numeroFila);
  return false;
}

const TIPO_CONTENIDO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Validación completa en memoria de un `.xlsx`, idéntica a la de antes de RF-38 (sin persistir).
export async function validarEnMemoriaReferencia(
  contenido: Buffer,
  formato: FormatoExcel,
  ventana: ContextoEvaluacionReglas["ventana"],
  topeFilasDatos: number = TOPE_FILAS_DATOS_ANTERIOR,
): Promise<ResultadoValidacionReferencia> {
  const { encabezados, filas } = await lectorArchivoReporteExcelJs.leer(contenido, TIPO_CONTENIDO_XLSX);

  const errores: DatosNuevoErrorCargaArchivo[] = [];
  const encabezadosPresentes = new Set(encabezados.map(normalizarNombre));
  const nombresDeColumnaDelFormato = new Set(formato.columnas.map((columna) => normalizarNombre(columna.nombre)));

  for (const columna of formato.columnas) {
    if (!encabezadosPresentes.has(normalizarNombre(columna.nombre))) {
      errores.push({
        numeroFila: NUMERO_FILA_ENCABEZADO,
        columna: columna.nombre,
        tipoError: "COLUMNA_FALTANTE",
        mensaje: `Falta la columna "${columna.nombre}", declarada en el formato`,
      });
    }
  }

  const columnasInesperadas = encabezados.filter(
    (encabezado) => !nombresDeColumnaDelFormato.has(normalizarNombre(encabezado)),
  );

  for (const columnaInesperada of columnasInesperadas) {
    errores.push({
      numeroFila: NUMERO_FILA_ENCABEZADO,
      columna: columnaInesperada,
      tipoError: "COLUMNA_INESPERADA",
      mensaje: `La columna "${columnaInesperada}" no pertenece al formato`,
    });
  }

  const validarFilas = columnasInesperadas.length === 0;
  const columnasAValidar = formato.columnas.filter((columna) =>
    encabezadosPresentes.has(normalizarNombre(columna.nombre)),
  );

  const reglaFilaVacia = formato.reglasValidacion.find((regla) => regla.tipo === "FILA_VACIA");
  const reglaHtml = formato.reglasValidacion.find((regla) => regla.tipo === "CONTENIDO_HTML");

  const indiceUltimaConDatos = indiceUltimaFilaConDatos(filas);
  const filasEfectivas = reglaFilaVacia ? filas.slice(0, indiceUltimaConDatos + 1) : filas;
  const sinFilasConDatos = indiceUltimaConDatos === -1;

  if (validarFilas && sinFilasConDatos && columnasAValidar.length > 0) {
    errores.push({
      numeroFila: 0,
      columna: null,
      tipoError: "SIN_FILAS_DATOS",
      mensaje: "El archivo parece estar vacío: no trae ninguna fila con datos debajo de los encabezados",
    });
  }

  const filasLeidas = sinFilasConDatos ? [] : filasEfectivas.slice(0, topeFilasDatos);
  const filasAValidar = validarFilas ? filasLeidas : [];
  const nombresColumnasAValidar = columnasAValidar.map((columna) => columna.nombre);
  const validacionesColumnas = prepararValidacionesColumnas(formato, columnasAValidar);
  const reglasFilaDuplicada = formato.reglasValidacion.filter((regla) => regla.tipo === "FILA_DUPLICADA");
  const rastreadorFilasDuplicadas = crearRastreadorFilasDuplicadas(reglasFilaDuplicada);

  filasAValidar.forEach((fila: Record<string, ValorCeldaArchivo>, indice) => {
    const numeroFila = indice + 2;

    if (reglaFilaVacia && filaCompletamenteVacia(fila)) {
      errores.push({ numeroFila, columna: null, tipoError: "REGLA_VALIDACION", mensaje: reglaFilaVacia.mensaje });
      return;
    }

    for (const { columna, validador, mensajeTipoInvalido } of validacionesColumnas) {
      const valor = fila[columna.nombre] ?? null;

      if (celdaVacia(valor)) {
        if (columna.requerida) {
          errores.push({
            numeroFila,
            columna: columna.nombre,
            tipoError: "VALOR_REQUERIDO_VACIO",
            mensaje: `La columna "${columna.nombre}" es obligatoria y viene vacía`,
          });
        }
        continue;
      }

      if (!validador(valor)) {
        errores.push({ numeroFila, columna: columna.nombre, tipoError: "TIPO_DATO_INVALIDO", mensaje: mensajeTipoInvalido });
      }
    }

    for (const regla of formato.reglasValidacion) {
      if (!cumpleReglaValidacion(regla, fila, { ventana })) {
        errores.push({ numeroFila, columna: null, tipoError: "REGLA_VALIDACION", mensaje: regla.mensaje });
      }
    }

    for (const regla of reglasFilaDuplicada) {
      if (evaluarFilaDuplicada(rastreadorFilasDuplicadas, regla, fila, numeroFila)) {
        errores.push({ numeroFila, columna: null, tipoError: "REGLA_VALIDACION", mensaje: regla.mensaje });
      }
    }

    if (reglaHtml) {
      for (const nombreColumna of columnasConContenidoHtml(fila, nombresColumnasAValidar)) {
        errores.push({ numeroFila, columna: nombreColumna, tipoError: "REGLA_VALIDACION", mensaje: reglaHtml.mensaje });
      }
    }
  });

  const erroresAcotados = acotarErrores(errores);
  const estado: EstadoCargaArchivo = erroresAcotados.length > 0 ? "CON_ERRORES" : "PENDIENTE_VISTO_BUENO";

  return {
    estado,
    cantidadFilasDatos: filasLeidas.length,
    cantidadErrores: errores.length,
    errores: erroresAcotados,
  };
}
