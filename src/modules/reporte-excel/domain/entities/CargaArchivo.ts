// `CargaArchivo` no incluye `contenidoArchivo` a propósito, mismo motivo que `FormatoExcel` nunca
// incluye `contenidoPlantilla`: al ser el tipo que viaja hasta la respuesta HTTP, dejar el
// binario fuera hace imposible filtrarlo por descuido. El único lugar que sí lo necesita usa
// `CargaArchivoParaDescarga`, más abajo.

export const ESTADOS_CARGA_ARCHIVO = ["CON_ERRORES", "PENDIENTE_VISTO_BUENO", "APROBADA"] as const;
export type EstadoCargaArchivo = (typeof ESTADOS_CARGA_ARCHIVO)[number];

export const TIPOS_ERROR_CARGA_ARCHIVO = [
  "COLUMNA_FALTANTE",
  "COLUMNA_INESPERADA",
  "VALOR_REQUERIDO_VACIO",
  "TIPO_DATO_INVALIDO",
  "REGLA_VALIDACION",
] as const;
export type TipoErrorCargaArchivo = (typeof TIPOS_ERROR_CARGA_ARCHIVO)[number];

// Tope de filas de DATOS validadas por carga (defensa adicional al límite de 10 MB de tamaño de
// archivo, ya existente en RF-13): filas más allá de este número no se validan.
export const TOPE_FILAS_DATOS = 20_000;

// Tope de filas de `ErrorCargaArchivo` persistidas por carga: evita miles de INSERTs con un
// archivo mal formado. Si se supera, se corta ahí y se agrega una fila resumen (ver
// `acotarErrores` en `ValidarYCargarArchivo.ts`).
export const TOPE_ERRORES_PERSISTIDOS = 500;

// Valor de una celda ya normalizado por el lector de archivo: agnóstico de si vino de un `.xlsx`
// (donde una fecha llega como `Date` nativo) o de un `.csv` (donde todo llega como texto).
export type ValorCeldaArchivo = string | number | boolean | Date | null;

export type ErrorCargaArchivo = {
  id: string;
  numeroFila: number;
  columna: string | null;
  tipoError: TipoErrorCargaArchivo;
  mensaje: string;
};

export type CargaArchivo = {
  id: string;
  formatoExcelId: string;
  formatoExcelNombre: string;
  // RF-15: año de la ventana de carga elegida por el notificador para esta subida. Denormalizado
  // vía join a `VentanaCarga`, mismo criterio que `formatoExcelNombre`.
  ventanaCargaId: string;
  anio: number;
  usuarioId: string;
  // Denormalizados vía join a `Usuario`, mismo criterio que `formatoExcelNombre`: el ADMIN y el
  // REVISOR_REPOSITORIO necesitan saber quién subió cada carga aprobada sin una consulta aparte.
  usuarioNombre: string;
  usuarioRut: string;
  nombreArchivoOriginal: string;
  tipoContenidoArchivo: string;
  cantidadFilasDatos: number;
  cantidadErrores: number;
  estado: EstadoCargaArchivo;
  vistoBuenoEn: Date | null;
  vistoBuenoPorId: string | null;
  createdAt: Date;
  updatedAt: Date;
  errores: ErrorCargaArchivo[];
};

// Vista liviana para los listados: sin el binario ni el detalle de errores fila por fila.
export type CargaArchivoResumen = {
  id: string;
  formatoExcelId: string;
  formatoExcelNombre: string;
  // RF-15: se expone para que el cliente pueda agrupar cargas propias por combinación
  // (formato, ventana) sin una consulta aparte — ver `panel-carga-archivo.tsx`.
  ventanaCargaId: string;
  anio: number;
  usuarioNombre: string;
  usuarioRut: string;
  nombreArchivoOriginal: string;
  cantidadFilasDatos: number;
  cantidadErrores: number;
  estado: EstadoCargaArchivo;
  vistoBuenoEn: Date | null;
  createdAt: Date;
};

export type DatosNuevoErrorCargaArchivo = {
  numeroFila: number;
  columna: string | null;
  tipoError: TipoErrorCargaArchivo;
  mensaje: string;
};

export type DatosNuevaCargaArchivo = {
  formatoExcelId: string;
  ventanaCargaId: string;
  usuarioId: string;
  nombreArchivoOriginal: string;
  tipoContenidoArchivo: string;
  contenidoArchivo: Buffer;
  cantidadFilasDatos: number;
  cantidadErrores: number;
  estado: EstadoCargaArchivo;
  errores: DatosNuevoErrorCargaArchivo[];
};

export type FiltroListadoCargasPropias = {
  usuarioId: string;
  estado?: EstadoCargaArchivo;
  formatoExcelId?: string;
  pagina: number;
  tamano: number;
};

export type FiltroListadoCargasAprobadas = {
  formatoExcelId?: string;
  // Acota el listado a las cargas aprobadas de una ventana de carga puntual (detalle de
  // `/dashboard/ventanas-carga/[id]` y `/revisor/ventanas-carga/[id]`). El repositorio aplica
  // siempre `estado = APROBADA` junto a este filtro en el mismo `WHERE`, nunca por separado.
  ventanaCargaId?: string;
  pagina: number;
  tamano: number;
};

export type PaginaCargas = {
  filas: CargaArchivoResumen[];
  total: number;
};

// Único tipo que SÍ carga el binario. Lo usa exclusivamente el endpoint de descarga, y solo
// cuando `estado = APROBADA`.
export type CargaArchivoParaDescarga = {
  nombreArchivoOriginal: string;
  tipoContenidoArchivo: string;
  contenidoArchivo: Buffer;
};

// "Mis cargas" (histórico de exitosas del notificador): no existe un concepto de "reemplazo"
// persistido en `CargaArchivo`, se deriva en lectura agrupando por `ventanaCargaId` (mismo criterio
// que RF-15 ampliación, para no confundir una ventana eliminada y recreada con la vigente). Entre
// las `APROBADA` que comparten `ventanaCargaId`, la de mayor `vistoBuenoEn` es la vigente; el resto
// quedan como historial de reemplazadas.
export type GrupoCargaAprobada = {
  vigente: CargaArchivoResumen;
  reemplazadas: CargaArchivoResumen[];
};

// Agrupa las `APROBADA` de un notificador por `ventanaCargaId`. Requiere que `cargas` ya venga
// ordenado `vistoBuenoEn desc` (contrato de `CargaArchivoRepository.listarPropiasAprobadas`): así,
// la primera carga que aparece para cada `ventanaCargaId` es la vigente, y las siguientes para esa
// misma combinación son las reemplazadas, ya en orden más reciente -> más antigua. Como `Map`
// conserva el orden de inserción, los grupos resultantes quedan ordenados por
// `vigente.vistoBuenoEn` descendente sin necesidad de un `sort` aparte.
// Precondición: toda fila con estado APROBADA tiene vistoBuenoEn no nulo (único camino a APROBADA
// es darVistoBueno(), que setea ambos atómicamente). Si esa invariante cambiara, el orderBy
// "vistoBuenoEn desc" de Postgres colocaría los NULL primero (NULLS FIRST por defecto en DESC),
// haciendo que una fila sin vistoBuenoEn se cuele como "vigente" del grupo.
export function agruparCargasAprobadasPorVentana(cargas: CargaArchivoResumen[]): GrupoCargaAprobada[] {
  const gruposPorVentana = new Map<string, GrupoCargaAprobada>();

  for (const carga of cargas) {
    const grupoExistente = gruposPorVentana.get(carga.ventanaCargaId);

    if (!grupoExistente) {
      gruposPorVentana.set(carga.ventanaCargaId, { vigente: carga, reemplazadas: [] });
      continue;
    }

    grupoExistente.reemplazadas.push(carga);
  }

  return Array.from(gruposPorVentana.values());
}
