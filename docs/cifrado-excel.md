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

La descarga con fecha empieza a responder antes de recorrer la hoja completa. La desconexión del
cliente cancela las lecturas ZIP, retira la petición de la cola si aún espera turno y libera la
exclusión por usuario. Si pasan 15 minutos sin entregar nuevos bytes, se cancela la operación real
y se liberan sus recursos; el contador se renueva mientras la descarga avanza. Los errores de
lectura posteriores al inicio cortan el flujo: una descarga interrumpida no es un Excel completo.

Para aplicar cambios de código en Coolify es necesario desplegar una imagen nueva desde el commit
actualizado. Reiniciar la imagen anterior no incorpora la corrección. Después del despliegue,
comprobar la descarga con fecha, cancelarla durante su preparación y reintentar con el mismo
usuario; el reintento debe poder iniciar una descarga nueva. Una segunda petición mientras la
primera sigue activa conserva la respuesta `DESCARGA_EN_CURSO`.

Los libros de al menos 50 MB sin tabla de textos compartidos y con dimensión compatible con los
encabezados disponen de una inserción directa de la fecha en el XML de la primera hoja. La salida
se comprime y entrega por bloques mientras se lee, sin una pasada completa previa ni objetos por
cada celda. Conserva fórmulas, estilos y hojas auxiliares; agrega una celda de fecha real de Excel
con el formato `dd-mm-yyyy hh:mm:ss` a cada fila existente. Usa la fecha de notificación guardada
en la carga, no la hora de descarga. La compresión prioriza velocidad, por lo que la copia puede
pesar más que el original. Los demás libros conservan la reconstrucción con ExcelJS.

Prueba con el archivo RBB 2017 de 160.066.113 bytes (hoja de 1.934.043.970 bytes descomprimidos):
medición local completa con celdas de fecha: primeros bytes en 334 ms, 55 s en total y RSS máximo de 231 MB.
Son cifras locales, no una garantía de tiempo en producción. La prueba consume y descarta la
salida sin guardar datos clínicos: `node --import tsx tests/descarga-xlsx-grande.manual.ts /ruta/archivo.xlsx`.

Este cifrado protege los binarios almacenados. Las filas extraídas para procesamiento o consulta
permanecen en PostgreSQL según el modelo existente: no es cifrado de la base de datos ni cifrado
extremo a extremo. HTTPS sigue siendo necesario para proteger el transporte.

Pruebas: `npx tsx --test tests/cifrado-excel.unit.ts`. Incluyen lectura por rangos, temporales cifrados,
lector de Bioestadística y descarga generada, alteración, truncamiento, cambio de propietario,
sustitución de carga, clave incorrecta, rotación y compatibilidad con archivos previos/CSV.

Cancelación y recuperación: `node --import tsx --test tests/descargas-cancelacion.unit.ts`.
Inserción en XML, conservación del libro, calendario 1904 y lectura cifrada:
`node --import tsx --test tests/descarga-xlsx-grande.unit.ts`.
