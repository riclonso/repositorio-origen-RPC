import { logger, loggerAuditoria } from "@/infrastructure/logging/logger";

export type AccionAuditoria =
  | "USUARIO_CREADO"
  | "USUARIO_ACTUALIZADO"
  | "USUARIO_ACTIVADO"
  | "USUARIO_DESACTIVADO"
  | "CONTRASENA_RESTABLECIDA"
  | "RECUPERACION_SOLICITADA"
  | "RECUPERACION_COMPLETADA"
  | "FORMATO_EXCEL_CREADO"
  | "FORMATO_EXCEL_ACTUALIZADO"
  | "FORMATO_EXCEL_ESTADO_CAMBIADO"
  | "CARGA_ARCHIVO_REGISTRADA"
  | "CARGA_ARCHIVO_VISTO_BUENO"
  | "VENTANA_CARGA_CREADA"
  | "VENTANA_CARGA_EDITADA"
  | "VENTANA_CARGA_ELIMINADA"
  // Una sola acción para publicar Y despublicar (el nuevo estado va en el campo `publicada` del
  // evento), mismo precedente que `FORMATO_EXCEL_ESTADO_CAMBIADO`, no el patrón de dos acciones
  // de `USUARIO_ACTIVADO`/`USUARIO_DESACTIVADO`.
  | "VENTANA_CARGA_PUBLICACION_CAMBIADA";

// "SIN_EFECTO" no es un rechazo: la petición se aceptó y respondió con normalidad, pero no
// produjo ningún cambio (la cuenta no existía, estaba inactiva, agotó su cupo). Es la única
// forma de dejar registro de un camino que hacia fuera es indistinguible del exitoso.
export type ResultadoAuditoria = "EXITO" | "RECHAZADO" | "SIN_EFECTO";

export type MotivoAuditoria =
  | "DUPLICADO"
  | "NO_ENCONTRADO"
  | "AUTO_OPERACION"
  | "ULTIMO_ADMIN"
  | "SIN_PERMISO"
  | "CUENTA_INEXISTENTE"
  | "CUENTA_INACTIVA"
  | "LIMITE_ALCANZADO"
  | "LIMITE_IP"
  | "TOKEN_INVALIDO"
  | "ENVIO_FALLIDO"
  | "SIN_CONFIGURACION"
  // Archivo de plantilla rechazado (extensión/tipo o tamaño), específico de `FORMATO_EXCEL_CREADO`.
  | "ARCHIVO_INVALIDO"
  // Específicos de `CARGA_ARCHIVO_REGISTRADA`: el formato elegido no está asignado y activo para
  // el actor.
  | "FORMATO_NO_ASIGNADO"
  // Específico de `CARGA_ARCHIVO_REGISTRADA` (RF-15): no existe ventana de carga abierta para el
  // año elegido.
  | "SIN_VENTANA_ABIERTA"
  // Específicos de `CARGA_ARCHIVO_VISTO_BUENO`: la carga tiene errores o ya fue aprobada antes.
  | "CARGA_CON_ERRORES"
  | "YA_APROBADA"
  // Específicos de `VENTANA_CARGA_CREADA`: ya existe una ventana para ese año.
  | "ANIO_DUPLICADO"
  // De `VENTANA_CARGA_CREADA`/`VENTANA_CARGA_EDITADA`: las fechas no caen dentro del año de la
  // ventana, o `fechaVencimiento` no es posterior a `fechaApertura`.
  | "RANGO_INVALIDO"
  // De `VENTANA_CARGA_CREADA`/`VENTANA_CARGA_EDITADA`: el `formatoExcelId` recibido no existe o no
  // está activo.
  | "FORMATO_INVALIDO"
  // De `VENTANA_CARGA_EDITADA`/`VENTANA_CARGA_PUBLICACION_CAMBIADA`: la ventana ya fue eliminada
  // (lógicamente) y no se pueden editar sus fechas/tipo ni cambiar su publicación.
  | "VENTANA_ELIMINADA"
  // Específico de `CARGA_ARCHIVO_REGISTRADA` (RF-15 ampliación): la ventana existe y está
  // abierta, pero no fue publicada.
  | "VENTANA_NO_PUBLICADA";

// Ningún campo de este evento admite contraseñas, hashes, fragmentos ni longitudes de
// contraseña: de una operación sobre credenciales solo se registra quién, a quién y cuándo.
// Tampoco admite tokens de recuperación, sus hashes ni la dirección de correo tecleada en un
// formulario público: `auditoria.txt` no debe acumular direcciones de personas que ni siquiera
// son usuarias del sistema.
export type EventoAuditoria = {
  accion: AccionAuditoria;
  resultado: ResultadoAuditoria;
  motivo?: MotivoAuditoria;
  // El actor es anulable porque hay acciones anónimas por definición: quien pide recuperar su
  // contraseña no tiene sesión. `actorTipo` distingue ambos casos sin ambigüedad.
  actorTipo: "SESION" | "ANONIMO";
  actorId: string | null;
  actorRut: string | null;
  actorPerfil: string | null;
  usuarioObjetivoId: string | null;
  usuarioObjetivoRut: string | null;
  campos?: string[];
  // Códigos de perfil, no nombres visibles: si mañana renombran el perfil, el histórico
  // sigue siendo interpretable.
  perfilAnterior?: string;
  perfilNuevo?: string;
  // Ids de `formato_excel` agregados/quitados en una edición de usuario (RF de formatos-excel).
  formatosAgregados?: string[];
  formatosQuitados?: string[];
  // Identifica al formato de archivo cuando la acción es una de `FORMATO_EXCEL_*` o
  // `CARGA_ARCHIVO_*`.
  formatoExcelId?: string | null;
  formatoExcelNombre?: string | null;
  // Específicos de `CARGA_ARCHIVO_*`. Nunca se registra el contenido de las celdas ni el
  // binario, solo estos metadatos.
  cargaArchivoId?: string | null;
  cantidadErrores?: number | null;
  // Específicos de `VENTANA_CARGA_*` (RF-15). Las fechas viajan como ISO string, nunca como
  // `Date`: Winston las serializaría igual, pero como string queda explícito que el log es de
  // solo lectura y no un objeto que alguien pueda mutar antes de escribirse.
  ventanaCargaId?: string | null;
  anio?: number | null;
  fechaApertura?: string | null;
  fechaVencimiento?: string | null;
  // Específico de `VENTANA_CARGA_ELIMINADA`: si la eliminación fue física (sin cargas asociadas)
  // o lógica (con cargas asociadas, ver `eliminadaEn`/`eliminadaPorId` en `VentanaCarga`).
  tipoEliminacionVentana?: "HARD" | "SOFT" | null;
  // Específico de `VENTANA_CARGA_PUBLICACION_CAMBIADA`: nuevo estado tras el cambio.
  publicada?: boolean | null;
  ip: string | null;
  userAgent: string | null;
};

// No se hace await: el transporte de archivo de Winston es fire and forget y bloquear la
// respuesta HTTP por una escritura a disco no aporta nada. Un fallo al escribir el log jamás
// puede tumbar la petición, por eso el try/catch.
export function registrarAuditoria(evento: EventoAuditoria): void {
  try {
    loggerAuditoria.info("auditoria", evento);
  } catch (error) {
    logger.error("Error al registrar evento de auditoría", {
      accion: evento.accion,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
