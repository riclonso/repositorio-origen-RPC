import type { FormatoExcelRepository } from "@/modules/formatos-excel/domain/repositories/FormatoExcelRepository";
import {
  TAMANO_MAXIMO_ARCHIVO_CARGA,
  limiteExpiracionProcesamientoCarga,
  type CargaArchivo,
} from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import { CargaArchivoEnProcesoError } from "@/modules/reporte-excel/domain/errors/CargaArchivoEnProcesoError";
import type { CargaArchivoRepository } from "@/modules/reporte-excel/domain/repositories/CargaArchivoRepository";
import type { AlmacenArchivosCarga } from "@/modules/reporte-excel/application/ports";
import { resolverAutorizacionReemplazo } from "@/modules/reporte-excel/application/resolverAutorizacionReemplazo";
import { resolverVentanaHabilitada } from "@/modules/reporte-excel/application/resolverVentanaHabilitada";
import type { SolicitudReemplazoCargaRepository } from "@/modules/solicitudes-reemplazo/domain/repositories/SolicitudReemplazoCargaRepository";
import type { VentanaCargaRepository } from "@/modules/ventanas-carga/domain/repositories/VentanaCargaRepository";

export const TIPO_CONTENIDO_XLSX_CARGA = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type DatosRecibirArchivoCarga = {
  cargaIdReservada?: string;
  usuarioId: string;
  formatoExcelId: string;
  // Año de la ventana elegida. Se revalida SIEMPRE en servidor.
  anio: number;
  // Ya validado (longitud y caracteres) en el borde; solo se muestra, nunca forma parte de la ruta.
  nombreArchivoOriginal: string;
  // `Content-Length` declarado por el cliente (o `null`): solo sirve para un rechazo temprano. El
  // límite real se mide mientras se recibe.
  tamanoDeclarado: number | null;
  cuerpo: ReadableStream<Uint8Array> | null;
  ahora: Date;
};

export type MotivoRechazoRecepcionCarga =
  // Cubre "nunca estuvo asignado" y "se dio de baja entretanto": indistinguibles desde fuera.
  | "FORMATO_NO_ASIGNADO"
  | "ARCHIVO_NO_EXCEL"
  // No existe ventana abierta para el año y formato, o existe pero es un borrador: misma respuesta
  // genérica hacia el notificador (no se revela que existe un borrador).
  | "SIN_VENTANA_ABIERTA"
  | "VENTANA_NO_PUBLICADA"
  // Ya existe una APROBADA vigente sin autorización de reemplazo utilizable.
  | "REEMPLAZO_NO_AUTORIZADO"
  // Ya existe una PENDIENTE finalizada y sin decidir de esta combinación.
  | "CARGA_PENDIENTE_DECISION"
  // RF-38: ya hay un archivo validándose para esta combinación.
  | "EN_PROCESO"
  | "ARCHIVO_VACIO"
  | "ARCHIVO_DEMASIADO_GRANDE"
  // La firma real no es la de un ZIP (todo .xlsx lo es).
  | "ARCHIVO_NO_COINCIDE";

export type ResultadoRecibirArchivoCarga =
  | { ok: true; carga: CargaArchivo; tamanoBytes: number }
  | { ok: false; motivo: MotivoRechazoRecepcionCarga };

type Dependencias = {
  repositorio: CargaArchivoRepository;
  repositorioFormatosExcel: FormatoExcelRepository;
  repositorioVentanasCarga: VentanaCargaRepository;
  repositorioSolicitudesReemplazo: SolicitudReemplazoCargaRepository;
  almacen: AlmacenArchivosCarga;
  // Tipo de contenido real a partir del nombre y los primeros bytes (firma), o `null` si no
  // corresponden. La implementación reutiliza la detección de `formatos-excel`.
  detectarTipoContenido: (nombreArchivo: string, primerosBytes: Uint8Array) => string | null;
};

function esExtensionXlsx(nombreArchivo: string): boolean {
  return nombreArchivo.toLowerCase().endsWith(".xlsx");
}

// Respaldo de la recepción: un procesamiento colgado de más de 2 horas se libera (queda como intento
// fallido con su error); uno vigente impide otra subida de la misma combinación.
async function resolverProcesamientoEnCurso(
  usuarioId: string,
  ventanaCargaId: string,
  ahora: Date,
  repositorio: CargaArchivoRepository,
): Promise<boolean> {
  const enCurso = await repositorio.obtenerProcesandoPorUsuarioYVentana(usuarioId, ventanaCargaId);
  if (!enCurso) return false;

  const limite = limiteExpiracionProcesamientoCarga(ahora);
  if (enCurso.createdAt >= limite) return true;

  await repositorio.marcarProcesamientosInterrumpidos({ anterioresA: limite, usuarioId, ventanaCargaId });
  return false;
}

// RF-38, parte SÍNCRONA de la subida del notificador (dentro de la petición), de lo más barato a lo más
// caro, y NADA lee el cuerpo hasta haber revalidado asignación, ventana, decisión pendiente,
// autorización de reemplazo y procesamiento en curso. Recibe el archivo en streaming a disco
// (tamaño real, SHA-256, firma), lo mueve a su ubicación definitiva y crea la carga en
// `PROCESANDO`. La validación la hace `procesarCargaArchivo` en segundo plano. Ante cualquier
// rechazo el archivo recibido se elimina.
export async function recibirArchivoCarga(
  datos: DatosRecibirArchivoCarga,
  dependencias: Dependencias,
): Promise<ResultadoRecibirArchivoCarga> {
  const previa = await validarInicioCarga(datos, dependencias);
  if (!previa.ok) return previa;
  const { ventana } = previa;

  if (!datos.cuerpo) return { ok: false, motivo: "ARCHIVO_VACIO" };

  const cargaId = datos.cargaIdReservada ?? crypto.randomUUID();
  const guardado = await dependencias.almacen.guardarTemporal(datos.cuerpo, TAMANO_MAXIMO_ARCHIVO_CARGA, { usuarioId: datos.usuarioId, archivoId: cargaId, excel: true });
  if (!guardado.ok) {
    return { ok: false, motivo: guardado.motivo === "VACIO" ? "ARCHIVO_VACIO" : "ARCHIVO_DEMASIADO_GRANDE" };
  }

  let referenciaVigente = guardado.referenciaTemporal;
  let cargaCreada = false;

  try {
    const tipoContenido = dependencias.detectarTipoContenido(datos.nombreArchivoOriginal, guardado.primerosBytes);
    if (tipoContenido !== TIPO_CONTENIDO_XLSX_CARGA) return { ok: false, motivo: "ARCHIVO_NO_COINCIDE" };

    referenciaVigente = await dependencias.almacen.moverDefinitivo(referenciaVigente, ventana.anio, cargaId, "xlsx");

    const carga = await dependencias.repositorio.crearProcesando({
      id: cargaId,
      formatoExcelId: datos.formatoExcelId,
      ventanaCargaId: ventana.id,
      usuarioId: datos.usuarioId,
      nombreArchivoOriginal: datos.nombreArchivoOriginal,
      tipoContenidoArchivo: tipoContenido,
      rutaArchivo: referenciaVigente,
      tamanoBytes: guardado.tamanoBytes,
      sha256: guardado.sha256,
    });
    cargaCreada = true;

    return { ok: true, carga, tamanoBytes: guardado.tamanoBytes };
  } catch (error) {
    // Cierra la carrera de dos subidas simultáneas que pasaron el chequeo de arriba a la vez.
    if (error instanceof CargaArchivoEnProcesoError) return { ok: false, motivo: "EN_PROCESO" };
    throw error;
  } finally {
    // Sin carga, el archivo (temporal o ya movido) no pertenece a nadie: se elimina.
    if (!cargaCreada) await dependencias.almacen.eliminar(referenciaVigente);
  }
}

export async function validarInicioCarga(datos: DatosRecibirArchivoCarga, dependencias: Dependencias) {
  // El notificador sube solo `.xlsx` desde RF-23: mismo mensaje y motivo que antes.
  if (!esExtensionXlsx(datos.nombreArchivoOriginal)) return { ok: false, motivo: "ARCHIVO_NO_EXCEL" } as const;

  if (datos.tamanoDeclarado !== null && datos.tamanoDeclarado > TAMANO_MAXIMO_ARCHIVO_CARGA) {
    return { ok: false, motivo: "ARCHIVO_DEMASIADO_GRANDE" } as const;
  }

  // `formatoExcelId` del cliente SIEMPRE se valida contra la asignación vigente.
  const asignado = await dependencias.repositorioFormatosExcel.estaAsignadoYActivo(datos.usuarioId, datos.formatoExcelId);
  if (!asignado) return { ok: false, motivo: "FORMATO_NO_ASIGNADO" } as const;

  const formato = await dependencias.repositorioFormatosExcel.obtenerPorId(datos.formatoExcelId);
  if (!formato) return { ok: false, motivo: "FORMATO_NO_ASIGNADO" } as const;

  const ventana = await dependencias.repositorioVentanasCarga.obtenerPorAnioYFormato(datos.anio, datos.formatoExcelId);
  if (!ventana) return { ok: false, motivo: "SIN_VENTANA_ABIERTA" } as const;

  // Reapertura vigente o solicitud de reemplazo aprobada habilitan subir con la ventana vencida,
  // pero NO se consumen aquí: se consumen al finalizar y enviar con éxito.
  const motivoVentana = await resolverVentanaHabilitada(
    { ventana, usuarioId: datos.usuarioId, ahora: datos.ahora },
    { repositorio: dependencias.repositorio, repositorioSolicitudesReemplazo: dependencias.repositorioSolicitudesReemplazo },
  );
  if (motivoVentana) return { ok: false, motivo: motivoVentana } as const;

  const pendienteFinalizada = await dependencias.repositorio.obtenerPendienteFinalizadaPorUsuarioYVentana(
    datos.usuarioId,
    ventana.id,
  );
  if (pendienteFinalizada) return { ok: false, motivo: "CARGA_PENDIENTE_DECISION" } as const;

  // RF-33: solo se verifica; nada se consume al subir.
  const autorizacion = await resolverAutorizacionReemplazo(
    { usuarioId: datos.usuarioId, ventanaCargaId: ventana.id, ahora: datos.ahora },
    { repositorio: dependencias.repositorio, repositorioSolicitudesReemplazo: dependencias.repositorioSolicitudesReemplazo },
  );
  if (!autorizacion.autorizado) return { ok: false, motivo: "REEMPLAZO_NO_AUTORIZADO" } as const;

  if (await resolverProcesamientoEnCurso(datos.usuarioId, ventana.id, datos.ahora, dependencias.repositorio)) {
    return { ok: false, motivo: "EN_PROCESO" } as const;
  }

  return { ok: true as const, ventana };
}
