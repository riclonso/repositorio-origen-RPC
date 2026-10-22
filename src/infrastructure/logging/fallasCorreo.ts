import { configSmtp, variablesSmtpFaltantes } from "@/infrastructure/config/env";
import { correoFallidoDe, ocultarTokens, reemplazarEnlaces } from "@/infrastructure/email/correoFallido";
import {
  ETIQUETA_ETAPA_FALLA,
  ETIQUETA_TIPO_AVISO,
  nombreVentanaCarga,
  type EtapaFallaCorreo,
  type TipoAvisoCorreo,
} from "@/infrastructure/logging/catalogoFallasCorreo";
import { logger, loggerFallasCorreo } from "@/infrastructure/logging/logger";

// RF-44: registro de fallas de envío de correo de TODO el sistema (`logs/fallas-correo.txt`).
// Node-only: solo se invoca desde Route Handlers, callbacks de `after()` y el scheduler, nunca
// desde `domain/` ni `application/` (los casos de uso devuelven el fallo y quien los llama lo
// registra aquí).
//
// La regla de enrutamiento vive SOLO aquí, no en cada punto de envío:
//   - ENVIO y SIN_CONFIGURACION → solo `fallas-correo.txt`.
//   - PREPARACION → `fallas-correo.txt` y además `errores.txt` con el detalle técnico, porque es
//     una excepción del sistema (BD, conteo) y no un rechazo del relay.
//
// Visible solo para ADMIN en `/dashboard/logs`. Por decisión explícita la entrada lleva nombre,
// RUT y correo del destinatario, el mensaje COMPLETO del error SMTP y el cuerpo en texto plano del
// correo. Nunca lleva contraseñas, tokens, hashes ni contenido de un chat: todo enlace del cuerpo
// se reemplaza por "[enlace]" (el de recuperación lleva un token que permite fijar la contraseña).

export {
  ETIQUETA_ETAPA_FALLA,
  ETIQUETA_TIPO_AVISO,
  nombreVentanaCarga,
  type EtapaFallaCorreo,
  type TipoAvisoCorreo,
};

export type DestinatarioFallaCorreo =
  | { tipo: "USUARIO"; usuarioId?: string; nombre?: string; rut?: string; email?: string }
  | { tipo: "BUZON_COMPARTIDO"; email?: string };

export type VentanaFallaCorreo = { ventanaCargaId: string; nombre: string | null };

export type ReferenciasFallaCorreo = {
  cargaArchivoId?: string;
  mensajeCargaId?: string;
  solicitudReemplazoId?: string;
  solicitudReemplazoBioestadisticaId?: string;
  loteId?: string;
  // Id de la FILA del token, nunca el secreto.
  tokenId?: string;
  disparador?: "CREACION" | "REESTABLECIMIENTO" | "REENVIO";
  modalidad?: "AUTOMATICA" | "MANUAL_MASIVA" | "MANUAL_INDIVIDUAL";
};

export type EntradaFallaCorreo = {
  tipoAviso: TipoAvisoCorreo;
  etapa: EtapaFallaCorreo;
  destinatario?: DestinatarioFallaCorreo | null;
  ventana?: VentanaFallaCorreo | null;
  referencias?: ReferenciasFallaCorreo;
  // ENVIO / PREPARACION: lo capturado. En SIN_CONFIGURACION se ignora.
  error?: unknown;
};

// Lo que se escribe en cada línea (Winston agrega `timestamp`).
export type RegistroFallaCorreo = {
  tipoAviso: TipoAvisoCorreo;
  etapa: EtapaFallaCorreo;
  emisor: string | null;
  destinatario: {
    tipo: "USUARIO" | "BUZON_COMPARTIDO" | null;
    usuarioId?: string;
    nombre?: string;
    rut?: string;
    email?: string;
  };
  ventana: VentanaFallaCorreo | null;
  referencias: ReferenciasFallaCorreo;
  mensajeFalla: string;
  correo: { asunto: string; cuerpo: string } | null;
};

export type DependenciasRegistroFallasCorreo = {
  escribirFalla(registro: RegistroFallaCorreo): void;
  escribirError(mensaje: string, campos: Record<string, unknown>): void;
  remitente(): string | null;
  variablesFaltantes(): string[];
};

const MENSAJE_LOG_FALLA = "falla_envio_correo";

// Ventana de carga del aviso, nombrada por su formato y año (no tiene nombre propio).
export function ventanaFallaCorreo(datos: {
  ventanaCargaId: string;
  formatoExcelNombre: string;
  anio: number;
}): VentanaFallaCorreo {
  return { ventanaCargaId: datos.ventanaCargaId, nombre: nombreVentanaCarga(datos.formatoExcelNombre, datos.anio) };
}

// Destinatario persona a partir de lo que tenga a mano el punto de envío.
export function destinatarioUsuario(usuario: {
  id?: string;
  nombres?: string;
  apellidos?: string;
  rut?: string;
  email?: string;
}): DestinatarioFallaCorreo {
  const nombre = [usuario.nombres, usuario.apellidos].filter(Boolean).join(" ").trim();

  return {
    tipo: "USUARIO",
    ...(usuario.id ? { usuarioId: usuario.id } : {}),
    ...(nombre ? { nombre } : {}),
    ...(usuario.rut ? { rut: usuario.rut } : {}),
    ...(usuario.email ? { email: usuario.email } : {}),
  };
}

// Avisos cuya preparación toca tokens de contraseña (emisión, `tokenHash`): el mensaje de un error de
// Prisma puede arrastrar los parámetros de la consulta. Para ellos, en PREPARACION solo se registra
// el nombre y el código del error, mismo criterio que el catch-all de `recuperacion/route.ts` (RF-10).
const AVISOS_CON_TOKEN: ReadonlySet<TipoAvisoCorreo> = new Set(["ENLACE_RECUPERACION", "ENLACE_CONTRASENA_ADMIN"]);

function describirErrorTecnico(error: unknown, tipoAviso: TipoAvisoCorreo): string {
  if (!(error instanceof Error)) {
    return AVISOS_CON_TOKEN.has(tipoAviso) ? "ErrorDesconocido" : ocultarTokens(String(error));
  }

  if (AVISOS_CON_TOKEN.has(tipoAviso)) {
    const codigo = (error as Error & { code?: unknown }).code;
    return typeof codigo === "string" ? `${error.name} (code=${codigo})` : error.name;
  }

  return ocultarTokens(`${error.name}: ${error.message}`);
}

function mensajeFallaDe(entrada: EntradaFallaCorreo, variablesFaltantes: () => string[]): string {
  if (entrada.etapa === "SIN_CONFIGURACION") {
    const faltantes = variablesFaltantes();
    return faltantes.length > 0
      ? `El envío de correo no está configurado. Variables faltantes: ${faltantes.join(", ")}`
      : "El envío de correo no está configurado";
  }

  if (entrada.etapa === "PREPARACION") return describirErrorTecnico(entrada.error, entrada.tipoAviso);

  // ENVIO: el mensaje completo del relay, sin sanear (decisión explícita; visible solo para ADMIN),
  // salvo el valor de un eventual `token=`, que se oculta siempre.
  return ocultarTokens(entrada.error instanceof Error ? entrada.error.message : String(entrada.error));
}

function destinatarioDe(
  entrada: EntradaFallaCorreo,
  emailIntentado: string | null,
): RegistroFallaCorreo["destinatario"] {
  const base = entrada.destinatario ?? null;

  if (!base) {
    return emailIntentado ? { tipo: null, email: emailIntentado } : { tipo: null };
  }

  const email = base.email ?? emailIntentado ?? undefined;
  return { ...base, ...(email ? { email } : {}) };
}

// Arma la línea a escribir a partir de lo que conoce el punto de envío. Pura y exportada para
// probarla sin escribir archivos.
export function construirRegistroFallaCorreo(
  entrada: EntradaFallaCorreo,
  dependencias: Pick<DependenciasRegistroFallasCorreo, "remitente" | "variablesFaltantes">,
): RegistroFallaCorreo {
  const correo = entrada.etapa === "SIN_CONFIGURACION" ? null : correoFallidoDe(entrada.error);

  return {
    tipoAviso: entrada.tipoAviso,
    etapa: entrada.etapa,
    emisor: dependencias.remitente(),
    destinatario: destinatarioDe(entrada, correo?.para ?? null),
    ventana: entrada.ventana ?? null,
    referencias: entrada.referencias ?? {},
    mensajeFalla: mensajeFallaDe(entrada, dependencias.variablesFaltantes),
    correo: correo
      ? { asunto: reemplazarEnlaces(correo.asunto), cuerpo: reemplazarEnlaces(correo.texto) }
      : null,
  };
}

export function crearRegistradorFallasCorreo(
  dependencias: DependenciasRegistroFallasCorreo,
): (entrada: EntradaFallaCorreo) => void {
  return (entrada) => {
    // Registrar una falla NUNCA debe convertirse en otra falla: este helper corre en `after()`, en
    // el scheduler y en caminos de error, donde una excepción nueva taparía la original.
    try {
      dependencias.escribirFalla(construirRegistroFallaCorreo(entrada, dependencias));

      if (entrada.etapa === "PREPARACION") {
        dependencias.escribirError("Error al preparar un aviso por correo", {
          tipoAviso: entrada.tipoAviso,
          ventanaCargaId: entrada.ventana?.ventanaCargaId,
          referencias: entrada.referencias ?? {},
          error: describirErrorTecnico(entrada.error, entrada.tipoAviso),
        });
      }
    } catch {
      // Sin salida posible: si ni siquiera se puede escribir el log, no hay dónde avisar.
    }
  };
}

export const registrarFallaCorreo = crearRegistradorFallasCorreo({
  escribirFalla: (registro) => {
    loggerFallasCorreo.info(MENSAJE_LOG_FALLA, registro);
  },
  escribirError: (mensaje, campos) => {
    logger.error(mensaje, campos);
  },
  remitente: () => configSmtp?.remitente ?? null,
  variablesFaltantes: variablesSmtpFaltantes,
});
