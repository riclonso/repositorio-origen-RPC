# Cifrado de nuevas cargas Excel

Solo las nuevas cargas `.xlsx` del notificador y Bioestadística se cifran en disco. Las plantillas,
los CSV y las cargas anteriores conservan su comportamiento. Los usuarios autorizados descargan
un Excel normal; las reglas de autorización siguen en los repositorios y Route Handlers.

## Claves y operación

Configurar únicamente en el servidor:

- `EXCEL_ENCRYPTION_KEY_ID`: identificador activo (por defecto `v1`).
- `EXCEL_ENCRYPTION_KEYS`: JSON con versiones y sus claves maestras de 32 bytes aleatorios en base64.

Generación: `node -e 'console.log(require("node:crypto").randomBytes(32).toString("base64"))'`.
No usar el ID del usuario ni `AUTH_SECRET` como clave maestra. No guardar claves reales en Git,
logs, el navegador ni las plantillas. Sin configuración válida, una nueva carga Excel falla antes de
escribir bytes; no existe modo de reserva que guarde esa carga en claro. El build y la lectura de
archivos anteriores no requieren la clave.

Respaldar las claves en un gestor de secretos separado del volumen de archivos. Si se pierde una
versión, sus Excel dejan de poder descifrarse. Para rotar, agregar una nueva versión al mapa y
cambiar el ID activo, conservando las versiones anteriores. Reiniciar los procesos tras cambiar
las variables. No se recifran archivos existentes automáticamente.

## Formato y derivación

La envoltura versionada `RPCXLS01` usa AES-256-GCM con bloques de 64 KiB y etiquetas de 16 bytes.
HKDF-SHA-256 deriva una clave de archivo desde la clave maestra, una sal aleatoria de 32 bytes y
el contexto `rpc/excel/v1/usuario/<id-del-propietario-original>`. No depende del usuario que descarga.
Cada archivo tiene un prefijo aleatorio de nonce de 8 bytes y un contador de bloque de 4 bytes.
El contador reservado `0xffffffff` autentica el pie con el tamaño total. El lector comprueba ese
pie y el tamaño físico antes de leer, y verifica cada bloque antes de entregar sus bytes claros.

La cabecera fija de 512 bytes contiene propietario, ID de carga, versión de clave, sal y prefijo
nonce. Estos metadatos son públicos; la clave maestra no está en el archivo. La cabecera completa,
el índice y la longitud del bloque forman los datos autenticados. El nombre definitivo de la
referencia debe corresponder al ID de carga autenticado: no se acepta sustituir un archivo por el
de otra carga. El tamaño total y las etiquetas impiden truncar o añadir bloques silenciosamente.

Los temporales son `tmp/<uuid>.part.enc` y los definitivos `<anio>/<cargaId>.xlsx.enc`. Un `.enc`
con firma dañada falla; nunca se interpreta como un archivo anterior en claro. La recepción mide
tamaño, firma y SHA-256 sobre los bytes originales. La descarga informa ese tamaño original.
La limpieza de arranque contempla tanto `.part` como `.part.enc`.

## Lectura y límites

Los validadores y el generador de descargas utilizan una fuente ZIP de acceso aleatorio que
retiene únicamente bloques acotados. No se crea una copia XLSX descifrada en disco. Los cortes y
cancelaciones cierran las lecturas abiertas. El archivo original se entrega byte a byte; la descarga
con fecha de notificación continúa generando su copia mediante streaming.

Este cifrado protege los binarios almacenados. Las filas extraídas para procesamiento o consulta
permanecen en PostgreSQL según el modelo existente: no es cifrado de la base de datos ni cifrado
extremo a extremo. HTTPS sigue siendo necesario para proteger el transporte.

Pruebas: `npx tsx --test tests/cifrado-excel.unit.ts`. Incluyen lectura por rangos, temporales cifrados,
lector de Bioestadística y descarga generada, alteración, truncamiento, cambio de propietario,
sustitución de carga, clave incorrecta, rotación y compatibilidad con archivos previos/CSV.
