import type { ColumnaFormatoExcel, FormatoExcel } from "@/modules/formatos-excel/domain/entities/FormatoExcel";
import {
  buscarTipoEnumeradoPorNombre,
  mensajeValorNoPermitidoEnumerado,
} from "@/modules/formatos-excel/domain/entities/TipoEnumerado";
import {
  MENSAJE_TEXTO_ENRIQUECIDO_CELDA,
  MENSAJE_TEXTO_ENRIQUECIDO_ENCABEZADO,
  MENSAJE_TOPE_FILAS_EXCEDIDO,
  NUMERO_FILA_ENCABEZADO,
  TOPE_ERRORES_PERSISTIDOS,
  TOPE_FILAS_DATOS,
  type DatosNuevoErrorCargaArchivo,
  type ResultadoValidacionArchivo,
  type ValorCeldaArchivo,
} from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import { celdaVacia, filaCompletamenteVacia } from "@/modules/reporte-excel/domain/reglas/filasArchivo";
import { crearValidadorColumna, type ValidadorCelda } from "@/modules/reporte-excel/infrastructure/validacion/ValidadoresTipoDato";
import {
  columnasConContenidoHtml,
  crearRastreadorFilasDuplicadas,
  cumpleReglaValidacion,
  evaluarFilaDuplicada,
  type ContextoEvaluacionReglas,
} from "@/modules/reporte-excel/infrastructure/validacion/EvaluadorReglasValidacion";

// RF-38: validación de un archivo del notificador FILA A FILA, sin tener el archivo
// completo en memoria. Aplica exactamente la lógica que antes vivía en `ValidarYCargarArchivo.ts`
// (mismos validadores, mismas reglas, mismos mensajes, mismo orden de errores) sobre filas que
// llegan en orden. Lo que antes dependía de ver el archivo completo se reproduce así:
//
//  - Filas vacías (`FILA_VACIA`, `SIN_FILAS_DATOS`, recorte del final): las vacías NO se procesan al
//    llegar; se acumula la corrida (basta con los números: toda celda de una fila vacía cumple
//    `celdaVacia`, así que validarla equivale a validar una fila de `null`). Al llegar una fila con
//    datos se procesa primero la corrida pendiente y después la fila. Al terminar, la corrida final
//    se descarta (con `FILA_VACIA`, o sin filas con datos) o se valida (sin la regla). Memoria O(1).
//  - Huecos (números de fila sin `<row>`): son filas vacías, igual que `hoja.getRow(n)` en memoria.
//  - Errores: se guardan los primeros `TOPE_ERRORES_PERSISTIDOS` en orden y se cuenta el total; al
//    final se aplica el mismo recorte (499 + fila resumen con el tipo del error 500). Memoria O(500).
//  - `FILA_DUPLICADA`: ver `RastreadorFilasDuplicadas` (clave resumida).
//
// Cambios de comportamiento de RF-38 (los únicos):
//  - Una fila con datos más allá de `topeFilasDatos + 1` agrega `TOPE_FILAS_EXCEDIDO` y detiene la
//    lectura (antes esas filas se ignoraban sin aviso).
//  - Un encabezado o una celda de datos con texto enriquecido agrega
//    `TEXTO_ENRIQUECIDO` (sin el contenido de la celda). Un encabezado enriquecido se reconoce por su
//    texto (antes era "[object Object]").

// Mismo tope que el lector en memoria: evita recorrer columnas indefinidamente.
export const MAXIMO_COLUMNAS_ENCABEZADO = 500;

export type CeldaEncabezado = { texto: string; enriquecido: boolean };

export type ResultadoFilaMotor = "CONTINUAR" | "DETENER";

export type MotorValidacionFilas = {
  // Celdas de la fila 1 en orden (posición 0 = columna A). Si el archivo no trae fila 1, `[]`. Debe
  // llamarse una vez, antes de la primera fila de datos.
  procesarEncabezados(celdas: readonly CeldaEncabezado[]): void;
  // Una fila (número ≥ 2, en orden ascendente). `valores[i]` = columna i + 1; `enriquecidas[i]`
  // indica si esa celda era texto enriquecido. `DETENER` = no hace falta seguir leyendo.
  procesarFila(numeroFila: number, valores: readonly ValorCeldaArchivo[], enriquecidas?: readonly boolean[]): ResultadoFilaMotor;
  // `ultimaFila`: el número de fila más alto que trae la hoja (equivale a `rowCount` en memoria).
  finalizar(ultimaFila: number): ResultadoValidacionArchivo;
};

export type OpcionesMotorValidacion = {
  formato: FormatoExcel;
  ventana: ContextoEvaluacionReglas["ventana"];
  // Inyectable solo para pruebas de borde. Por defecto `TOPE_FILAS_DATOS`.
  topeFilasDatos?: number;
};

type ValidacionColumna = {
  columna: ColumnaFormatoExcel;
  validador: ValidadorCelda;
  // El mensaje no depende de la celda (nunca incluye el valor recibido), así que se arma una vez.
  mensajeTipoInvalido: string;
};

function normalizarNombre(nombre: string): string {
  return nombre.trim().toLowerCase();
}

export function prepararValidacionesColumnas(formato: FormatoExcel, columnas: ColumnaFormatoExcel[]): ValidacionColumna[] {
  return columnas.map((columna) => {
    let validador: ValidadorCelda;

    try {
      validador = crearValidadorColumna(columna, formato.tiposEnumerados);
    } catch (error) {
      // Dato corrupto (columna ENUMERADO sin su tipo): se relanza con el id del formato para que
      // quien procesa lo deje en `errores.txt`. Sin valores de celdas.
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

// Primeros `TOPE_ERRORES_PERSISTIDOS` errores en orden de aparición, más el total.
function crearAcumuladorErrores() {
  const primeros: DatosNuevoErrorCargaArchivo[] = [];
  let total = 0;

  return {
    agregar(error: DatosNuevoErrorCargaArchivo): void {
      total += 1;
      if (primeros.length < TOPE_ERRORES_PERSISTIDOS) primeros.push(error);
    },
    // Suma errores sin guardarlos: solo cuando ya no cabe ninguno más.
    contarSinGuardar(cantidad: number): void {
      total += cantidad;
    },
    lleno(): boolean {
      return primeros.length >= TOPE_ERRORES_PERSISTIDOS;
    },
    get total(): number {
      return total;
    },
    // Mismo recorte que `acotarErrores` de antes de RF-38.
    acotados(): DatosNuevoErrorCargaArchivo[] {
      if (total <= TOPE_ERRORES_PERSISTIDOS) return [...primeros];
      const acotados = primeros.slice(0, TOPE_ERRORES_PERSISTIDOS - 1);
      acotados.push({
        numeroFila: 0,
        columna: null,
        tipoError: primeros[TOPE_ERRORES_PERSISTIDOS - 1].tipoError,
        mensaje: `... y ${total - acotados.length} errores más`,
      });
      return acotados;
    },
  };
}

type ErrorSinFila = Omit<DatosNuevoErrorCargaArchivo, "numeroFila">;

export function crearMotorValidacionFilas(opciones: OpcionesMotorValidacion): MotorValidacionFilas {
  const { formato, ventana } = opciones;
  const topeFilasDatos = opciones.topeFilasDatos ?? TOPE_FILAS_DATOS;
  const ultimaFilaPermitida = topeFilasDatos + 1;

  const errores = crearAcumuladorErrores();
  const reglaFilaVacia = formato.reglasValidacion.find((regla) => regla.tipo === "FILA_VACIA");
  const reglaHtml = formato.reglasValidacion.find((regla) => regla.tipo === "CONTENIDO_HTML");
  const reglasFilaDuplicada = formato.reglasValidacion.filter((regla) => regla.tipo === "FILA_DUPLICADA");
  const rastreadorFilasDuplicadas = crearRastreadorFilasDuplicadas(reglasFilaDuplicada);

  const encabezados: string[] = [];
  let encabezadosProcesados = false;
  let validarFilas = true;
  let columnasAValidar: ColumnaFormatoExcel[] = [];
  let nombresColumnasAValidar: string[] = [];
  let validacionesColumnas: ValidacionColumna[] = [];
  // Errores que produce una fila vacía (sin `FILA_VACIA`): siempre los mismos, solo cambia la fila.
  let erroresFilaVacia: ErrorSinFila[] = [];

  let ultimaFilaConDatos = 0;
  let detenido = false;

  function validarFila(numeroFila: number, fila: Record<string, ValorCeldaArchivo>, enriquecidas: Record<string, boolean>): void {
    for (const { columna, validador, mensajeTipoInvalido } of validacionesColumnas) {
      const valor = fila[columna.nombre] ?? null;

      if (celdaVacia(valor)) {
        if (columna.requerida) {
          errores.agregar({
            numeroFila,
            columna: columna.nombre,
            tipoError: "VALOR_REQUERIDO_VACIO",
            mensaje: `La columna "${columna.nombre}" es obligatoria y viene vacía`,
          });
        }
        continue;
      }

      if (!validador(valor)) {
        errores.agregar({ numeroFila, columna: columna.nombre, tipoError: "TIPO_DATO_INVALIDO", mensaje: mensajeTipoInvalido });
      }
    }

    for (const regla of formato.reglasValidacion) {
      if (!cumpleReglaValidacion(regla, fila, { ventana })) {
        errores.agregar({ numeroFila, columna: null, tipoError: "REGLA_VALIDACION", mensaje: regla.mensaje });
      }
    }

    // Igual que las demás reglas, pero con el estado del rastreador.
    for (const regla of reglasFilaDuplicada) {
      if (evaluarFilaDuplicada(rastreadorFilasDuplicadas, regla, fila)) {
        errores.agregar({ numeroFila, columna: null, tipoError: "REGLA_VALIDACION", mensaje: regla.mensaje });
      }
    }

    // RF-32: un error POR CELDA con HTML. Nunca se incluye el contenido de la celda.
    if (reglaHtml) {
      for (const nombreColumna of columnasConContenidoHtml(fila, nombresColumnasAValidar)) {
        errores.agregar({ numeroFila, columna: nombreColumna, tipoError: "REGLA_VALIDACION", mensaje: reglaHtml.mensaje });
      }
    }

    // RF-38: texto enriquecido, un error por celda aunque su texto sea válido. Una
    // celda enriquecida sin texto visible no se marca.
    for (const { columna } of validacionesColumnas) {
      if (enriquecidas[columna.nombre] && !celdaVacia(fila[columna.nombre] ?? null)) {
        errores.agregar({ numeroFila, columna: columna.nombre, tipoError: "TEXTO_ENRIQUECIDO", mensaje: MENSAJE_TEXTO_ENRIQUECIDO_CELDA });
      }
    }
  }

  // Corrida de filas vacías `desde..hasta` (inclusive), ya dentro del tope.
  function procesarCorridaVacia(desde: number, hasta: number): void {
    if (!validarFilas || hasta < desde) return;

    const porFila: ErrorSinFila[] = reglaFilaVacia
      ? [{ columna: null, tipoError: "REGLA_VALIDACION", mensaje: reglaFilaVacia.mensaje }]
      : erroresFilaVacia;
    if (porFila.length === 0) return;

    for (let numeroFila = desde; numeroFila <= hasta; numeroFila += 1) {
      if (errores.lleno()) {
        errores.contarSinGuardar(porFila.length * (hasta - numeroFila + 1));
        return;
      }
      for (const error of porFila) errores.agregar({ numeroFila, ...error });
    }
  }

  // Errores de una fila vacía sin `FILA_VACIA`: los mismos que daría validar una fila de `null`. Se
  // calculan una vez con un rastreador de duplicados aparte (una clave vacía nunca se registra).
  function calcularErroresFilaVacia(): ErrorSinFila[] {
    const resultado: ErrorSinFila[] = [];
    const filaNula: Record<string, ValorCeldaArchivo> = {};
    for (const { columna } of validacionesColumnas) {
      if (columna.requerida) {
        resultado.push({
          columna: columna.nombre,
          tipoError: "VALOR_REQUERIDO_VACIO",
          mensaje: `La columna "${columna.nombre}" es obligatoria y viene vacía`,
        });
      }
    }
    for (const regla of formato.reglasValidacion) {
      if (!cumpleReglaValidacion(regla, filaNula, { ventana })) {
        resultado.push({ columna: null, tipoError: "REGLA_VALIDACION", mensaje: regla.mensaje });
      }
    }
    return resultado;
  }

  function procesarEncabezados(celdas: readonly CeldaEncabezado[]): void {
    if (encabezadosProcesados) return;
    encabezadosProcesados = true;

    const enriquecidos: string[] = [];
    for (let indice = 0; indice < Math.min(celdas.length, MAXIMO_COLUMNAS_ENCABEZADO); indice += 1) {
      const { texto, enriquecido } = celdas[indice];
      if (texto.length === 0) break;
      encabezados.push(texto);
      if (enriquecido) enriquecidos.push(texto);
    }

    const encabezadosPresentes = new Set(encabezados.map(normalizarNombre));
    const nombresDelFormato = new Set(formato.columnas.map((columna) => normalizarNombre(columna.nombre)));

    for (const columna of formato.columnas) {
      if (!encabezadosPresentes.has(normalizarNombre(columna.nombre))) {
        errores.agregar({
          numeroFila: NUMERO_FILA_ENCABEZADO,
          columna: columna.nombre,
          tipoError: "COLUMNA_FALTANTE",
          mensaje: `Falta la columna "${columna.nombre}", declarada en el formato`,
        });
      }
    }

    // Columnas no declaradas en el formato: NO se ignoran silenciosamente.
    const columnasInesperadas = encabezados.filter((encabezado) => !nombresDelFormato.has(normalizarNombre(encabezado)));
    for (const columnaInesperada of columnasInesperadas) {
      errores.agregar({
        numeroFila: NUMERO_FILA_ENCABEZADO,
        columna: columnaInesperada,
        tipoError: "COLUMNA_INESPERADA",
        mensaje: `La columna "${columnaInesperada}" no pertenece al formato`,
      });
    }

    for (const encabezado of enriquecidos) {
      errores.agregar({
        numeroFila: NUMERO_FILA_ENCABEZADO,
        columna: encabezado,
        tipoError: "TEXTO_ENRIQUECIDO",
        mensaje: MENSAJE_TEXTO_ENRIQUECIDO_ENCABEZADO,
      });
    }

    // Con columnas que no pertenecen al formato la estructura ya está mal: validar las filas solo
    // agregaría ruido.
    validarFilas = columnasInesperadas.length === 0;
    // Solo las columnas del formato presentes en el archivo: una ausente ya es `COLUMNA_FALTANTE`.
    columnasAValidar = formato.columnas.filter((columna) => encabezadosPresentes.has(normalizarNombre(columna.nombre)));
    nombresColumnasAValidar = columnasAValidar.map((columna) => columna.nombre);
    validacionesColumnas = prepararValidacionesColumnas(formato, columnasAValidar);
    erroresFilaVacia = calcularErroresFilaVacia();
  }

  function procesarFila(
    numeroFila: number,
    valores: readonly ValorCeldaArchivo[],
    enriquecidas: readonly boolean[] = [],
  ): ResultadoFilaMotor {
    if (detenido) return "DETENER";
    procesarEncabezados([]);

    // Misma forma que en memoria: indexada por el texto del encabezado (si se repite, gana la
    // última columna con ese nombre).
    const fila: Record<string, ValorCeldaArchivo> = {};
    const enriquecidasPorNombre: Record<string, boolean> = {};
    encabezados.forEach((nombreColumna, indice) => {
      fila[nombreColumna] = valores[indice] ?? null;
      enriquecidasPorNombre[nombreColumna] = enriquecidas[indice] === true;
    });

    if (filaCompletamenteVacia(fila)) return "CONTINUAR";

    const desde = ultimaFilaConDatos === 0 ? 2 : ultimaFilaConDatos + 1;

    if (numeroFila > ultimaFilaPermitida) {
      procesarCorridaVacia(desde, ultimaFilaPermitida);
      errores.agregar({ numeroFila: 0, columna: null, tipoError: "TOPE_FILAS_EXCEDIDO", mensaje: MENSAJE_TOPE_FILAS_EXCEDIDO });
      detenido = true;
      return "DETENER";
    }

    procesarCorridaVacia(desde, numeroFila - 1);
    if (validarFilas) validarFila(numeroFila, fila, enriquecidasPorNombre);
    ultimaFilaConDatos = numeroFila;
    return "CONTINUAR";
  }

  function finalizar(ultimaFila: number): ResultadoValidacionArchivo {
    procesarEncabezados([]);
    let cantidadFilasDatos: number;

    if (detenido) {
      cantidadFilasDatos = topeFilasDatos;
    } else if (ultimaFilaConDatos === 0) {
      // Estructural: ninguna fila con datos. Solo si se reconoció al menos una columna del formato:
      // sin ninguna, el archivo ya trae un `COLUMNA_FALTANTE` por columna.
      if (validarFilas && columnasAValidar.length > 0) {
        errores.agregar({
          numeroFila: 0,
          columna: null,
          tipoError: "SIN_FILAS_DATOS",
          mensaje: "El archivo parece estar vacío: no trae ninguna fila con datos debajo de los encabezados",
        });
      }
      cantidadFilasDatos = 0;
    } else if (reglaFilaVacia) {
      // RF-32: las vacías del final (residuos de Excel) no se validan ni se cuentan.
      cantidadFilasDatos = ultimaFilaConDatos - 1;
    } else {
      // Sin la regla, las vacías del final se validan y cuentan, como antes (dentro del tope).
      procesarCorridaVacia(ultimaFilaConDatos + 1, Math.min(ultimaFila, ultimaFilaPermitida));
      cantidadFilasDatos = Math.min(Math.max(ultimaFila, ultimaFilaConDatos) - 1, topeFilasDatos);
    }

    const acotados = errores.acotados();
    return {
      estado: acotados.length > 0 ? "CON_ERRORES" : "PENDIENTE_VISTO_BUENO",
      cantidadFilasDatos,
      cantidadErrores: errores.total,
      errores: acotados,
    };
  }

  return { procesarEncabezados, procesarFila, finalizar };
}
