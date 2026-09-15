// Sanea el error de un fallo de envío de correo para que pueda registrarse sin filtrar la
// dirección de destino. Los errores de un relay SMTP suelen citar la dirección en su respuesta,
// y esa dirección no puede terminar en `errores.txt`. Se conservan los campos estructurados, que
// son los que permiten diagnosticar, y del texto se borra cualquier cosa con forma de correo.
//
// Lo comparten los dos caminos que envían el enlace: el autoservicio (`RequestPasswordReset`) y
// el admin (`EmitirEnlaceContrasena`). Una sola definición evita que las dos deriven.
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
