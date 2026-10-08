// RF-38: detalle de un error apto para `errores.txt` cuando puede venir de `node:fs` o de la lectura de
// un archivo subido: solo su NOMBRE y su CÓDIGO (`ENOENT`, `EACCES`, `P2002`...), nunca el mensaje,
// que en los errores de `fs` lleva rutas del servidor y en otros puede llevar contenido.
export function detalleErrorSeguro(error: unknown): { error: string; codigo?: string } {
  const nombre = error instanceof Error ? error.name : "desconocido";
  const codigo = typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;
  return codigo === undefined ? { error: nombre } : { error: nombre, codigo };
}
