import {
  ETIQUETA_TIPO_AVISO,
  esEtapaFallaCorreo,
  esTipoAvisoCorreo,
  type EtapaFallaCorreo,
} from "@/infrastructure/logging/catalogoFallasCorreo";

// RF-44: lectura defensiva de una línea de `fallas-correo.txt` para el visor. El archivo es JSON
// escrito por `registrarFallaCorreo()`, pero el visor no confía en su forma: cualquier campo
// ausente o de otro tipo cae a `null` en vez de romper la página.

export type FallaCorreoVista = {
  etapa: EtapaFallaCorreo | null;
  tipoAvisoTexto: string;
  emisor: string | null;
  destinatario: {
    esBuzonCompartido: boolean;
    nombre: string | null;
    rut: string | null;
    email: string | null;
  };
  ventanaNombre: string | null;
  mensajeFalla: string | null;
  correo: { asunto: string; cuerpo: string } | null;
};

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.length > 0 ? valor : null;
}

function objeto(valor: unknown): Record<string, unknown> | null {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null;
}

function leerCorreo(valor: unknown): FallaCorreoVista["correo"] {
  const correo = objeto(valor);
  const asunto = texto(correo?.asunto);
  const cuerpo = texto(correo?.cuerpo);
  return asunto !== null || cuerpo !== null ? { asunto: asunto ?? "", cuerpo: cuerpo ?? "" } : null;
}

export function leerFallaCorreo(campos: Record<string, unknown>): FallaCorreoVista {
  const destinatario = objeto(campos.destinatario);
  const ventana = objeto(campos.ventana);

  return {
    etapa: esEtapaFallaCorreo(campos.etapa) ? campos.etapa : null,
    tipoAvisoTexto: esTipoAvisoCorreo(campos.tipoAviso)
      ? ETIQUETA_TIPO_AVISO[campos.tipoAviso]
      : (texto(campos.tipoAviso) ?? "Aviso desconocido"),
    emisor: texto(campos.emisor),
    destinatario: {
      esBuzonCompartido: destinatario?.tipo === "BUZON_COMPARTIDO",
      nombre: texto(destinatario?.nombre),
      rut: texto(destinatario?.rut),
      email: texto(destinatario?.email),
    },
    ventanaNombre: texto(ventana?.nombre),
    mensajeFalla: texto(campos.mensajeFalla),
    correo: leerCorreo(campos.correo),
  };
}
