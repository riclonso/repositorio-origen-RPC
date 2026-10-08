// RF-38: formatos de prueba de la equivalencia entre la validación en memoria (referencia
// congelada) y la validación en streaming. Mismas columnas con distintas combinaciones de reglas,
// para cubrir cada regla activa e inactiva sobre el mismo corpus.
import type {
  ColumnaFormatoExcel,
  FormatoExcel,
  ReglaValidacionFormatoExcel,
  TipoReglaValidacion,
} from "../../../src/modules/formatos-excel/domain/entities/FormatoExcel";

const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const ANIO_VENTANA_PRUEBA = 2024;

export const VENTANA_PRUEBA = {
  anio: ANIO_VENTANA_PRUEBA,
  fechaApertura: new Date(Date.UTC(2025, 0, 1)),
  fechaVencimiento: new Date(Date.UTC(2025, 11, 31, 23, 59, 59, 999)),
};

// Encabezados del corpus, en el orden en que los escribe el generador.
export const ENCABEZADOS_CORPUS = [
  "RUT",
  "Nombre",
  "Fecha Nacimiento",
  "Fecha Diagnóstico",
  "Edad",
  "Peso",
  "Activo",
  "Correo",
  "Sexo",
  "Comentario",
] as const;

function columna(
  orden: number,
  nombre: string,
  tipoDato: ColumnaFormatoExcel["tipoDato"],
  requerida: boolean,
  tipoEnumeradoNombre: string | null = null,
): ColumnaFormatoExcel {
  return { id: `col-${orden}`, orden, nombre, requerida, tipoDato, tipoEnumeradoNombre };
}

const COLUMNAS_BASE: ColumnaFormatoExcel[] = [
  columna(1, "RUT", "TEXTO", true),
  columna(2, "Nombre", "TEXTO", true),
  columna(3, "Fecha Nacimiento", "FECHA", false),
  columna(4, "Fecha Diagnóstico", "FECHA", true),
  columna(5, "Edad", "ENTERO", false),
  columna(6, "Peso", "DECIMAL", false),
  columna(7, "Activo", "BOOLEANO", false),
  columna(8, "Correo", "EMAIL", false),
  columna(9, "Sexo", "ENUMERADO", false, "Sexo"),
  columna(10, "Comentario", "TEXTO", false),
];

function regla(orden: number, tipo: TipoReglaValidacion, columnas: string[], mensaje: string): ReglaValidacionFormatoExcel {
  return { id: `regla-${orden}`, orden, tipo, columnas, mensaje };
}

const TODAS_LAS_REGLAS: ReglaValidacionFormatoExcel[] = [
  regla(1, "ALGUNA_COLUMNA_CON_VALOR", ["Correo", "Comentario"], "Indica correo o comentario"),
  regla(2, "FECHA_EFECTIVA_DENTRO_DEL_ANIO_VENTANA", ["Fecha Diagnóstico", "Fecha Nacimiento"], "La fecha efectiva no es del año"),
  regla(3, "FILA_DUPLICADA", ["RUT"], "RUT repetido"),
  regla(4, "FILA_DUPLICADA", ["Nombre", "Fecha Nacimiento"], "Persona repetida"),
  regla(5, "RUT_VALIDO", ["RUT"], "RUT inválido"),
  regla(6, "CONTENIDO_HTML", [], "La celda trae HTML"),
  regla(7, "FILA_VACIA", [], "No se permiten filas vacías"),
];

function formato(id: string, columnas: ColumnaFormatoExcel[], reglas: ReglaValidacionFormatoExcel[]): FormatoExcel {
  return {
    id,
    nombre: `Formato ${id}`,
    descripcion: null,
    nombreArchivoPlantilla: "plantilla.xlsx",
    tipoContenidoPlantilla: TIPO_XLSX,
    tipoArchivo: "EXCEL",
    separadorCsv: null,
    activo: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    columnas,
    reglasValidacion: reglas,
    tiposEnumerados: [{ id: "enum-1", orden: 1, nombre: "Sexo", valores: ["Masculino", "Femenino", "Intersex", "Ñandú"] }],
  };
}

// Cada formato se aplica a cada archivo del corpus.
export const FORMATOS_PRUEBA: FormatoExcel[] = [
  formato("sin-reglas", COLUMNAS_BASE, []),
  formato("todas-las-reglas", COLUMNAS_BASE, TODAS_LAS_REGLAS),
  formato(
    "todas-sin-fila-vacia",
    COLUMNAS_BASE,
    TODAS_LAS_REGLAS.filter((candidata) => candidata.tipo !== "FILA_VACIA"),
  ),
  formato("solo-fila-vacia", COLUMNAS_BASE, TODAS_LAS_REGLAS.filter((candidata) => candidata.tipo === "FILA_VACIA")),
  formato(
    "duplicados-y-html",
    COLUMNAS_BASE,
    TODAS_LAS_REGLAS.filter((candidata) => candidata.tipo === "FILA_DUPLICADA" || candidata.tipo === "CONTENIDO_HTML"),
  ),
  // Nombres de columna con otras mayúsculas: el encabezado se reconoce (comparación normalizada)
  // pero la fila se indexa por el texto del archivo, así que el valor llega vacío (comportamiento
  // existente que la equivalencia debe conservar).
  formato(
    "mayusculas-distintas",
    COLUMNAS_BASE.map((original) => (original.nombre === "Nombre" ? { ...original, nombre: "NOMBRE" } : original)),
    [regla(1, "FILA_DUPLICADA", ["NOMBRE"], "Nombre repetido")],
  ),
  // Subconjunto de columnas: el resto del archivo son columnas inesperadas.
  formato("subconjunto", COLUMNAS_BASE.slice(0, 3), [regla(1, "FILA_VACIA", [], "No se permiten filas vacías")]),
];
