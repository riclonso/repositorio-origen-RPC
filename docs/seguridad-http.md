# Cabeceras de seguridad

En producción, todas las rutas envían HSTS por un año, `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` y CSP con
`frame-ancestors 'none'`. El navegador no envía la URL de procedencia en la cabecera
`Referer`, ni a otros sitios ni dentro del mismo origen.
`Cross-Origin-Opener-Policy: same-origin` aísla las páginas de ventanas de otros
orígenes. COEP no está configurada.
`X-Powered-By` está deshabilitado.

Las páginas reciben además una CSP de scripts con un nonce aleatorio de 256 bits por
petición. El proxy pasa la política al renderizador de Next.js y al navegador; Next
autoriza sus scripts con ese mismo nonce. El layout usa renderizado dinámico y las
respuestas HTML no se almacenan en caché para evitar reutilizar nonces. Cloudflare o
un proxy externo tampoco deben almacenar este HTML ni inyectar scripts sin nonce.

Se bloquean scripts inline sin nonce, manejadores HTML como `onclick`, evaluación
dinámica de código, objetos incrustados, iframes y cambios del URL base. Conexiones,
fuentes y formularios se restringen al mismo origen. Imágenes permiten también
`data:` y `blob:`. Los estilos inline se conservan para los componentes React y
el editor; esta excepción no autoriza scripts inline.

La política estricta solo se activa en producción. El proxy excluye `/api` y
`/_next`, preservando el procesamiento de subidas de hasta 300 MB. Las API mantienen
sus guardias de autorización y las cabeceras estáticas de `next.config.ts`.

Esta capa complementa el escape de React, la sanitización de HTML en el servidor y
las cookies de sesión `HttpOnly`. No sustituye esos controles ni garantiza ausencia
de vulnerabilidades XSS.

Verificación: `node --import tsx --test tests/csp.unit.ts`. Después de desplegar,
comprobar las cabeceras y probar ingreso, navegación y editores en el navegador.
