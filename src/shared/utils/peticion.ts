// Lectura de datos del borde HTTP. Vive en `shared/` porque lo necesitan tanto la auditoría
// del mantenedor como la de recuperación y el limitador por IP.

const LARGO_MAXIMO_USER_AGENT = 200;

/**
 * Cuántos proxies inversos de confianza hay entre la aplicación e internet.
 *
 * El despliegue es Coolify, que pone un Traefik delante del contenedor: exactamente uno. Traefik
 * AGREGA la dirección del socket que él ve al final de `x-forwarded-for`, así que el último
 * elemento de la cadena es el único que el cliente no puede escribir.
 *
 * Si algún día se agrega otro salto de confianza (por ejemplo un balanceador o un CDN por
 * delante de Traefik), este número debe subir en la misma entrega: dejarlo corto hace confiar en
 * un valor que el cliente controla, y dejarlo largo hace atribuir el tráfico a la IP del propio
 * proxy.
 */
export const PROXIES_DE_CONFIANZA = 1;

/**
 * Dirección del cliente según el proxy de confianza más cercano a la aplicación.
 *
 * Se lee desde el FINAL de `x-forwarded-for`, nunca desde el principio: la cabecera es una lista
 * a la que cada salto anexa lo que ve, así que los primeros elementos los escribe quien hace la
 * petición y son falsificables. Tomar el primero permitía evadir el límite por IP simplemente
 * mandando `X-Forwarded-For: 9.9.9.9` y rotando el valor.
 *
 * Este mismo valor se usa para limitar Y para auditar, deliberadamente. Se descartó tener dos
 * nociones de IP: registrar en `auditoria.txt` una dirección elegida por el atacante no es
 * información parcial, es evidencia falsa, y es peor que no registrar nada.
 *
 * Devuelve `null` solo si la cabecera no llega o viene vacía. En este runtime no ocurre:
 * Next.js rellena `x-forwarded-for` con la dirección del socket cuando la petición no la trae
 * (`base-server.js`: `req.headers['x-forwarded-for'] ??= socket.remoteAddress`).
 */
export function extraerIp(peticion: Request): string | null {
  const cadena = (peticion.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((elemento) => elemento.trim())
    .filter((elemento) => elemento.length > 0);

  if (cadena.length === 0) {
    return null;
  }

  // Con menos saltos de los declarados en PROXIES_DE_CONFIANZA la cadena está incompleta (un
  // proxy dejó de anexar su vista). Se toma el primer elemento como último recurso, que es el
  // peor caso posible y solo alcanzable si la constante quedó desactualizada respecto del
  // despliegue: con el valor 1 esta rama es inalcanzable.
  const indice = Math.max(cadena.length - PROXIES_DE_CONFIANZA, 0);

  return cadena[indice] ?? null;
}

export function extraerUserAgent(peticion: Request): string | null {
  const userAgent = peticion.headers.get("user-agent");
  return userAgent ? userAgent.slice(0, LARGO_MAXIMO_USER_AGENT) : null;
}
