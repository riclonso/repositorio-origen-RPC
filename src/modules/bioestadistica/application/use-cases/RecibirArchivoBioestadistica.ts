import {
  EXTENSION_POR_FORMATO,
  TAMANO_MAXIMO_ARCHIVO_BIOESTADISTICA,
  TIPO_CONTENIDO_POR_FORMATO,
  detectarFormatoArchivo,
  limiteExpiracionProcesamiento,
  type CargaBioestadistica,
  type FormatoArchivoBioestadistica,
} from "@/modules/bioestadistica/domain/entities/CargaBioestadistica";
import type { TipoArchivoBioestadistica } from "@/modules/bioestadistica/domain/entities/TipoArchivoBioestadistica";
import {
  validarEncabezados,
  type MotivoEncabezadosInvalidos,
} from "@/modules/bioestadistica/domain/entities/ValidacionEncabezados";
import { CargaBioestadisticaEnProcesoError } from "@/modules/bioestadistica/domain/errors/CargaBioestadisticaEnProcesoError";
import type { CargaBioestadisticaRepository } from "@/modules/bioestadistica/domain/repositories/CargaBioestadisticaRepository";
import type { SolicitudReemplazoBioestadisticaRepository } from "@/modules/bioestadistica/domain/repositories/SolicitudReemplazoBioestadisticaRepository";
import type {
  AlmacenArchivos,
  ConsultaEstablecimientoUsuario,
  LectorArchivoLibreStreaming,
} from "@/modules/bioestadistica/application/ports";
import { resolverAutorizacionSubidaBioestadistica } from "@/modules/bioestadistica/application/resolverAutorizacionSubidaBioestadistica";
import type { VentanaCargaRepository } from "@/modules/ventanas-carga/domain/repositories/VentanaCargaRepository";

export type DatosRecibirArchivoBioestadistica = {
  usuarioId: string;
  anio: number;
  tipoArchivo: TipoArchivoBioestadistica;
  // Ya validado (longitud y caracteres) en el borde; solo se muestra, nunca forma parte de la ruta.
  nombreArchivoOriginal: string;
  // `Content-Length` declarado por el cliente (o `null`): solo sirve para un rechazo temprano. El
  // límite real se mide mientras se recibe.
  tamanoDeclarado: number | null;
  cuerpo: ReadableStream<Uint8Array> | null;
  ahora: Date;
};

// Contexto que el procesamiento asíncrono necesita y que solo se conoce al recibir: si es un
// reemplazo, qué carga reemplaza y con qué solicitud (la vigencia se evaluó aquí).
export type ContextoProcesamientoBioestadistica = {
  reemplazo: { cargaAnteriorId: string; solicitudId: string } | null;
};

export type MotivoRechazoRecepcion =
  | "SIN_ESTABLECIMIENTO"
  | "EN_PROCESO"
  | "SIN_ANIO_DISPONIBLE"
  | "YA_REPORTADO"
  | "REEMPLAZO_NO_AUTORIZADO"
  | "ARCHIVO_VACIO"
  | "ARCHIVO_DEMASIADO_GRANDE"
  | "ARCHIVO_NO_COINCIDE"
  | "ARCHIVO_ILEGIBLE"
  | "ESTRUCTURA_INVALIDA";

export type ResultadoRecibirArchivoBioestadistica =
  | {
      ok: true;
      carga: CargaBioestadistica;
      contexto: ContextoProcesamientoBioestadistica;
    }
  | { ok: false; motivo: Exclude<MotivoRechazoRecepcion, "ESTRUCTURA_INVALIDA"> }
  | { ok: false; motivo: "ESTRUCTURA_INVALIDA"; detalle: MotivoEncabezadosInvalidos };

type Dependencias = {
  repositorioCargas: CargaBioestadisticaRepository;
  repositorioSolicitudes: SolicitudReemplazoBioestadisticaRepository;
  repositorioVentanas: VentanaCargaRepository;
  consultaUsuarios: ConsultaEstablecimientoUsuario;
  almacen: AlmacenArchivos;
  lector: LectorArchivoLibreStreaming;
};

// Libera los procesamientos huérfanos de esa combinación (más de `HORAS_EXPIRACION_PROCESAMIENTO`
// horas en PROCESANDO): pasan a FALLIDA con un update condicional y su archivo se elimina.
async function liberarProcesamientosExpirados(datos: DatosRecibirArchivoBioestadistica, dependencias: Dependencias) {
  const expiradas = await dependencias.repositorioCargas.marcarExpiradasComoFallidas(
    datos.usuarioId,
    datos.anio,
    datos.tipoArchivo,
    limiteExpiracionProcesamiento(datos.ahora),
  );

  await Promise.all(
    expiradas.flatMap((carga) => (carga.referenciaArchivo ? [dependencias.almacen.eliminar(carga.referenciaArchivo)] : [])),
  );
}

// Lee SOLO la fila 1 del archivo ya guardado. Un archivo que ni siquiera permite leer su primera
// fila (xlsx corrupto, p. ej.) se trata como ilegible.
async function validarEstructura(
  referencia: string,
  formato: FormatoArchivoBioestadistica,
  lector: LectorArchivoLibreStreaming,
): Promise<{ ok: true; encabezados: string[] } | { ok: false; motivo: "ARCHIVO_ILEGIBLE" } | { ok: false; motivo: "ESTRUCTURA_INVALIDA"; detalle: MotivoEncabezadosInvalidos }> {
  let celdas: string[];

  try {
    celdas = await lector.leerEncabezados(referencia, formato);
  } catch {
    return { ok: false, motivo: "ARCHIVO_ILEGIBLE" };
  }

  const validacion = validarEncabezados(celdas);
  return validacion.ok
    ? { ok: true, encabezados: validacion.encabezados }
    : { ok: false, motivo: "ESTRUCTURA_INVALIDA", detalle: validacion.motivo };
}

// RF-37, parte SÍNCRONA de la subida (dentro de la petición), del filtro más barato al más caro:
// establecimiento → procesamientos huérfanos → procesamiento en curso → autorización → tamaño
// declarado → recepción en streaming a un temporal (límite real, SHA-256, firma) → encabezados de la
// fila 1 → archivo definitivo y cabecera PROCESANDO. Ante cualquier rechazo el archivo recibido se
// elimina. El resto (filas y activación) lo hace `procesarCargaBioestadistica` en segundo plano.
export async function recibirArchivoBioestadistica(
  datos: DatosRecibirArchivoBioestadistica,
  dependencias: Dependencias,
): Promise<ResultadoRecibirArchivoBioestadistica> {
  const usuario = await dependencias.consultaUsuarios.obtenerPorId(datos.usuarioId);
  const establecimientoId = usuario?.establecimientoId ?? null;

  // Defensivo: el mantenedor ya exige establecimiento a este perfil, pero una cuenta anterior a esa
  // regla podría no tenerlo, y la carga guarda una copia obligatoria.
  if (!establecimientoId) return { ok: false, motivo: "SIN_ESTABLECIMIENTO" };

  await liberarProcesamientosExpirados(datos, dependencias);

  // Antes de recibir 300 MB: si ya hay un procesamiento vigente, la subida se rechazaría igual.
  const hayProcesando = await dependencias.repositorioCargas.existeProcesandoVigente(
    datos.usuarioId,
    datos.anio,
    datos.tipoArchivo,
    limiteExpiracionProcesamiento(datos.ahora),
  );
  if (hayProcesando) return { ok: false, motivo: "EN_PROCESO" };

  const autorizacion = await resolverAutorizacionSubidaBioestadistica(
    { usuarioId: datos.usuarioId, anio: datos.anio, tipoArchivo: datos.tipoArchivo, ahora: datos.ahora },
    dependencias,
  );
  if (!autorizacion.ok) return { ok: false, motivo: autorizacion.motivo };

  if (datos.tamanoDeclarado !== null && datos.tamanoDeclarado > TAMANO_MAXIMO_ARCHIVO_BIOESTADISTICA) {
    return { ok: false, motivo: "ARCHIVO_DEMASIADO_GRANDE" };
  }

  if (!datos.cuerpo) return { ok: false, motivo: "ARCHIVO_VACIO" };

  const cargaId = crypto.randomUUID();
  const guardado = await dependencias.almacen.guardarTemporal(datos.cuerpo, TAMANO_MAXIMO_ARCHIVO_BIOESTADISTICA, { usuarioId: datos.usuarioId, archivoId: cargaId, excel: /\.xlsx$/i.test(datos.nombreArchivoOriginal) });
  if (!guardado.ok) {
    return { ok: false, motivo: guardado.motivo === "VACIO" ? "ARCHIVO_VACIO" : "ARCHIVO_DEMASIADO_GRANDE" };
  }

  let referenciaVigente = guardado.referenciaTemporal;
  let cabeceraCreada = false;

  try {
    const formato = detectarFormatoArchivo(datos.nombreArchivoOriginal, guardado.primerosBytes);
    if (!formato) return { ok: false, motivo: "ARCHIVO_NO_COINCIDE" };

    const estructura = await validarEstructura(referenciaVigente, formato, dependencias.lector);
    if (!estructura.ok) return estructura;

    referenciaVigente = await dependencias.almacen.moverDefinitivo(
      referenciaVigente,
      datos.anio,
      cargaId,
      EXTENSION_POR_FORMATO[formato],
    );

    const carga = await dependencias.repositorioCargas.crearProcesando({
      id: cargaId,
      anio: datos.anio,
      tipoArchivo: datos.tipoArchivo,
      usuarioId: datos.usuarioId,
      establecimientoId,
      nombreArchivoOriginal: datos.nombreArchivoOriginal,
      tipoContenidoArchivo: TIPO_CONTENIDO_POR_FORMATO[formato],
      referenciaArchivo: referenciaVigente,
      tamanoBytes: guardado.tamanoBytes,
      sha256: guardado.sha256,
      encabezados: estructura.encabezados,
    });
    cabeceraCreada = true;

    return {
      ok: true,
      carga,
      contexto: {
        reemplazo: autorizacion.reemplazo
          ? { cargaAnteriorId: autorizacion.reemplazo.cargaAnterior.id, solicitudId: autorizacion.reemplazo.solicitudId }
          : null,
      },
    };
  } catch (error) {
    // Cierra la carrera de dos subidas simultáneas que pasaron el chequeo de arriba a la vez.
    if (error instanceof CargaBioestadisticaEnProcesoError) return { ok: false, motivo: "EN_PROCESO" };
    throw error;
  } finally {
    // Sin cabecera, el archivo (temporal o ya movido) no pertenece a ninguna carga: se elimina.
    if (!cabeceraCreada) await dependencias.almacen.eliminar(referenciaVigente);
  }
}
