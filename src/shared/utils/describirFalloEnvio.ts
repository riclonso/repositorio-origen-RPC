// Los errores de un relay SMTP suelen citar la dirección de destino en su respuesta, y esa
// dirección no puede terminar en `errores.txt` ni en `alerta_notificacion_ventana.detalleError`.
// Se conservan los campos estructurados, que son los que permiten diagnosticar, y del texto se
// borra cualquier cosa con forma de correo.
//
// Vivía como función privada de `modules/auth/application/use-cases/RequestPasswordReset.ts`
// (RF-10); se centraliza aquí porque ahora también la usa `modules/ventanas-carga/application/`
// (envío automático y manual de alertas) y `application/` de un módulo no debe importar un
// caso de uso de otro módulo.
export function describirFalloEnvio(error: unknown): string {
  if (!(error instanceof Error)) {
    return "error desconocido";
  }

  const detalle = error as Error & {
    code?: string;
    responseCode?: number;
    command?: string;
  };

  const partes = [
    detalle.code ? `code=${detalle.code}` : null,
    detalle.responseCode ? `responseCode=${detalle.responseCode}` : null,
    detalle.command ? `command=${detalle.command}` : null,
    detalle.message
      ? `mensaje=${detalle.message.replace(/[^\s<>@]+@[^\s<>@]+/g, "[correo]").slice(0, 300)}`
      : null,
  ];

  return partes.filter(Boolean).join(" | ") || "sin detalle";
}
