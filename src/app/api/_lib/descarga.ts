// RF-38: cabeceras comunes de TODAS las descargas de archivos (cargas del notificador, Bioestadística,
// plantillas de formato y Excel de errores), para que el nombre llegue intacto y ninguna variante
// olvide `nosniff` o `no-store`.

// `filename` ASCII de respaldo para clientes antiguos (fuera de rango → `_`, comillas y barra
// invertida → `'`) y `filename*` (RFC 6266 / 5987, UTF-8 codificado) con el nombre real. Se quitan los
// saltos de línea para que un nombre no pueda inyectar cabeceras. `encodeURIComponent` deja pasar
// `'()*`, que RFC 5987 no admite sin codificar.
export function encabezadoContentDisposition(nombreArchivo: string): string {
  const sinSaltos = nombreArchivo.replace(/[\r\n]/g, "");
  const respaldo = sinSaltos.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "'");
  const codificado = encodeURIComponent(sinSaltos).replace(
    /['()*]/g,
    (caracter) => `%${caracter.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${respaldo}"; filename*=UTF-8''${codificado}`;
}

export type DatosRespuestaDescarga = {
  flujo: ReadableStream<Uint8Array> | Uint8Array;
  tipoContenido: string;
  nombreArchivo: string;
  // Solo si se conoce de antemano (archivo original); una descarga generada no lo declara.
  tamanoBytes?: number;
};

export function respuestaDescarga(datos: DatosRespuestaDescarga): Response {
  const cabeceras: Record<string, string> = {
    "Content-Type": datos.tipoContenido,
    "Content-Disposition": encabezadoContentDisposition(datos.nombreArchivo),
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
  };
  if (datos.tamanoBytes !== undefined) cabeceras["Content-Length"] = String(datos.tamanoBytes);

  const cuerpo = datos.flujo instanceof Uint8Array ? new Uint8Array(datos.flujo) : datos.flujo;
  return new Response(cuerpo, { status: 200, headers: cabeceras });
}
