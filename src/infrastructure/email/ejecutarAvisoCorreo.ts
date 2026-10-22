import {
  registrarFallaCorreo,
  type DestinatarioFallaCorreo,
  type ReferenciasFallaCorreo,
  type TipoAvisoCorreo,
  type VentanaFallaCorreo,
} from "@/infrastructure/logging/fallasCorreo";

// RF-44: plantilla de los avisos de UN destinatario que se disparan desde `after()` (aprobación al
// notificador, rechazo, resultados de solicitudes de reemplazo). Separa las tres etapas para que
// cada falla quede registrada con su motivo correcto en `fallas-correo.txt`:
//   1. Sin SMTP configurado → SIN_CONFIGURACION, sin consultar nada.
//   2. `preparar()` lanza (BD al buscar al destinatario, etc.) → PREPARACION.
//   3. `enviar()` lanza → ENVIO, con el destinatario ya resuelto.
// `preparar()` devuelve `null` cuando no corresponde avisar (cuenta inexistente): no es una falla.
// Nunca lanza: la escritura que originó el aviso ya quedó persistida.
export type AvisoCorreoUnico<T> = {
  tipoAviso: TipoAvisoCorreo;
  ventana?: VentanaFallaCorreo | null;
  referencias?: ReferenciasFallaCorreo;
  // Lo que se sabe del destinatario sin consultar nada (para SIN_CONFIGURACION y PREPARACION).
  destinatarioConocido?: DestinatarioFallaCorreo | null;
  disponible(): boolean;
  preparar(): Promise<T | null>;
  destinatarioDe(preparado: T): DestinatarioFallaCorreo;
  enviar(preparado: T): Promise<void>;
};

export async function ejecutarAvisoCorreo<T>(aviso: AvisoCorreoUnico<T>): Promise<void> {
  const contexto = {
    tipoAviso: aviso.tipoAviso,
    ventana: aviso.ventana ?? null,
    referencias: aviso.referencias ?? {},
  };

  if (!aviso.disponible()) {
    registrarFallaCorreo({ ...contexto, etapa: "SIN_CONFIGURACION", destinatario: aviso.destinatarioConocido ?? null });
    return;
  }

  let preparado: T | null;

  try {
    preparado = await aviso.preparar();
  } catch (error) {
    registrarFallaCorreo({
      ...contexto,
      etapa: "PREPARACION",
      destinatario: aviso.destinatarioConocido ?? null,
      error,
    });
    return;
  }

  if (preparado === null) return;

  try {
    await aviso.enviar(preparado);
  } catch (error) {
    registrarFallaCorreo({ ...contexto, etapa: "ENVIO", destinatario: aviso.destinatarioDe(preparado), error });
  }
}
