# Subidas por partes de 50 MiB

Notificador y Bioestadística envían partes de **50 × 1024 × 1024 bytes** (50 MiB). La última envía los bytes restantes. El límite total sigue siendo 300 MiB, como las constantes previas: máximo seis partes. Plantillas de formatos mantienen su flujo y límite existente.

El navegador inicia una sesión autenticada, envía partes secuenciales con progreso acumulado y pide finalizar. Reintenta hasta tres veces el inicio, una parte o finalización ante error de red/servidor. Los reintentos de una parte deben tener idéntico SHA-256 y tamaño; no duplican contenido. La respuesta de finalización se conserva para recuperar una respuesta perdida sin crear otra carga. Cancelar o desmontar la pantalla intenta cancelar la sesión. Tras cerrar o recargar el navegador, seleccionar nuevamente el mismo archivo permite recuperar la sesión vigente mediante nombre, tamaño, usuario y contexto. Se reenvían las partes desde cero y el servidor verifica sus hashes para evitar duplicados o cambios de contenido. Una sesión abandonada vence tras 24 horas de inactividad.

## Persistencia y cifrado

Cada sesión guarda un manifiesto privado y piezas en `<directorio de cargas>/subidas/<uuid>`. El volumen configurado en Coolify debe incluirlo. XLSX se cifra desde su recepción usando el mecanismo AES-GCM/HKDF existente y el ID del usuario, con material aleatorio independiente por pieza. CSV de Bioestadística mantiene almacenamiento plano. Al finalizar se concatenan flujos descifrados en memoria, con contrapresión y verificación de hashes; el receptor existente cifra y valida el archivo definitivo. No hay un Excel completo en claro en disco ni se carga entero en RAM. Durante finalización existe temporalmente espacio para piezas más archivo definitivo: reservar aproximadamente el doble del tamaño de una carga, además de otras cargas.

Las reglas de asignación, ventana, reemplazo y procesamiento se comprueban al iniciar y al finalizar. El servidor mide el tamaño real de cada parte y valida propietario/origen antes de operar. No confía en el nombre de archivo para construir rutas. Los directorios y archivos usan permisos privados; los bloqueos de disco serializan operaciones y excluyen otra sesión vigente para el mismo usuario/contexto. El ID interno de carga se reserva al iniciar y permite recuperar una creación previa si el proceso cae antes de guardar la respuesta.

Las piezas de una sesión finalizada se eliminan. Las sesiones vencidas se limpian al arrancar y al iniciar otras cargas, en lotes acotados de hasta 100 entradas. El sistema mantiene el despliegue de una instancia usado por la recuperación existente de procesamientos; no hay cola distribuida ni garantía de procesamiento continuo entre reinicios.

## Coolify

Configurar `APP_URL=https://reporpc.chrisapp.dev` como URL pública canónica: el control de origen utiliza esa variable y evita depender de la URL interna detrás del proxy. Mantener las variables de clave de cifrado y ambos directorios en el volumen persistente ya configurado. El proxy debe admitir peticiones de 50 MiB y el tiempo suficiente para recibirlas y completar la escritura/validación inicial; la división evita el límite de 100 MB de Cloudflare, pero no sustituye permisos de disco, capacidad o claves correctas.

API por perfil: `POST /api/<perfil>/cargas/subidas` inicia con query original y JSON `{tamanoBytes,nombreArchivo}`; `PUT .../subidas/<id>/partes/<indice>` recibe binario; `GET .../subidas/<id>` informa estado; `POST .../completar` conserva respuesta actual 202; `DELETE .../subidas/<id>` cancela una recepción sin borrar cargas completadas.
