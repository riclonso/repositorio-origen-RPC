// RF-32: detector puro de contenido HTML en el texto de una celda (regla `CONTENIDO_HTML`). Es
// una regla de CALIDAD DE DATOS (texto pegado desde una web, Word u Outlook), no una defensa
// XSS: React ya escapa al mostrar y ni el informe de errores ni los logs incluyen el contenido de
// la celda. Mantener ese principio: nunca devolver ni registrar el texto evaluado.
//
// Qué se considera HTML (basta que coincida uno de los tres patrones, sin distinguir mayúsculas):
// 1. Etiqueta de apertura, cierre o autocierre cuyo nombre sea un elemento HTML estándar de la
//    lista cerrada de abajo, o tenga un prefijo de Office de la lista cerrada (`<o:p>`, `<w:sdt>`,
//    `<st1:place>`, típicos de Word/Outlook). Las listas cerradas, en vez de "cualquier palabra",
//    evitan falsos positivos con texto clínico como `<sin dato>`, `<NA>`, `<desconocido>` o la
//    notación TNM (`<T1:N0>`, `<pT2:N1>`).
// 2. Comentario (`<!--`…`-->`), declaración `<!doctype` o instrucción `<?xml`.
// 3. Entidad con nombre (`&nbsp;`), decimal (`&#39;`) o hexadecimal (`&#x27;`), con `;` final
//    OBLIGATORIO: así "R&D", "Hospital A & B" o "AT&T" no coinciden.
//
// Un `<` suelto ("<5 años", "a < b", "3 <> 4") se permite. Falsos positivos conocidos y
// aceptados (improbables en datos del registro de cáncer):
// - "a<b y c>d" (`b` es un elemento válido seguido de espacio y luego un `>`).
// - "edad <a 18 y >65" y "talla <p 3 y >p 97" (mismo caso, con `a` y `p`).
// - Entidades inventadas con forma de entidad, como "Juan&Pedro;": no se valida contra la lista
//   real de entidades HTML.
//
// Sin riesgo de ReDoS: el tramo de atributos es la clase negada `[^<>]*`, que se detiene en el
// siguiente `<` o `>`, así que cada intento queda acotado por la distancia al siguiente `<` y el
// costo total es lineal en el largo del texto. Las entidades usan cuantificadores acotados.

const ELEMENTOS_HTML = [
  "a", "abbr", "address", "area", "article", "aside", "audio", "b", "base", "bdi", "bdo", "big",
  "blockquote", "body", "br", "button", "canvas", "caption", "center", "cite", "code", "col",
  "colgroup", "data", "datalist", "dd", "del", "details", "dfn", "dialog", "div", "dl", "dt", "em",
  "embed", "fieldset", "figcaption", "figure", "font", "footer", "form", "frame", "frameset", "h1",
  "h2", "h3", "h4", "h5", "h6", "head", "header", "hgroup", "hr", "html", "i", "iframe", "img",
  "input", "ins", "kbd", "label", "legend", "li", "link", "main", "map", "mark", "marquee", "math",
  "menu", "meta", "meter", "nav", "nobr", "noscript", "object", "ol", "optgroup", "option",
  "output", "p", "param", "picture", "pre", "progress", "q", "rp", "rt", "ruby", "s", "samp",
  "script", "search", "section", "select", "slot", "small", "source", "span", "strike", "strong",
  "style", "sub", "summary", "sup", "svg", "table", "tbody", "td", "template", "textarea",
  "tfoot", "th", "thead", "time", "title", "tr", "track", "tt", "u", "ul", "var", "video", "wbr",
  "xml",
] as const;

// Prefijos de espacio de nombres de Office (lista cerrada): `o:` Office, `w:` Word, `v:` VML,
// `m:` fórmulas, `x:` Excel y `st1:`…`st9:` smart tags. Una lista abierta (`cualquiera:algo`)
// marcaba como HTML la notación TNM de oncología (`<T1:N0>`, `<pT2:N1>`).
const PREFIJOS_OFFICE = "(?:o|w|v|m|x|st[0-9])";

// Nombre de etiqueta en la lista cerrada, o con prefijo de Office (`prefijo:nombre`).
const NOMBRE_ETIQUETA = `(?:${ELEMENTOS_HTML.join("|")}|${PREFIJOS_OFFICE}:[a-z][a-z0-9-]*)`;

// `<` + `/` opcional + nombre + (`>` | `/>` | espacio seguido de atributos sin `<` ni `>` hasta
// `>` | `/` seguido de un atributo con `=`). La última rama cubre `<svg/onload=1>` sin marcar
// unidades o abreviaturas como `<u/l>`, `<s/n>` o `<i/o>`. Su primera clase excluye `=` a
// propósito: dos clases solapadas seguidas (`[^<>]*=[^<>]*`) harían la búsqueda cuadrática.
const PATRON_ETIQUETA = new RegExp(
  `<\\/?${NOMBRE_ETIQUETA}(?:\\s*\\/?>|\\s[^<>]*>|\\/[^<>=]*=[^<>]*>)`,
  "i",
);
// `<!doctype` y la instrucción de procesamiento `<?xml` (incluido `<?xml:namespace …>` de Office).
const PATRON_DECLARACION = /<(?:!doctype|\?xml)/i;
const PATRON_ENTIDAD = /&(?:[a-z][a-z0-9]{1,31}|#[0-9]{1,7}|#x[0-9a-f]{1,6});/i;

// Comentario `<!--`…`-->` con `indexOf` en vez de una regex perezosa: `<!--[\s\S]*?-->` sería
// cuadrática ante miles de `<!--` sin cierre.
function contieneComentarioHtml(texto: string): boolean {
  const inicio = texto.indexOf("<!--");
  return inicio >= 0 && texto.indexOf("-->", inicio + 4) >= 0;
}

export function contieneHtml(texto: string): boolean {
  // Filtro barato: casi todas las celdas no traen `<` ni `&`, y un archivo puede tener hasta
  // 20.000 filas × 500 columnas.
  if (!texto.includes("<") && !texto.includes("&")) return false;

  return (
    PATRON_ETIQUETA.test(texto) ||
    contieneComentarioHtml(texto) ||
    PATRON_DECLARACION.test(texto) ||
    PATRON_ENTIDAD.test(texto)
  );
}
