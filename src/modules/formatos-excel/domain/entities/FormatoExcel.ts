// `FormatoExcel` no incluye `contenidoPlantilla` a propósito, mismo motivo que `Usuario` nunca
// incluye `contrasenaHash`: al ser el tipo que viaja hasta la respuesta HTTP, dejar el binario
// fuera hace imposible filtrarlo por descuido. Solo se escribe al crear (`DatosNuevoFormatoExcel`);
// ninguna lectura lo trae, porque la plantilla descargable se genera desde las columnas.

export const TIPOS_DATO_COLUMNA = [
  "TEXTO",
  "ENTERO",
  "DECIMAL",
  "BOOLEANO",
  "FECHA",
  "EMAIL",
  // Único tipo configurable: sus valores permitidos los define quien configura el formato
  // (`TipoEnumeradoFormatoExcel`). Una columna `ENUMERADO` lleva siempre `tipoEnumeradoNombre`.
  "ENUMERADO",
] as const;

export type TipoDatoColumna = (typeof TIPOS_DATO_COLUMNA)[number];

// Tipos con un validador fijo (un parser propio). `ENUMERADO` queda fuera porque su validador se
// arma a partir de los valores definidos en cada formato.
export type TipoDatoColumnaFijo = Exclude<TipoDatoColumna, "ENUMERADO">;

// RF-15 (ampliación): tipo de archivo que este formato acepta. Se deriva del
// `tipoContenidoPlantilla` real detectado al crear (nunca recibido del cliente) y es inmutable:
// no forma parte de `DatosEdicionFormatoExcel`.
export const TIPOS_ARCHIVO = ["EXCEL", "CSV"] as const;

export type TipoArchivo = (typeof TIPOS_ARCHIVO)[number];

// Separador de campos de un formato CSV. Lista fija (decisión explícita). `null` en formatos
// EXCEL; obligatorio en formatos CSV. A diferencia de `tipoArchivo`, sí es editable.
export const SEPARADORES_CSV = ["COMA", "PUNTO_Y_COMA", "TABULADOR", "BARRA_VERTICAL"] as const;

export type SeparadorCsv = (typeof SEPARADORES_CSV)[number];

export const CARACTER_SEPARADOR_CSV: Record<SeparadorCsv, string> = {
  COMA: ",",
  PUNTO_Y_COMA: ";",
  TABULADOR: "\t",
  BARRA_VERTICAL: "|",
};

export type ColumnaFormatoExcel = {
  id: string;
  orden: number;
  nombre: string;
  requerida: boolean;
  tipoDato: TipoDatoColumna;
  // Nombre de un `TipoEnumeradoFormatoExcel` del mismo formato. No nulo si y solo si
  // `tipoDato === "ENUMERADO"` (CHECK en BD, Zod y `application/`).
  tipoEnumeradoNombre: string | null;
};

// Tipo enumerado propio de un formato. Las columnas lo referencian por NOMBRE (no por id), mismo
// motivo que las reglas referencian columnas por nombre: `actualizar()` regenera los ids.
export type TipoEnumeradoFormatoExcel = {
  id: string;
  orden: number;
  nombre: string;
  valores: string[];
};

// Cuatro tipos de regla: de un conjunto de columnas, al menos una debe traer valor (si todas
// vienen vacías, se rechaza); o una columna de fecha debe caer dentro del rango de la ventana de
// carga vigente para esa subida (RF-15); o una "fecha efectiva" calculada a partir de varias
// columnas debe caer dentro del AÑO de esa ventana (ampliación posterior); o una fila no puede
// repetir exactamente los mismos valores (tras `trim()`, comparación case-sensitive) que otra
// fila anterior del mismo archivo en el mismo conjunto de columnas (ampliación posterior); o
// (RF-32) ninguna celda de datos puede traer etiquetas o entidades HTML (`CONTENIDO_HTML`); o
// ninguna fila completamente vacía puede quedar entre filas con datos (`FILA_VACIA`). Agregar
// un tipo nuevo es una decisión de producto que exige código nuevo (el evaluador que las ejecuta
// contra un archivo real), así que vive en este arreglo fijo, mismo criterio que
// `TIPOS_DATO_COLUMNA`.
export const TIPOS_REGLA_VALIDACION = [
  "ALGUNA_COLUMNA_CON_VALOR",
  "FECHA_EFECTIVA_DENTRO_DEL_ANIO_VENTANA",
  "FILA_DUPLICADA",
  "RUT_VALIDO",
  "CONTENIDO_HTML",
  "FILA_VACIA",
] as const;

// RF-32: tipos que se aplican siempre a TODAS las columnas del formato presentes en el archivo
// (ver convención de `columnas[]` más abajo) y de los que puede haber como máximo uno por formato.
export const TIPOS_REGLA_TODAS_LAS_COLUMNAS: readonly TipoReglaValidacion[] = ["CONTENIDO_HTML", "FILA_VACIA"];

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
//
// Convención de `columnas[]` específica de `RUT_VALIDO`: 1 o 2 columnas. Con 1, `columnas[0]`
// trae el RUT completo (con o sin puntos y guion). Con 2, `columnas[0]` es el NÚMERO (cuerpo) y
// `columnas[1]` el DÍGITO VERIFICADOR. Si todas las columnas vienen vacías la regla no falla; si
// solo una de las dos viene vacía, falla.
//
// Convención de `columnas[]` específica de `CONTENIDO_HTML` y `FILA_VACIA` (RF-32): siempre
// arreglo vacío `[]`, que significa "todas las columnas del formato presentes en el archivo".
// No se guarda una lista explícita a propósito: `useEliminarColumnaFormato` borra toda regla que
// mencione una columna eliminada, así que con una lista explícita borrar UNA columna eliminaría la
// regla completa, y una columna agregada después quedaría sin cubrir. Con `[]` la regla nunca
// queda huérfana. El esquema Zod exige `[]` y como máximo una regla de cada uno por formato.
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
  separadorCsv: SeparadorCsv | null;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
  columnas: ColumnaFormatoExcel[];
  reglasValidacion: ReglaValidacionFormatoExcel[];
  tiposEnumerados: TipoEnumeradoFormatoExcel[];
};

// Vista liviana para el listado: evita traer el arreglo completo de columnas de cada fila cuando
// solo hace falta la cantidad. `cantidadUsuariosAsignados` viene de `_count` de Prisma, en la
// misma consulta que el resto (sin N+1).
export type FormatoExcelResumen = {
  id: string;
  nombre: string;
  descripcion: string | null;
  tipoArchivo: TipoArchivo;
  separadorCsv: SeparadorCsv | null;
  activo: boolean;
  createdAt: Date;
  cantidadColumnas: number;
  cantidadReglas: number;
  cantidadUsuariosAsignados: number;
  cantidadVentanasCarga: number;
  // Un formato solo puede eliminarse físicamente sin perder trazabilidad si no tiene ventanas.
  puedeEliminar: boolean;
};

export type DatosColumnaNueva = {
  orden: number;
  nombre: string;
  requerida: boolean;
  tipoDato: TipoDatoColumna;
  tipoEnumeradoNombre: string | null;
};

// Sin `id`: el orden lo fija el servidor por la posición del elemento en el arreglo recibido,
// igual que `DatosColumnaNueva`.
export type DatosReglaValidacionNueva = {
  orden: number;
  tipo: TipoReglaValidacion;
  columnas: string[];
  mensaje: string;
};

// Sin `id`: mismo criterio que `DatosColumnaNueva`.
export type DatosTipoEnumeradoNuevo = {
  orden: number;
  nombre: string;
  valores: string[];
};

export type DatosNuevoFormatoExcel = {
  nombre: string;
  descripcion: string | null;
  nombreArchivoPlantilla: string;
  tipoContenidoPlantilla: string;
  tipoArchivo: TipoArchivo;
  separadorCsv: SeparadorCsv | null;
  contenidoPlantilla: Buffer;
  columnas: DatosColumnaNueva[];
  reglasValidacion: DatosReglaValidacionNueva[];
  tiposEnumerados: DatosTipoEnumeradoNuevo[];
};

// La plantilla persistida NO se reemplaza al editar (decisión ya tomada): editar solo toca
// nombre, descripción, el separador CSV (solo en formatos CSV), el conjunto de columnas y el de
// reglas de validación (y el de tipos enumerados). `tipoArchivo` es inmutable.
export type DatosEdicionFormatoExcel = {
  nombre: string;
  descripcion: string | null;
  separadorCsv: SeparadorCsv | null;
  columnas: DatosColumnaNueva[];
  reglasValidacion: DatosReglaValidacionNueva[];
  tiposEnumerados: DatosTipoEnumeradoNuevo[];
};
