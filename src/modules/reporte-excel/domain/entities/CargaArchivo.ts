// `CargaArchivo` no incluye `contenidoArchivo` ni la ruta en disco a propósito, mismo motivo que
// `FormatoExcel` nunca incluye `contenidoPlantilla`: al ser el tipo que viaja hasta la respuesta
// HTTP, dejar el binario (o su ubicación) fuera hace imposible filtrarlo por descuido. El único
// lugar que sí lo necesita usa `CargaArchivoParaDescarga`, más abajo.


export const ESTADOS_CARGA_ARCHIVO = [
  // RF-38: el archivo ya se recibió y se guardó en disco; su validación corre en segundo plano.
  "PROCESANDO",
  "CON_ERRORES",
  "PENDIENTE_VISTO_BUENO",
  "APROBADA",
  // Nuevo (rechazo de cargas aprobadas): una `APROBADA` que un ADMIN/REVISOR_REPOSITORIO rechazó
  // unilateralmente. Irreversible, mismo criterio que el visto bueno.
  "RECHAZADA",
] as const;
export type EstadoCargaArchivo = (typeof ESTADOS_CARGA_ARCHIVO)[number];

export const TIPOS_ERROR_CARGA_ARCHIVO = [
  "COLUMNA_FALTANTE",
  "COLUMNA_INESPERADA",
  "VALOR_REQUERIDO_VACIO",
  "TIPO_DATO_INVALIDO",
  "REGLA_VALIDACION",
  // Estructural: el archivo trae la fila de encabezados pero ninguna fila de datos debajo. Sin
  // esto, un archivo así pasaba el `forEach` de validación sin ejecutarse ni una vez y quedaba
  // como `PENDIENTE_VISTO_BUENO` con 0 errores, sin que ninguna regla de columna requerida llegara
  // a evaluarse.
  "SIN_FILAS_DATOS",
  // RF-38: el archivo trae más de `TOPE_FILAS_DATOS` filas de datos (antes se ignoraban sin aviso).
  "TOPE_FILAS_EXCEDIDO",
  // RF-38: el archivo no se pudo leer (ZIP inválido, demasiado grande descomprimido) o su validación
  // se interrumpió (reinicio del servidor, expiración).
  "ARCHIVO_NO_PROCESADO",
  // RF-38: celda o encabezado con texto enriquecido (formato parcial: negrita,
  // colores...). Nunca lleva el contenido de la celda.
  "TEXTO_ENRIQUECIDO",
] as const;
export type TipoErrorCargaArchivo = (typeof TIPOS_ERROR_CARGA_ARCHIVO)[number];

export const MENSAJE_TOPE_FILAS_EXCEDIDO =
  "El archivo supera el máximo de 500.000 filas de datos. Divide la información o contacta al equipo revisor.";
export const MENSAJE_ARCHIVO_NO_PROCESADO =
  "No se pudo leer el archivo. Verifica que sea un Excel válido y vuelve a subirlo.";
export const MENSAJE_PROCESAMIENTO_INTERRUMPIDO = "La validación se interrumpió. Vuelve a subir el archivo.";
export const MENSAJE_TEXTO_ENRIQUECIDO_CELDA =
  "La celda tiene texto con formato (negrita, colores, etc.). Quita el formato y vuelve a subir el archivo.";
export const MENSAJE_TEXTO_ENRIQUECIDO_ENCABEZADO =
  "El encabezado tiene texto con formato (negrita, colores, etc.). Quita el formato y vuelve a subir el archivo.";

// El lector toma siempre la primera fila de la hoja como encabezados: los errores de nombres de
// columna (`COLUMNA_FALTANTE`/`COLUMNA_INESPERADA`) se informan en esta fila.
export const NUMERO_FILA_ENCABEZADO = 1;

export const TIPOS_ERROR_DE_COLUMNA: ReadonlySet<TipoErrorCargaArchivo> = new Set([
  "COLUMNA_FALTANTE",
  "COLUMNA_INESPERADA",
]);

// RF-38: tope de filas de DATOS por carga. Superarlo deja la carga `CON_ERRORES` con
// `TOPE_FILAS_EXCEDIDO` (antes las filas sobrantes se ignoraban sin aviso).
export const TOPE_FILAS_DATOS = 500_000;

// RF-38: tamaño máximo del archivo del notificador, medido mientras se recibe.
export const TAMANO_MAXIMO_ARCHIVO_CARGA = 100 * 1024 * 1024;
export const TAMANO_MAXIMO_ARCHIVO_CARGA_TEXTO = "100 MB";

// RF-38: un `PROCESANDO` con más antigüedad que esto se considera interrumpido (respaldo por si la
// tarea en segundo plano quedó colgada sin que el proceso se reiniciara).
export const HORAS_EXPIRACION_PROCESAMIENTO_CARGA = 2;

export function limiteExpiracionProcesamientoCarga(ahora: Date): Date {
  return new Date(ahora.getTime() - HORAS_EXPIRACION_PROCESAMIENTO_CARGA * 60 * 60 * 1000);
}

// RF-38: fecha y hora de notificación de una carga: cuándo el notificador la finalizó y envió; para
// cargas anteriores a ese paso (RF-14b), cuándo se aprobó. `null` mientras no se haya notificado
// (en validación, con errores o sin finalizar): su descarga es el archivo original.
export function fechaHoraNotificacion(carga: { finalizadaEn: Date | null; vistoBuenoEn: Date | null }): Date | null {
  return carga.finalizadaEn ?? carga.vistoBuenoEn ?? null;
}

// Tope de filas de `ErrorCargaArchivo` persistidas por carga: evita miles de INSERTs con un
// archivo mal formado. Si se supera, se corta ahí y se agrega una fila resumen (ver
// el acumulador de `MotorValidacionFilas.ts`).
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
  // No nulo cuando el notificador ya "finalizó y envió" esta carga (paso que reemplaza a la
  // autoaprobación): habilita a ADMIN/REVISOR_REPOSITORIO a aprobarla o rechazarla, y bloquea una
  // subida nueva para la misma combinación (formato, ventana) mientras no se decida.
  finalizadaEn: Date | null;
  createdAt: Date;
  updatedAt: Date;
  errores: ErrorCargaArchivo[];
  // Denormalizado vía join a `CargaArchivoRechazo`, no nulo solo cuando `estado = RECHAZADA`.
  rechazo: InfoRechazoCargaArchivo | null;
};

// Detalle del rechazo, embebido en `CargaArchivo`/`CargaArchivoResumen` cuando corresponde. El
// motivo SÍ viaja aquí (a diferencia de `logs/auditoria.txt`, que nunca lo registra): es
// información de negocio visible para quien tiene acceso a la carga.
export type InfoRechazoCargaArchivo = {
  motivo: string;
  rechazadoEn: Date;
  rechazadoPorNombre: string;
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
  // RF-31: la fila de una carga pendiente en el detalle de ventana lo necesita para abrir el hilo
  // de mensajes del notificador correcto.
  usuarioId: string;
  usuarioNombre: string;
  usuarioRut: string;
  nombreArchivoOriginal: string;
  cantidadFilasDatos: number;
  cantidadErrores: number;
  estado: EstadoCargaArchivo;
  vistoBuenoEn: Date | null;
  // Ver comentario en `CargaArchivo.finalizadaEn`: se expone en el resumen para que el notificador
  // pueda ocultar por completo la tarjeta de una combinación (formato, ventana) mientras esté
  // finalizada y pendiente de decisión (`panel-carga-archivo.tsx`).
  finalizadaEn: Date | null;
  createdAt: Date;
  rechazo: InfoRechazoCargaArchivo | null;
};

// Espejo del enum `TipoDesactivacionCargaPublicada` de Prisma (`CargaArchivoPublicada`): por qué
// una publicación dejó de estar vigente. `REEMPLAZO` cuando una solicitud de reemplazo consentida
// terminó en una carga nueva ya aprobada; `RECHAZO` cuando alguien la rechazó unilateralmente (o
// aprobó una solicitud de reemplazo sobre una carga todavía sin decidir, ver RF-22).
export type TipoDesactivacionCargaPublicada = "REEMPLAZO" | "RECHAZO";

// Vista de `CargaArchivoResumen` para "Mis cargas" (histórico propio del notificador,
// `listarPropiasAprobadas`): agrega el motivo por el que esta carga dejó de ser la vigente de su
// combinación (formato, ventana). Se resuelve combinando dos fuentes, mutuamente excluyentes:
// `rechazo.motivo` cuando `estado = RECHAZADA` (cubre también una `PENDIENTE_VISTO_BUENO` que
// nunca llegó a publicarse, RF-22), o `CargaArchivoPublicada.motivoDesactivacion` cuando la carga
// sí llegó a `APROBADA` y luego fue reemplazada o rechazada (ver `aCargaArchivoResumenPropia` en
// el repositorio). `null` en la carga vigente de un grupo (todavía no le pasó nada).
export type CargaArchivoResumenPropia = CargaArchivoResumen & {
  motivoDesactivacion: string | null;
  motivoDesactivacionTipo: TipoDesactivacionCargaPublicada | null;
  // Fecha del rechazo (`CargaArchivoRechazo.rechazadoEn`) o de la desactivación de la publicación
  // (`CargaArchivoPublicada.desactivadaEn`) según cuál de las dos fuentes aplique — mismo criterio
  // que `motivoDesactivacion`. Para "Mis cargas": la columna "Reemplazada el" del historial debe
  // mostrar cuándo pasó eso, no `vistoBuenoEn` (cuándo se había aprobado originalmente).
  desactivadaEn: Date | null;
};

export type DatosNuevoErrorCargaArchivo = {
  numeroFila: number;
  columna: string | null;
  tipoError: TipoErrorCargaArchivo;
  mensaje: string;
};

// RF-38: una carga recién recibida. Nace `PROCESANDO` con 0 filas y 0 errores; el binario ya está en
// disco (`rutaArchivo`, relativa al directorio base, generada por el servidor). La subida NO consume
// ninguna autorización (ni `SolicitudReemplazoCarga` ni reapertura de `CargaArchivoRechazo`): un
// intento con errores, o uno sin errores que el notificador no llegó a finalizar, no debe dejarlo
// bloqueado. El consumo vive en `CargaArchivoRepository.finalizar()`.
export type DatosNuevaCargaProcesando = {
  id: string;
  formatoExcelId: string;
  ventanaCargaId: string;
  usuarioId: string;
  nombreArchivoOriginal: string;
  tipoContenidoArchivo: string;
  rutaArchivo: string;
  tamanoBytes: number;
  sha256: string;
};

// RF-38: resultado de validar un archivo. `errores` ya viene acotado a `TOPE_ERRORES_PERSISTIDOS`
// (con la fila resumen); `cantidadErrores` es el total real.
export type ResultadoValidacionArchivo = {
  estado: Extract<EstadoCargaArchivo, "CON_ERRORES" | "PENDIENTE_VISTO_BUENO">;
  cantidadFilasDatos: number;
  cantidadErrores: number;
  errores: DatosNuevoErrorCargaArchivo[];
};

// RF-38: carga en `PROCESANDO` que el procesamiento asíncrono necesita leer.
export type CargaArchivoParaProcesar = {
  id: string;
  formatoExcelId: string;
  ventanaCargaId: string;
  usuarioId: string;
  estado: EstadoCargaArchivo;
  rutaArchivo: string | null;
};

// Desenlace de `CargaArchivoRepository.finalizar()`. `CARGA_PENDIENTE_DECISION`: otra carga de la
// misma combinación (usuario, ventana) ya está finalizada y sin decidir. `REEMPLAZO_NO_AUTORIZADO`:
// la solicitud de reemplazo a consumir ya fue usada por otra petición concurrente.
export type ResultadoFinalizarCargaArchivo =
  | { ok: true; carga: CargaArchivo }
  | { ok: false; motivo: "NO_ENCONTRADO" | "CARGA_PENDIENTE_DECISION" | "REEMPLAZO_NO_AUTORIZADO" };

// Qué autorización consume la finalización. La resuelve el servidor
// (`resolverAutorizacionReemplazo`), nunca viaja desde el cliente. Las reaperturas pendientes de la
// combinación se consumen siempre al finalizar, así que no necesitan id.
export type ConsumoFinalizacionCarga = {
  solicitudReemplazoId: string | null;
};

// Recorte de una carga usado para saber si es el intento más reciente de su combinación.
export type UltimaCargaCombinacion = {
  id: string;
  createdAt: Date;
};

// Datos que `DarVistoBueno` resuelve en `application/` (si esta carga reemplaza a una anterior)
// antes de pedirle al repositorio que ejecute, en una sola transacción, la transición de estado y
// la cabecera de la publicación hacia el revisor. RF-38: ya no se copian filas (el revisor descarga el
// archivo, generado desde el original).
export type DatosPublicacionCarga = {
  // No nulo cuando la combinación (usuario, ventana) de esta carga ya tenía una `APROBADA` vigente:
  // el repositorio desactiva TODAS las publicaciones activas de esa combinación distintas de la
  // nueva, enlazadas a esta carga y con este motivo (`motivoDesactivacionTipo = REEMPLAZO`). El
  // motivo es el que el notificador escribió al pedir el reemplazo, o uno genérico si no hay
  // solicitud (ver `DarVistoBueno`).
  reemplazo: { motivo: string } | null;
};

// Resumen de las cargas propias del panel del notificador: agrega si su publicación sigue activa
// (`null` cuando la carga no tiene publicación: nunca se aprobó, o es una aprobación anterior al
// backfill). El panel descarta como "vigente" una `APROBADA` con `publicacionActiva = false` (ya
// superada por un reemplazo o rechazada), mismo criterio que
// `CargaArchivoRepository.obtenerAprobadaVigentePorUsuarioYVentana`.
export type CargaArchivoResumenConPublicacion = CargaArchivoResumen & {
  publicacionActiva: boolean | null;
};

export type PaginaCargasConPublicacion = {
  filas: CargaArchivoResumenConPublicacion[];
  total: number;
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

// Nuevo (fin de la autoaprobación, RF-20 ampliado): filtro de la tabla "Notificaciones de archivos
// pendientes de aprobación o rechazo" del detalle de una ventana. A diferencia de
// `FiltroListadoCargasAprobadas`, trae TANTO `APROBADA` COMO `PENDIENTE_VISTO_BUENO` ya finalizada
// (`finalizadaEn` no nulo) de esa ventana; el repositorio aplica siempre ese `WHERE` compuesto,
// nunca filtrado en la UI.
export type FiltroListadoCargasPendientesODecididas = {
  ventanaCargaId: string;
  pagina: number;
  tamano: number;
};

export type PaginaCargas = {
  filas: CargaArchivoResumen[];
  total: number;
};

// Nuevo (rechazo de cargas aprobadas): filtro de la sección "Rechazadas" del detalle de una
// ventana (`/dashboard/ventanas-carga/[id]`, `/revisor/ventanas-carga/[id]`), mismo criterio que
// `FiltroListadoCargasAprobadas`.
export type FiltroListadoCargasRechazadas = {
  ventanaCargaId?: string;
  pagina: number;
  tamano: number;
};

export type DatosRechazoCargaArchivo = {
  rechazadoPorId: string;
  motivo: string;
};

// RF-38: dónde está el binario. `disco` para las cargas nuevas; `bd` para las cargas anteriores al
// almacenamiento en disco, que conservan su binario en `contenidoArchivo` de forma permanente.
export type FuenteArchivoCarga =
  | { tipo: "disco"; referencia: string; tamanoBytes: number }
  | { tipo: "bd"; contenido: Buffer };

// Único tipo que SÍ apunta al binario. Lo usan exclusivamente los endpoints de descarga.
export type CargaArchivoParaDescarga = {
  id: string;
  nombreArchivoOriginal: string;
  tipoContenidoArchivo: string;
  finalizadaEn: Date | null;
  vistoBuenoEn: Date | null;
  fuente: FuenteArchivoCarga;
};

// "Mis cargas" (histórico de exitosas del notificador): no existe un concepto de "reemplazo"
// persistido en `CargaArchivo`, se deriva en lectura agrupando por `ventanaCargaId` (mismo criterio
// que RF-15 ampliación, para no confundir una ventana eliminada y recreada con la vigente). Entre
// las `APROBADA` que comparten `ventanaCargaId`, la de mayor `vistoBuenoEn` es la vigente; el resto
// quedan como historial de reemplazadas.
// Genérico sobre `T extends CargaArchivoResumen` para que `listarPropiasAprobadas` (que trae
// `CargaArchivoResumenPropia`, con el motivo de reemplazo/rechazo) no pierda ese campo extra al
// agrupar: `GrupoCargaAprobada<CargaArchivoResumenPropia>` conserva `motivoDesactivacion` en
// `vigente`/`reemplazadas` hasta la vista (`mis-cargas-exitosas.ts`).
export type GrupoCargaAprobada<T extends CargaArchivoResumen = CargaArchivoResumen> = {
  vigente: T;
  reemplazadas: T[];
};

// Agrupa las `APROBADA` de un notificador por `ventanaCargaId`. Requiere que `cargas` ya venga
// ordenado `vistoBuenoEn desc` (contrato de `CargaArchivoRepository.listarPropiasAprobadas`): así,
// la primera carga que aparece para cada `ventanaCargaId` es la vigente, y las siguientes para esa
// misma combinación son las reemplazadas, ya en orden más reciente -> más antigua. Como `Map`
// conserva el orden de inserción, los grupos resultantes quedan ordenados por
// `vigente.vistoBuenoEn` descendente sin necesidad de un `sort` aparte.
// Precondición: toda fila con estado APROBADA tiene vistoBuenoEn no nulo (único camino a APROBADA
// es darVistoBueno(), que setea ambos atómicamente). Una `RECHAZADA` puede tener `vistoBuenoEn`
// nulo (RF-22: rechazo de una `PENDIENTE_VISTO_BUENO` que nunca llegó a aprobarse), así que el
// repositorio ordena con `NULLS LAST` explícito para que esa fila nunca se cuele como "vigente".
export function agruparCargasAprobadasPorVentana<T extends CargaArchivoResumen>(cargas: T[]): GrupoCargaAprobada<T>[] {
  const gruposPorVentana = new Map<string, GrupoCargaAprobada<T>>();

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
