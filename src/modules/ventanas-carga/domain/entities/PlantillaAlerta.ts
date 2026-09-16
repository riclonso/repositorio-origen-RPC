import sanitizeHtml from "sanitize-html";
import { escaparHtml } from "@/shared/utils/escaparHtml";

// RF-17: plantilla HTML editable del correo de alerta a notificadores que no han reportado su
// archivo. Las dos etapas de sanitización (guardado / envío) son defensa en profundidad, ver
// `sanitizarPlantillaAlertaHtml`/`sanitizarMensajeResueltoHtml` más abajo.

export const PLACEHOLDERS_PERMITIDOS = ["nombreUsuario", "diasRestantes", "formatoArchivo", "anio"] as const;
export const MARCADOR_ENLACE_SISTEMA = "{{enlaceSistema}}";

export const PLANTILLA_ALERTA_POR_DEFECTO_HTML = `<p>Hola {{nombreUsuario}},</p>
<p>Te recordamos que aún no has reportado tu archivo de tipo <strong>{{formatoArchivo}}</strong> correspondiente al año {{anio}}.</p>
<p>Quedan <strong>{{diasRestantes}}</strong> día(s) para el cierre del período de carga.</p>
<ul>
  <li>Sube tu archivo antes de la fecha de cierre.</li>
</ul>
<p><a href="{{enlaceSistema}}">Ingresa aquí</a> para reportar tu archivo.</p>
<p>Este es un mensaje automático. No respondas a esta dirección.</p>`;

// "span" no es un tag que el editor pueda producir directamente (no hay botón para él en la
// barra): está permitido únicamente porque `transformTags` lo usa como destino de degradación de
// un `<a href>` no autorizado. Si "span" no estuviera en esta lista, `sanitize-html` lo
// descartaría por no estar permitido — y se COMPROBÓ que ese descarte, con dos transformaciones
// de `<a>` en el mismo documento (una a "span" descartada, otra a "a" preservada), deja el HTML
// resultante con las etiquetas de cierre desalineadas entre hermanos (`<a href="...">texto</span>`
// en vez de `</a>`), un defecto de la propia librería con `transformTags` + `disallowedTagsMode` al
// mezclar un tagName permitido y uno descartado sobre el mismo tag de origen. Mantener "span"
// aquí no abre ninguna superficie nueva: sigue sin admitir atributos.
const TAGS_PERMITIDOS = ["p", "br", "b", "strong", "i", "em", "ul", "li", "a", "span"];

// Etapa de GUARDADO (plantilla de la ventana, o mensaje editado en el modal individual antes de
// resolver): el único href permitido es el marcador literal. Cualquier otro `<a href>` se degrada
// a `<span>` (pierde el link, conserva el texto) en vez de descartar todo el nodo, para que un
// operador que pegó un enlace externo por error vea igual el texto que escribió.
export function sanitizarPlantillaAlertaHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: TAGS_PERMITIDOS,
    allowedAttributes: { a: ["href"] },
    nonTextTags: ["script", "style", "iframe", "noscript"],
    disallowedTagsMode: "discard",
    transformTags: {
      a: (_tag: string, attribs: sanitizeHtml.Attributes): sanitizeHtml.Tag => {
        if (attribs.href === MARCADOR_ENLACE_SISTEMA) {
          return { tagName: "a", attribs: { href: MARCADOR_ENLACE_SISTEMA } };
        }
        return { tagName: "span", attribs: {} };
      },
    },
  });
}

// Etapa de ENVÍO (mensaje ya con placeholders resueltos, incluido el enlace ya convertido en URL
// real): el único href permitido es exactamente la URL real esperada, con `rel` fijo agregado por
// el servidor. Defensa en profundidad: cierra la ventana entre "lo que el editor pudo producir" y
// "lo que realmente se envía".
export function sanitizarMensajeResueltoHtml(html: string, urlEnlaceSistema: string): string {
  return sanitizeHtml(html, {
    allowedTags: TAGS_PERMITIDOS,
    allowedAttributes: { a: ["href", "rel"] },
    nonTextTags: ["script", "style", "iframe", "noscript"],
    disallowedTagsMode: "discard",
    transformTags: {
      a: (_tag: string, attribs: sanitizeHtml.Attributes): sanitizeHtml.Tag => {
        if (attribs.href === urlEnlaceSistema) {
          return { tagName: "a", attribs: { href: urlEnlaceSistema, rel: "noopener noreferrer" } };
        }
        return { tagName: "span", attribs: {} };
      },
    },
  });
}

export function htmlAsTextoPlano(html: string): string {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} });
}

const NOMBRES_PLACEHOLDER_VALIDOS: ReadonlySet<string> = new Set<string>([
  ...PLACEHOLDERS_PERMITIDOS,
  "enlaceSistema",
]);

// Busca todo `{{...}}` remanente en el HTML (ya sanitizado) y verifica que cada uno pertenezca a
// `PLACEHOLDERS_PERMITIDOS ∪ {"enlaceSistema"}`. Retorna el primer placeholder inválido
// encontrado, o `null` si todos son válidos (incluido el caso sin placeholders).
export function contienePlaceholderInvalido(plantilla: string): string | null {
  const patron = /\{\{(\w+)\}\}/g;
  let coincidencia: RegExpExecArray | null;

  while ((coincidencia = patron.exec(plantilla)) !== null) {
    const nombre = coincidencia[1];
    if (!NOMBRES_PLACEHOLDER_VALIDOS.has(nombre)) {
      return nombre;
    }
  }

  return null;
}

export type VariablesPlantillaAlerta = {
  nombreUsuario: string;
  diasRestantes: string;
  formatoArchivo: string;
  anio: string;
};

// Resuelve una plantilla ya sanitizada (etapa de guardado) contra las variables reales de un
// destinatario y la URL real del enlace al sistema. El resultado TODAVÍA no está sanitizado para
// la etapa de envío: quien llama debe pasarlo por `sanitizarMensajeResueltoHtml` antes de
// persistir/enviar.
export function resolverPlantillaAlerta(
  plantillaSanitizada: string,
  variables: VariablesPlantillaAlerta,
  urlEnlaceSistema: string,
): string {
  let resultado = plantillaSanitizada;

  for (const nombre of PLACEHOLDERS_PERMITIDOS) {
    const valorEscapado = escaparHtml(variables[nombre]);
    resultado = resultado.replaceAll(`{{${nombre}}}`, valorEscapado);
  }

  // `urlEnlaceSistema` es una URL construida por el servidor (`AlertaVentanaMailer`), no un dato
  // de usuario: se inserta sin escapar, igual que el resto del proyecto trata las URLs que él
  // mismo construye (ver `construirEnlace` en `PasswordResetMailer.ts`).
  resultado = resultado.replaceAll(MARCADOR_ENLACE_SISTEMA, urlEnlaceSistema);

  return resultado;
}
