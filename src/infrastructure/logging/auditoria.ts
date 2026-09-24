import { logger, loggerAuditoria } from "@/infrastructure/logging/logger";

export type AccionAuditoria =
  | "USUARIO_CREADO"
  | "USUARIO_ACTUALIZADO"
  | "USUARIO_ACTIVADO"
  | "USUARIO_DESACTIVADO"
  // El administrador emitió un enlace de contraseña (al crear, al restablecer o al reenviar).
  | "ENLACE_CONTRASENA_ENVIADO"
  // El administrador fija MANUALMENTE la contraseña de un tercero (RF-16, segunda opción junto a
  // `ENLACE_CONTRASENA_ENVIADO`): `PUT /api/usuarios/[id]/contrasena`. Nota histórica: un
  // comentario anterior en este archivo decía que esta acción "ya no se emite" — eso describía un
  // estado intermedio del proyecto anterior a RF-16, que reintrodujo el fijado manual como
  // alternativa al enlace; el comentario quedó desactualizado y se corrige aquí. Distinta de
  // `CONTRASENA_PROPIA_ACTUALIZADA` (la propia persona cambia su contraseña).
  | "CONTRASENA_RESTABLECIDA"
  // La propia persona cambia su contraseña desde "Mi perfil" (autoservicio, `PUT
  // /api/cuenta/contrasena`), a diferencia de `CONTRASENA_RESTABLECIDA` (un administrador la fija
  // para un tercero). `actorId === usuarioObjetivoId` siempre, por construcción.
  | "CONTRASENA_PROPIA_ACTUALIZADA"
  // Desbloqueo manual de una cuenta con bloqueo vigente por intentos fallidos de login, desde el
  // mantenedor de usuarios (`POST /api/usuarios/[id]/desbloqueo`).
  | "CUENTA_DESBLOQUEADA"
  | "RECUPERACION_SOLICITADA"
  | "RECUPERACION_COMPLETADA"
  | "FORMATO_EXCEL_CREADO"
  | "FORMATO_EXCEL_ACTUALIZADO"
  | "FORMATO_EXCEL_ESTADO_CAMBIADO"
  | "CARGA_ARCHIVO_REGISTRADA"
  // Se conserva SOLO para poder leer el histórico anterior a la corrección que elimina la
  // autoaprobación del notificador (era el notificador dueño de la carga aprobándose a sí mismo).
  // No usar en eventos nuevos: reemplazada por `CARGA_ARCHIVO_APROBADA`.
  | "CARGA_ARCHIVO_VISTO_BUENO"
  // El notificador termina de revisar su carga y la envía a decisión de un tercero
  // (ADMIN/REVISOR_REPOSITORIO). No aprueba nada, solo marca `finalizadaEn`.
  | "CARGA_ARCHIVO_FINALIZADA"
  // Un ADMIN/REVISOR_REPOSITORIO aprueba una carga `PENDIENTE_VISTO_BUENO` ya finalizada por el
  // notificador. Reemplaza en USO a `CARGA_ARCHIVO_VISTO_BUENO`.
  | "CARGA_ARCHIVO_APROBADA"
  | "VENTANA_CARGA_CREADA"
  | "VENTANA_CARGA_EDITADA"
  | "VENTANA_CARGA_ELIMINADA"
  // Una sola acción para publicar Y despublicar (el nuevo estado va en el campo `publicada` del
  // evento), mismo precedente que `FORMATO_EXCEL_ESTADO_CAMBIADO`, no el patrón de dos acciones
  // de `USUARIO_ACTIVADO`/`USUARIO_DESACTIVADO`.
  | "VENTANA_CARGA_PUBLICACION_CAMBIADA"
  // Una sola acción para archivar Y desarchivar (el nuevo estado va en el campo `archivada` del
  // evento), mismo criterio que `VENTANA_CARGA_PUBLICACION_CAMBIADA`: un solo evento por
  // operación, aunque internamente también se toque `publicada`.
  | "VENTANA_CARGA_ARCHIVO_CAMBIADO"
  // RF-17 (alertas por email). Los envíos AUTOMÁTICOS del scheduler NUNCA se auditan aquí (la
  // tabla `alerta_notificacion_ventana` ya es su registro estructurado); solo estas cuatro
  // acciones, disparadas por un ADMIN/REVISOR_REPOSITORIO desde el panel.
  | "VENTANA_CARGA_ALERTAS_CONFIGURADAS"
  | "VENTANA_CARGA_PLANTILLA_ALERTA_ACTUALIZADA"
  | "VENTANA_CARGA_ALERTA_MASIVA_ENVIADA"
  | "VENTANA_CARGA_ALERTA_INDIVIDUAL_ENVIADA"
  // Un notificador solicita reemplazar una de sus cargas ya APROBADA.
  | "SOLICITUD_REEMPLAZO_CREADA"
  // Una sola acción para aprobar Y rechazar (el nuevo estado va en el campo `estadoSolicitud` del
  // evento), mismo precedente que `VENTANA_CARGA_PUBLICACION_CAMBIADA`.
  | "SOLICITUD_REEMPLAZO_REVISADA"
  // Rechazo unilateral (sin solicitud previa) de una carga ya `APROBADA` por un
  // ADMIN/REVISOR_REPOSITORIO. Habilita una reapertura para que el notificador afectado vuelva a
  // subir un archivo para esa combinación (formato, ventana).
  | "CARGA_ARCHIVO_RECHAZADA";

// "SIN_EFECTO" no es un rechazo: la petición se aceptó y respondió con normalidad, pero no
// produjo ningún cambio (la cuenta no existía, estaba inactiva, agotó su cupo). Es la única
// forma de dejar registro de un camino que hacia fuera es indistinguible del exitoso.
export type ResultadoAuditoria = "EXITO" | "RECHAZADO" | "SIN_EFECTO";

// El `motivo` de `ENLACE_CONTRASENA_ENVIADO` tiene DOBLE SENTIDO según el `resultado`:
//  - en EXITO nombra el DISPARADOR: CREACION (alta), REESTABLECIMIENTO (la cuenta ya tenía
//    contraseña) o REENVIO (cuenta pendiente a la que se le reenvía el enlace);
//  - en RECHAZADO / SIN_EFECTO nombra la CAUSA: SIN_CONFIGURACION, ENVIO_FALLIDO,
//    CUENTA_INACTIVA, NO_ENCONTRADO o SIN_PERMISO.
// El `motivo` de `RECUPERACION_COMPLETADA` en EXITO es ACTIVACION cuando el hash previo era nulo
// (una cuenta pendiente que se activó); una recuperación normal va sin motivo, como antes.
export type MotivoAuditoria =
  | "DUPLICADO"
  | "NO_ENCONTRADO"
  | "AUTO_OPERACION"
  | "ULTIMO_ADMIN"
  | "SIN_PERMISO"
  // Actor con acceso al mantenedor (ADMIN o REVISOR_REPOSITORIO) pero sin perfil ADMIN, que
  // intenta crear, editar, activar/desactivar, restablecer la contraseña o reenviar el enlace de
  // una cuenta ADMIN, o asignar el perfil ADMIN a cualquier cuenta (incluida la propia). Distinto
  // de `SIN_PERMISO`: ese motivo es "no tiene acceso al mantenedor en absoluto", este es "tiene
  // acceso pero no a este objetivo/valor de perfil".
  | "PERFIL_ADMIN_RESTRINGIDO"
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
  // Específicos de `CARGA_ARCHIVO_VISTO_BUENO` (histórico, ya no se emiten): la carga tenía errores
  // o ya había sido aprobada antes.
  | "CARGA_CON_ERRORES"
  | "YA_APROBADA"
  // De `CARGA_ARCHIVO_APROBADA`: la carga no existe, no está `PENDIENTE_VISTO_BUENO`, o el
  // notificador todavía no la finalizó y envió (`finalizadaEn` nulo).
  | "NO_PENDIENTE"
  // De `CARGA_ARCHIVO_REGISTRADA` (corrección: fin de la autoaprobación): ya existe, para esta
  // combinación (formato, ventana), una carga finalizada y todavía sin decidir.
  | "CARGA_PENDIENTE_DECISION"
  // Específicos de `VENTANA_CARGA_CREADA`: ya existe una ventana para ese año.
  | "ANIO_DUPLICADO"
  // De `VENTANA_CARGA_CREADA`/`VENTANA_CARGA_EDITADA`: `fechaVencimiento` no es posterior a
  // `fechaApertura`.
  | "RANGO_INVALIDO"
  // De `VENTANA_CARGA_CREADA`/`VENTANA_CARGA_EDITADA`: el `formatoExcelId` recibido no existe o no
  // está activo.
  | "FORMATO_INVALIDO"
  // De `VENTANA_CARGA_EDITADA`/`VENTANA_CARGA_PUBLICACION_CAMBIADA`: la ventana ya fue eliminada
  // (lógicamente) y no se pueden editar sus fechas/tipo ni cambiar su publicación.
  | "VENTANA_ELIMINADA"
  // Específico de `CARGA_ARCHIVO_REGISTRADA` (RF-15 ampliación): la ventana existe y está
  // abierta, pero no fue publicada.
  | "VENTANA_NO_PUBLICADA"
  // De `VENTANA_CARGA_PUBLICACION_CAMBIADA`: se intentó ACTIVAR la publicación de una ventana
  // archivada. Despublicar una archivada sigue permitido, así que este motivo solo aplica cuando
  // se intenta publicar.
  | "VENTANA_ARCHIVADA"
  // De `VENTANA_CARGA_PLANTILLA_ALERTA_ACTUALIZADA`: el HTML sanitizado contiene un placeholder
  // no reconocido (fuera de `PLACEHOLDERS_PERMITIDOS ∪ {"enlaceSistema"}`).
  | "PLACEHOLDER_INVALIDO"
  // De `VENTANA_CARGA_ALERTA_MASIVA_ENVIADA`: no hay ningún notificador pendiente al momento del
  // envío (no es un error de negocio grave, pero tampoco genera un lote vacío).
  | "SIN_PENDIENTES"
  // De `VENTANA_CARGA_ALERTA_INDIVIDUAL_ENVIADA`: el `usuarioId` recibido ya no está en la lista
  // real de pendientes de esa ventana al momento de revalidar en el servidor.
  | "DESTINATARIO_NO_PENDIENTE"
  // De `SOLICITUD_REEMPLAZO_CREADA`: ya existe una solicitud `PENDIENTE` para esa misma carga.
  | "SOLICITUD_DUPLICADA"
  // De `SOLICITUD_REEMPLAZO_REVISADA`: la solicitud ya no estaba `PENDIENTE` (otro revisor la
  // resolvió antes).
  | "SOLICITUD_YA_RESUELTA"
  // De `SOLICITUD_REEMPLAZO_CREADA`: ya existe una solicitud `APROBADA` y todavía utilizable para
  // esa misma carga.
  | "SOLICITUD_YA_APROBADA_VIGENTE"
  // De `SOLICITUD_REEMPLAZO_CREADA`: la carga existe y es del actor, pero ya fue reemplazada por
  // una carga posterior (no es la vigente de su combinación formato/ventana).
  | "NO_ES_VIGENTE"
  // De `CARGA_ARCHIVO_REGISTRADA`: existe una carga APROBADA vigente para esa combinación
  // (formato, ventana) y no hay ninguna solicitud de reemplazo aprobada y vigente que autorice la
  // subida.
  | "REEMPLAZO_NO_AUTORIZADO"
  // Se conserva SOLO para leer el histórico anterior a la ampliación de `CARGA_ARCHIVO_RECHAZADA`
  // a cargas `PENDIENTE_VISTO_BUENO` finalizadas. No usar en eventos nuevos: reemplazado por
  // `NO_RECHAZABLE`.
  | "NO_APROBADA"
  // De `CARGA_ARCHIVO_RECHAZADA`: la carga existe pero no está en un estado rechazable (ni
  // `APROBADA` ni `PENDIENTE_VISTO_BUENO` ya finalizada).
  | "NO_RECHAZABLE"
  // Doble sentido (ver comentario arriba): en EXITO son disparadores de `ENLACE_CONTRASENA_ENVIADO`
  // y `ACTIVACION` el de `RECUPERACION_COMPLETADA` sobre una cuenta pendiente.
  | "CREACION"
  | "REESTABLECIMIENTO"
  | "REENVIO"
  | "ACTIVACION"
  // De `CONTRASENA_PROPIA_ACTUALIZADA` (rechazo): la contraseña actual ingresada no coincide con
  // la almacenada (o la cuenta, por alguna razón, no tiene contraseña que comparar — mismo motivo
  // por anti-enumeración, ver `cambiarContrasenaPropia`).
  | "CONTRASENA_ACTUAL_INCORRECTA"
  // De `CONTRASENA_PROPIA_ACTUALIZADA` (rechazo): la nueva contraseña coincide con la actual.
  | "CONTRASENA_IGUAL_A_ACTUAL";

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
  // Específico de `CARGA_ARCHIVO_RECHAZADA` (ampliación RF-20): de qué estado venía la carga al
  // momento de rechazarla, para que el histórico distinga ambos orígenes sin ambigüedad.
  estadoOrigenRechazo?: "PENDIENTE_VISTO_BUENO" | "APROBADA" | null;
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
  // Específico de `VENTANA_CARGA_ARCHIVO_CAMBIADO`: nuevo estado tras el cambio. `publicada`
  // (arriba) también viaja en este evento con su valor resultante, para que el histórico refleje
  // el efecto secundario de despublicación sin necesidad de un segundo evento.
  archivada?: boolean | null;
  // Específicos de RF-17 (alertas por email). `diasAnticipacionInicio`/`intervaloRepeticionDias`:
  // nuevo estado tras `VENTANA_CARGA_ALERTAS_CONFIGURADAS`. `loteId`/`destinatarioId`/
  // `cantidadExitos` (`cantidadErrores` ya existe arriba, reutilizado): resultado de un envío
  // masivo o individual. Nunca se registra el HTML del mensaje ni la plantilla completa, solo
  // estos metadatos.
  diasAnticipacionInicio?: number | null;
  intervaloRepeticionDias?: number | null;
  loteId?: string | null;
  destinatarioId?: string | null;
  cantidadExitos?: number | null;
  // Específicos de `SOLICITUD_REEMPLAZO_*`. `estadoSolicitud` es el desenlace de la revisión
  // (APROBADA/RECHAZADA), mismo criterio que `publicada`/`archivada` arriba: un solo evento por
  // operación, con el resultado en un campo, no una acción por resultado. Nunca se audita el texto
  // libre de `motivo` (de la solicitud) ni de `comentarioRevision`, mismo criterio que no auditar
  // contenido de celdas ni contraseñas: solo metadatos estructurados.
  solicitudReemplazoId?: string | null;
  estadoSolicitud?: "APROBADA" | "RECHAZADA" | null;
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
