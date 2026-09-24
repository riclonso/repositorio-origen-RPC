// `FormatoExcel` no incluye `contenidoPlantilla` a propósito, mismo motivo que `Usuario` nunca
// incluye `contrasenaHash`: al ser el tipo que viaja hasta la respuesta HTTP, dejar el binario
// fuera hace imposible filtrarlo por descuido. El único lugar que sí lo necesita usa
// `PlantillaFormatoExcel`, más abajo.

export const TIPOS_DATO_COLUMNA = [
  "TEXTO",
  "ENTERO",
  "DECIMAL",
  "BOOLEANO",
  "FECHA",
  "FECHA_HORA",
  "RUT",
  "EMAIL",
] as const;

export type TipoDatoColumna = (typeof TIPOS_DATO_COLUMNA)[number];

// RF-15 (ampliación): tipo de archivo que este formato acepta. Se deriva del
// `tipoContenidoPlantilla` real detectado al crear (nunca recibido del cliente) y es inmutable:
// no forma parte de `DatosEdicionFormatoExcel`.
export const TIPOS_ARCHIVO = ["EXCEL", "CSV"] as const;

export type TipoArchivo = (typeof TIPOS_ARCHIVO)[number];

export type ColumnaFormatoExcel = {
  id: string;
  orden: number;
  nombre: string;
  requerida: boolean;
  tipoDato: TipoDatoColumna;
};

// Cuatro tipos de regla: de un conjunto de columnas, al menos una debe traer valor (si todas
// vienen vacías, se rechaza); o una columna de fecha debe caer dentro del rango de la ventana de
// carga vigente para esa subida (RF-15); o una "fecha efectiva" calculada a partir de varias
// columnas debe caer dentro del AÑO de esa ventana (ampliación posterior); o una fila no puede
// repetir exactamente los mismos valores (tras `trim()`, comparación case-sensitive) que otra
// fila anterior del mismo archivo en el mismo conjunto de columnas (ampliación posterior). Agregar
// un tipo nuevo es una decisión de producto que exige código nuevo (el evaluador que las ejecuta
// contra un archivo real), así que vive en este arreglo fijo, mismo criterio que
// `TIPOS_DATO_COLUMNA`.
export const TIPOS_REGLA_VALIDACION = [
  "ALGUNA_COLUMNA_CON_VALOR",
  "FECHA_DENTRO_DE_VENTANA_VIGENTE",
  "FECHA_EFECTIVA_DENTRO_DEL_ANIO_VENTANA",
  "FILA_DUPLICADA",
] as const;

export type TipoReglaValidacion = (typeof TIPOS_REGLA_VALIDACION)[number];

// Las columnas se referencian por NOMBRE (`String[]`), no por FK al id de `ColumnaFormatoExcel`:
// `actualizar()` regenera los ids de las columnas en cada edición (`deleteMany` + `create`), así
// que una FK dura dejaría las reglas huérfanas en el primer guardado posterior a su creación.
//
// Convención de `columnas[]` específica de `FECHA_EFECTIVA_DENTRO_DEL_ANIO_VENTANA`:
// `columnas[0]` es la columna PRINCIPAL (p. ej. "Fecha de diagnóstico") y `columnas[1..]` son las
// columnas ALTERNATIVAS (p. ej. "Fecha de toma de muestra", "Fecha de recepción de muestra"), sin
// tope fijo de alternativas. El evaluador
// (`modules/reporte-excel/infrastructure/validacion/EvaluadorReglasValidacion.ts`) usa la
// principal si trae valor; si está vacía, usa la MÁS ANTIGUA de las alternativas que sí traigan
// una fecha válida. El orden entre alternativas (`columnas[1..]`) no afecta el resultado.
//
// Convención de `columnas[]` específica de `FILA_DUPLICADA`: es la clave compuesta que identifica
// una fila (sin columna principal ni alternativas, a diferencia de la regla anterior); el orden
// de `columnas[]` sí importa para construir la clave de comparación, aunque el resultado de la
// regla es el mismo sin importar el orden en que se declararon.
export type ReglaValidacionFormatoExcel = {
  id: string;
  orden: number;
  tipo: TipoReglaValidacion;
  columnas: string[];
  mensaje: string;
};

export type FormatoExcel = {
  id: string;
  nombre: string;
  descripcion: string | null;
  nombreArchivoPlantilla: string;
  tipoContenidoPlantilla: string;
  tipoArchivo: TipoArchivo;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
  columnas: ColumnaFormatoExcel[];
  reglasValidacion: ReglaValidacionFormatoExcel[];
};

// Vista liviana para el listado: evita traer el arreglo completo de columnas de cada fila cuando
// solo hace falta la cantidad. `cantidadUsuariosAsignados` viene de `_count` de Prisma, en la
// misma consulta que el resto (sin N+1).
export type FormatoExcelResumen = {
  id: string;
  nombre: string;
  descripcion: string | null;
  tipoArchivo: TipoArchivo;
  activo: boolean;
  createdAt: Date;
  cantidadColumnas: number;
  cantidadReglas: number;
  cantidadUsuariosAsignados: number;
};

export type DatosColumnaNueva = {
  orden: number;
  nombre: string;
  requerida: boolean;
  tipoDato: TipoDatoColumna;
};

// Sin `id`: el orden lo fija el servidor por la posición del elemento en el arreglo recibido,
// igual que `DatosColumnaNueva`.
export type DatosReglaValidacionNueva = {
  orden: number;
  tipo: TipoReglaValidacion;
  columnas: string[];
  mensaje: string;
};

export type DatosNuevoFormatoExcel = {
  nombre: string;
  descripcion: string | null;
  nombreArchivoPlantilla: string;
  tipoContenidoPlantilla: string;
  tipoArchivo: TipoArchivo;
  contenidoPlantilla: Buffer;
  columnas: DatosColumnaNueva[];
  reglasValidacion: DatosReglaValidacionNueva[];
};

// La plantilla persistida NO se reemplaza al editar (decisión ya tomada): editar solo toca
// nombre, descripción, el conjunto de columnas y el de reglas de validación.
export type DatosEdicionFormatoExcel = {
  nombre: string;
  descripcion: string | null;
  columnas: DatosColumnaNueva[];
  reglasValidacion: DatosReglaValidacionNueva[];
};

// Único tipo que SÍ carga el binario. Lo usa exclusivamente el endpoint de descarga.
export type PlantillaFormatoExcel = {
  nombreArchivoPlantilla: string;
  tipoContenidoPlantilla: string;
  contenidoPlantilla: Buffer;
};
