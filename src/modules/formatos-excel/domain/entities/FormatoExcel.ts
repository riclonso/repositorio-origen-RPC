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
export type FuenteFecha = { modo: "COLUMNA"; columna: string } | { modo: "COMPONENTES"; dia: string; mes: string; anio: string };
// La fecha 2 (referencia) además puede ser una fecha fija escrita al configurar ("YYYY-MM-DD").
export type FuenteFechaReferencia = FuenteFecha | { modo: "FIJA"; fecha: string };
export const OPERADORES_COMPARACION_FECHAS = ["MAYOR", "MAYOR_IGUAL", "IGUAL", "MENOR", "MENOR_IGUAL"] as const;
export type OperadorComparacionFechas = (typeof OPERADORES_COMPARACION_FECHAS)[number];
// `operador` es opcional: las reglas guardadas antes de existir se interpretan como `MAYOR_IGUAL`.
export type ConfiguracionComparacionFechas = { origen: FuenteFecha; operador?: OperadorComparacionFechas; referencia: FuenteFechaReferencia };
// `COMPARACION_ANIO_VENTANA`: año de `columnas[0]` <operador> año de la ventana. Aquí el operador
// es obligatorio (no hay reglas guardadas antes de que existiera). `desplazamientoAnios` (entero,
// -100..100) se suma al año de la fecha antes de comparar; ausente equivale a 0 (y el 0 no se guarda).
export type ConfiguracionComparacionAnioVentana = { operador: OperadorComparacionFechas; desplazamientoAnios?: number };
export const DESPLAZAMIENTO_ANIOS_MINIMO = -100;
export const DESPLAZAMIENTO_ANIOS_MAXIMO = 100;
// `ANIO_DENTRO_DE_RANGO_VENTANA`: el año de cada fecha con valor debe caer en
// [año de la ventana − aniosAntes, año de la ventana + aniosDespues]. Ambos enteros 0..100,
// obligatorios y siempre persistidos (también cuando son 0).
export type ConfiguracionAnioDentroDeRango = { aniosAntes: number; aniosDespues: number };
export const ANIOS_RANGO_MINIMO = 0;
export const ANIOS_RANGO_MAXIMO = 100;
// Configuración propia de los tipos de regla que la necesitan; `null` en todos los demás.
export type ConfiguracionReglaValidacion =
  | ConfiguracionComparacionFechas
  | ConfiguracionComparacionAnioVentana
  | ConfiguracionAnioDentroDeRango;

// Guardas de tipo: `origen` solo existe en la comparación entre dos fechas.
export function esConfiguracionComparacionFechas(
  configuracion: ConfiguracionReglaValidacion | null | undefined,
): configuracion is ConfiguracionComparacionFechas {
  return configuracion != null && "origen" in configuracion;
}

export function esConfiguracionComparacionAnioVentana(
  configuracion: ConfiguracionReglaValidacion | null | undefined,
): configuracion is ConfiguracionComparacionAnioVentana {
  if (configuracion == null || !("operador" in configuracion) || "origen" in configuracion) return false;
  const { desplazamientoAnios } = configuracion as ConfiguracionComparacionAnioVentana;
  return desplazamientoAnios === undefined || Number.isInteger(desplazamientoAnios);
}

function esAniosRangoValido(valor: unknown): boolean {
  return typeof valor === "number" && Number.isInteger(valor) && valor >= ANIOS_RANGO_MINIMO && valor <= ANIOS_RANGO_MAXIMO;
}

// Sin `operador` ni `origen`: ninguna de las otras dos guardas acepta esta forma, ni esta las suyas.
export function esConfiguracionAnioDentroDeRango(
  configuracion: ConfiguracionReglaValidacion | null | undefined,
): configuracion is ConfiguracionAnioDentroDeRango {
  if (configuracion == null || "operador" in configuracion || "origen" in configuracion) return false;
  if (!("aniosAntes" in configuracion) || !("aniosDespues" in configuracion)) return false;
  return esAniosRangoValido(configuracion.aniosAntes) && esAniosRangoValido(configuracion.aniosDespues);
}

export const TIPOS_REGLA_VALIDACION = [
  "FECHA_POSTERIOR_O_IGUAL",
  "ALGUNA_COLUMNA_CON_VALOR",
  "FILA_DUPLICADA",
  "RUT_VALIDO",
  "CONTENIDO_HTML",
  "FILA_VACIA",
  // Una columna de fecha no puede ser posterior al día (America/Santiago) en que se valida la subida.
  "FECHA_NO_FUTURA",
  // El año de una columna de fecha se compara con el año de la ventana (`configuracion.operador`).
  "COMPARACION_ANIO_VENTANA",
  // El año de cada fecha con valor (una o más columnas) debe caer en un rango en torno al año de la
  // ventana (`configuracion.aniosAntes` / `configuracion.aniosDespues`).
  "ANIO_DENTRO_DE_RANGO_VENTANA",
] as const;

// RF-32: tipos que se aplican siempre a TODAS las columnas del formato presentes en el archivo
// (ver convención de `columnas[]` más abajo) y de los que puede haber como máximo uno por formato.
export const TIPOS_REGLA_TODAS_LAS_COLUMNAS: readonly TipoReglaValidacion[] = ["CONTENIDO_HTML", "FILA_VACIA"];

export type TipoReglaValidacion = (typeof TIPOS_REGLA_VALIDACION)[number];

// Las columnas se referencian por NOMBRE (`String[]`), no por FK al id de `ColumnaFormatoExcel`:
// `actualizar()` regenera los ids de las columnas en cada edición (`deleteMany` + `create`), así
// que una FK dura dejaría las reglas huérfanas en el primer guardado posterior a su creación.
//
// Convención de `columnas[]` específica de `FILA_DUPLICADA`: todas las columnas, en conjunto,
// forman la clave compuesta que identifica una fila. El orden de `columnas[]` se usa para construir
// la clave de comparación, aunque el resultado de la regla es el mismo sin importar el orden en que
// se declararon.
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
//
// Convención de `columnas[]` específica de `FECHA_NO_FUTURA` y `COMPARACION_ANIO_VENTANA`:
// exactamente una columna, de tipo `FECHA`. En `COMPARACION_ANIO_VENTANA` el `mensaje` admite el
// marcador `MARCADOR_ANIO_VENTANA`, que el evaluador reemplaza por el año de la ventana.
//
// Convención de `columnas[]` específica de `ANIO_DENTRO_DE_RANGO_VENTANA`: una o más columnas,
// todas de tipo `FECHA`. Las celdas vacías o no parseables se ignoran; la fila falla (un solo
// error) si alguna fecha cae fuera del rango. El `mensaje` admite `MARCADOR_ANIO_VENTANA`,
// `MARCADOR_ANIO_DESDE` y `MARCADOR_ANIO_HASTA`.
export type ReglaValidacionFormatoExcel = {
  id: string;
  orden: number;
  tipo: TipoReglaValidacion;
  columnas: string[];
  mensaje: string;
  configuracion?: ConfiguracionReglaValidacion | null;
};

// Marcador del mensaje de `COMPARACION_ANIO_VENTANA` (ver convención arriba). Nunca se reemplaza
// por el valor de la celda: el mensaje de una regla no lleva datos del archivo.
export const MARCADOR_ANIO_VENTANA = "{anioVentana}";
// Límites del rango de `ANIO_DENTRO_DE_RANGO_VENTANA` (mismo criterio: nunca valores de celda).
export const MARCADOR_ANIO_DESDE = "{anioDesde}";
export const MARCADOR_ANIO_HASTA = "{anioHasta}";

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
  configuracion?: ConfiguracionReglaValidacion | null;
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
