import type { FormatoExcelRepository } from "@/modules/formatos-excel/domain/repositories/FormatoExcelRepository";
import type { TipoArchivo } from "@/modules/formatos-excel/domain/entities/FormatoExcel";
import type { CargaArchivoRepository } from "@/modules/reporte-excel/domain/repositories/CargaArchivoRepository";
import type { VentanaCargaRepository } from "@/modules/ventanas-carga/domain/repositories/VentanaCargaRepository";
import type { LectorArchivoReporte } from "@/modules/reporte-excel/application/ports";
import type { SolicitudReemplazoCargaRepository } from "@/modules/solicitudes-reemplazo/domain/repositories/SolicitudReemplazoCargaRepository";
import {
  TOPE_ERRORES_PERSISTIDOS,
  TOPE_FILAS_DATOS,
  type CargaArchivo,
  type DatosNuevoErrorCargaArchivo,
  type EstadoCargaArchivo,
  type ValorCeldaArchivo,
} from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import { resolverAutorizacionReemplazo } from "@/modules/reporte-excel/application/resolverAutorizacionReemplazo";
import { resolverVentanaHabilitada } from "@/modules/reporte-excel/application/resolverVentanaHabilitada";
import { ValidadoresTipoDato } from "@/modules/reporte-excel/infrastructure/validacion/ValidadoresTipoDato";
import {
  columnasConContenidoHtml,
  crearRastreadorFilasDuplicadas,
  cumpleReglaValidacion,
  evaluarFilaDuplicada,
} from "@/modules/reporte-excel/infrastructure/validacion/EvaluadorReglasValidacion";
import {
  celdaVacia,
  filaCompletamenteVacia,
  indiceUltimaFilaConDatos,
} from "@/modules/reporte-excel/domain/reglas/filasArchivo";

export type DatosValidarYCargarArchivo = {
  formatoExcelId: string;
  // Año de la ventana de carga elegida por el notificador para esta subida (RF-15). Se
  // revalida SIEMPRE en servidor: nunca se confía en que el desplegable del cliente refleje el
  // estado real de la ventana al momento del envío.
  anio: number;
  usuarioId: string;
  nombreArchivoOriginal: string;
  tipoContenidoArchivo: string;
  // Detectado por el servidor a partir del contenido real del archivo. El notificador siempre
  // sube Excel, sin importar si el formato se definió desde un CSV.
  tipoArchivoDetectado: TipoArchivo;
  contenidoArchivo: Buffer;
};

export type ResultadoValidarYCargarArchivo =
  | { ok: true; carga: CargaArchivo }
  // Cubre tanto "nunca estuvo asignado" como "se dio de baja entre que el notificador abrió el
  // selector y envió el archivo": ambos casos son indistinguibles desde este endpoint y se tratan
  // igual, cerrando la ventana de carrera.
  | { ok: false; motivo: "FORMATO_NO_ASIGNADO" }
  | { ok: false; motivo: "ARCHIVO_NO_EXCEL" }
  // Cubre "no existe ninguna ventana para ese año y ese formato exacto" y "existe pero ya cerró o
  // todavía no abre": mismo criterio que `FORMATO_NO_ASIGNADO`, indistinguibles desde este
  // endpoint (no revela detalle interno). La corrección que reemplazó
  // `VentanaCarga.tipoArchivo` por `formatoExcelId` fusiona en esta misma consulta lo que antes
  // era un chequeo separado de coincidencia de tipo de archivo.
  | { ok: false; motivo: "SIN_VENTANA_ABIERTA" }
  // RF-15 (ampliación): la ventana existe y está abierta, pero es un borrador (no publicada). Se
  // trata igual que `SIN_VENTANA_ABIERTA` de cara al notificador (misma respuesta HTTP genérica):
  // no debe revelarse que existe un borrador.
  | { ok: false; motivo: "VENTANA_NO_PUBLICADA" }
  // Extensión "solicitudes de reemplazo": ya existe una carga `APROBADA` vigente para esta
  // combinación (formato, ventana) y no hay ninguna `SolicitudReemplazoCarga` aprobada y todavía
  // utilizable, ni una reapertura vigente posterior a esa aprobación, que autorice volver a subir
  // (ver `resolverAutorizacionReemplazo`).
  | { ok: false; motivo: "REEMPLAZO_NO_AUTORIZADO" }
  // Corrección (fin de la autoaprobación): ya existe, para esta combinación (formato, ventana), una
  // carga `PENDIENTE_VISTO_BUENO` que el notificador ya finalizó y envió, y que todavía nadie
  // decidió (aprobó o rechazó). Defensa de servidor: el mecanismo PRINCIPAL para evitar llegar
  // aquí es de UI (la tarjeta desaparece por completo mientras esté en este estado).
  | { ok: false; motivo: "CARGA_PENDIENTE_DECISION" };

function normalizarNombre(nombre: string): string {
  return nombre.trim().toLowerCase();
}

// Corta en `TOPE_ERRORES_PERSISTIDOS` filas y agrega una fila resumen en vez de dejar pasar miles
// de filas de error hacia un solo INSERT.
function acotarErrores(errores: DatosNuevoErrorCargaArchivo[]): DatosNuevoErrorCargaArchivo[] {
  if (errores.length <= TOPE_ERRORES_PERSISTIDOS) {
    return errores;
  }

  const acotados = errores.slice(0, TOPE_ERRORES_PERSISTIDOS - 1);
  const restantes = errores.length - acotados.length;

  acotados.push({
    numeroFila: 0,
    columna: null,
    tipoError: errores[TOPE_ERRORES_PERSISTIDOS - 1].tipoError,
    mensaje: `... y ${restantes} errores más`,
  });

  return acotados;
}

// Caso de uso central de RF-14: valida un archivo subido por un notificador contra el formato
// que eligió y persiste la carga completa (binario + errores), tenga o no errores.
export async function validarYCargarArchivo(
  datos: DatosValidarYCargarArchivo,
  dependencias: {
    repositorio: CargaArchivoRepository;
    repositorioFormatosExcel: FormatoExcelRepository;
    repositorioVentanasCarga: VentanaCargaRepository;
    repositorioSolicitudesReemplazo: SolicitudReemplazoCargaRepository;
    lector: LectorArchivoReporte;
  },
): Promise<ResultadoValidarYCargarArchivo> {
  // `formatoExcelId` del cliente SIEMPRE se valida contra la asignación vigente antes de
  // cualquier otra cosa: nunca se confía en el valor recibido.
  const asignado = await dependencias.repositorioFormatosExcel.estaAsignadoYActivo(
    datos.usuarioId,
    datos.formatoExcelId,
  );

  if (!asignado) {
    return { ok: false, motivo: "FORMATO_NO_ASIGNADO" };
  }

  const formato = await dependencias.repositorioFormatosExcel.obtenerPorId(datos.formatoExcelId);

  if (!formato) {
    return { ok: false, motivo: "FORMATO_NO_ASIGNADO" };
  }

  if (datos.tipoArchivoDetectado !== "EXCEL") {
    return { ok: false, motivo: "ARCHIVO_NO_EXCEL" };
  }

  // Barato primero, antes de leer el archivo completo: si no hay una ventana abierta para el año
  // Y el formato elegidos, no tiene sentido ni siquiera parsear el archivo. Esta consulta ya
  // fusiona la resolución de la ventana con el chequeo de coincidencia de formato: si no existe
  // una ventana para ese año y ese formato exacto, es indistinguible de "no coincide".
  const ventana = await dependencias.repositorioVentanasCarga.obtenerPorAnioYFormato(
    datos.anio,
    datos.formatoExcelId,
  );

  if (!ventana) {
    return { ok: false, motivo: "SIN_VENTANA_ABIERTA" };
  }

  const ahora = new Date();

  // Ventana cerrada sin reapertura vigente, o en borrador: ver `resolverVentanaHabilitada`. Una
  // reapertura vigente habilita subir con la ventana vencida, pero NO se consume aquí (decisión que
  // revierte la de RF-20): se consume al finalizar y enviar con éxito
  // (`CargaArchivoRepository.finalizar()`), para que un intento con errores, o uno que el
  // notificador no llegó a finalizar, no lo deje bloqueado.
  const motivoVentana = await resolverVentanaHabilitada(
    { ventana, usuarioId: datos.usuarioId, ahora },
    { repositorio: dependencias.repositorio },
  );

  if (motivoVentana) {
    return { ok: false, motivo: motivoVentana };
  }

  // Corrección (fin de la autoaprobación): defensa de servidor, barato primero. Si ya existe una
  // `PENDIENTE_VISTO_BUENO` finalizada de esta combinación todavía sin decidir, no se admite una
  // subida nueva hasta que ADMIN/REVISOR_REPOSITORIO la apruebe o la rechace.
  const cargaPendienteFinalizada = await dependencias.repositorio.obtenerPendienteFinalizadaPorUsuarioYVentana(
    datos.usuarioId,
    ventana.id,
  );

  if (cargaPendienteFinalizada) {
    return { ok: false, motivo: "CARGA_PENDIENTE_DECISION" };
  }

  // Extensión "solicitudes de reemplazo": si ya existe una carga APROBADA vigente para esta
  // combinación (formato, ventana), esta subida es un intento de REEMPLAZO y exige una
  // autorización (solicitud aprobada y utilizable, o reapertura posterior a esa aprobación). Barato
  // primero, antes de leer el archivo completo. Aquí solo se verifica: nada se consume al subir, así
  // que el notificador puede reintentar mientras la autorización siga vigente.
  const autorizacion = await resolverAutorizacionReemplazo(
    { usuarioId: datos.usuarioId, ventanaCargaId: ventana.id, ahora },
    {
      repositorio: dependencias.repositorio,
      repositorioSolicitudesReemplazo: dependencias.repositorioSolicitudesReemplazo,
    },
  );

  if (!autorizacion.autorizado) {
    return { ok: false, motivo: "REEMPLAZO_NO_AUTORIZADO" };
  }

  const { encabezados, filas } = await dependencias.lector.leer(
    datos.contenidoArchivo,
    datos.tipoContenidoArchivo,
  );

  const errores: DatosNuevoErrorCargaArchivo[] = [];
  const encabezadosPresentes = new Set(encabezados.map(normalizarNombre));
  const nombresDeColumnaDelFormato = new Set(formato.columnas.map((columna) => normalizarNombre(columna.nombre)));

  // Estructural: columna requerida por el formato pero completamente ausente del archivo.
  for (const columna of formato.columnas) {
    if (!encabezadosPresentes.has(normalizarNombre(columna.nombre))) {
      errores.push({
        numeroFila: 0,
        columna: columna.nombre,
        tipoError: "COLUMNA_FALTANTE",
        mensaje: `Falta la columna "${columna.nombre}", declarada en el formato`,
      });
    }
  }

  // Estructural: columnas presentes en el archivo pero no declaradas en el formato. NO se
  // ignoran silenciosamente.
  const columnasInesperadas = encabezados.filter(
    (encabezado) => !nombresDeColumnaDelFormato.has(normalizarNombre(encabezado)),
  );

  for (const columnaInesperada of columnasInesperadas) {
    errores.push({
      numeroFila: 0,
      columna: columnaInesperada,
      tipoError: "COLUMNA_INESPERADA",
      mensaje: `La columna "${columnaInesperada}" no pertenece al formato`,
    });
  }

  // Con columnas que no pertenecen al formato la estructura ya está mal: validar las filas solo
  // agregaría ruido (típicamente, una columna renombrada vacía todas sus celdas requeridas).
  const validarFilas = columnasInesperadas.length === 0;

  // Solo se validan las columnas del formato que sí están presentes en el archivo: una columna
  // ausente ya quedó cubierta por `COLUMNA_FALTANTE` y no se repite fila por fila.
  const columnasAValidar = formato.columnas.filter((columna) =>
    encabezadosPresentes.has(normalizarNombre(columna.nombre)),
  );

  // RF-32: como máximo una regla de cada uno de estos tipos por formato (lo garantiza el esquema).
  const reglaFilaVacia = formato.reglasValidacion.find((regla) => regla.tipo === "FILA_VACIA");
  const reglaHtml = formato.reglasValidacion.find((regla) => regla.tipo === "CONTENIDO_HTML");

  // Se calcula sobre el archivo COMPLETO, antes del tope de `TOPE_FILAS_DATOS`, para que una fila
  // vacía cerca del tope no se confunda con una del final. -1 = ninguna fila trae datos.
  const indiceUltimaConDatos = indiceUltimaFilaConDatos(filas);

  // Solo con la regla `FILA_VACIA`, las filas vacías del final (residuos de Excel con formato)
  // se recortan antes del recorrido y no cuentan en `cantidadFilasDatos`. Sin la regla se mantiene
  // el comportamiento previo (se recorren y cuentan todas), por compatibilidad. Cortar solo por el
  // final no mueve la numeración `indice + 2`.
  const filasEfectivas = reglaFilaVacia ? filas.slice(0, indiceUltimaConDatos + 1) : filas;

  // Estructural, para TODOS los formatos (tengan o no `FILA_VACIA`): un archivo sin ninguna fila
  // con datos (solo encabezados, o encabezados + solo filas completamente vacías) se rechaza. Sin
  // este chequeo el archivo podría quedar como `PENDIENTE_VISTO_BUENO` sin haber validado nada.
  // Solo si se reconoció al menos una columna del formato: sin ninguna, el archivo ya trae un
  // `COLUMNA_FALTANTE` por columna y afirmar que "parece estar vacío" sería falso (sus filas pueden
  // traer datos bajo encabezados que no se reconocieron).
  const sinFilasConDatos = indiceUltimaConDatos === -1;

  if (validarFilas && sinFilasConDatos && columnasAValidar.length > 0) {
    errores.push({
      numeroFila: 0,
      columna: null,
      tipoError: "SIN_FILAS_DATOS",
      mensaje: "El archivo parece estar vacío: no trae ninguna fila con datos debajo de los encabezados",
    });
  }

  // Sin ninguna fila con datos, en cualquier formato, no hay filas de datos que contar
  // (`cantidadFilasDatos = 0`) ni que recorrer: los residuos vacíos solo agregarían ruido (un
  // `VALOR_REQUERIDO_VACIO` por columna requerida y fila) sobre la misma causa.
  const filasLeidas = sinFilasConDatos ? [] : filasEfectivas.slice(0, TOPE_FILAS_DATOS);
  const filasAValidar = validarFilas ? filasLeidas : [];
  const nombresColumnasAValidar = columnasAValidar.map((columna) => columna.nombre);

  // Reglas `FILA_DUPLICADA` del formato: a diferencia del resto, necesitan memoria entre filas
  // (ver comentario en `EvaluadorReglasValidacion.ts`). El rastreador se crea una sola vez, antes
  // del recorrido, y se reutiliza fila a fila dentro del mismo `forEach` de abajo: sin una segunda
  // pasada sobre el archivo ni bucles anidados.
  const reglasFilaDuplicada = formato.reglasValidacion.filter((regla) => regla.tipo === "FILA_DUPLICADA");
  const rastreadorFilasDuplicadas = crearRastreadorFilasDuplicadas(reglasFilaDuplicada);

  filasAValidar.forEach((fila: Record<string, ValorCeldaArchivo>, indice) => {
    // La fila de encabezado cuenta como fila 1, así que la primera fila de datos es la 2.
    const numeroFila = indice + 2;

    // RF-32 (`FILA_VACIA`): por el recorte de arriba, toda fila vacía que llega aquí está entre
    // filas con datos. Un solo error por fila, y la fila no se sigue validando: si no, generaría
    // un `VALOR_REQUERIDO_VACIO` por columna requerida más los fallos de otras reglas, todo ruido
    // sobre la misma causa. El rastreador de `FILA_DUPLICADA` ya excluía claves vacías.
    if (reglaFilaVacia && filaCompletamenteVacia(fila)) {
      errores.push({
        numeroFila,
        columna: null,
        tipoError: "REGLA_VALIDACION",
        mensaje: reglaFilaVacia.mensaje,
      });
      return;
    }

    for (const columna of columnasAValidar) {
      const valor = fila[columna.nombre] ?? null;

      if (celdaVacia(valor)) {
        if (columna.requerida) {
          errores.push({
            numeroFila,
            columna: columna.nombre,
            tipoError: "VALOR_REQUERIDO_VACIO",
            mensaje: `La columna "${columna.nombre}" es obligatoria y viene vacía`,
          });
        }
        continue;
      }

      if (!ValidadoresTipoDato[columna.tipoDato](valor)) {
        errores.push({
          numeroFila,
          columna: columna.nombre,
          tipoError: "TIPO_DATO_INVALIDO",
          mensaje: `El valor de "${columna.nombre}" no tiene el formato esperado (${columna.tipoDato})`,
        });
      }
    }

    for (const regla of formato.reglasValidacion) {
      if (!cumpleReglaValidacion(regla, fila, { ventana })) {
        errores.push({
          numeroFila,
          columna: null,
          tipoError: "REGLA_VALIDACION",
          mensaje: regla.mensaje,
        });
      }
    }

    // Mismo criterio que las demás reglas (`tipoError: "REGLA_VALIDACION"`, `columna: null` por
    // involucrar varias columnas, igual que `ALGUNA_COLUMNA_CON_VALOR`), pero evaluadas aparte
    // porque requieren el estado del rastreador en vez de ser puras.
    for (const regla of reglasFilaDuplicada) {
      if (evaluarFilaDuplicada(rastreadorFilasDuplicadas, regla, fila, numeroFila)) {
        errores.push({
          numeroFila,
          columna: null,
          tipoError: "REGLA_VALIDACION",
          mensaje: regla.mensaje,
        });
      }
    }

    // RF-32 (`CONTENIDO_HTML`): un error POR CELDA, con su `columna` (misma granularidad que
    // `VALOR_REQUERIDO_VACIO`/`TIPO_DATO_INVALIDO`: el notificador necesita saber qué celda
    // corregir). Si la celda además no cumple su tipo de dato (p. ej. `<b>5</b>` en ENTERO), se
    // reportan ambos errores a propósito: son causas distintas y este explica la real. El volumen
    // lo acota `acotarErrores`. Nunca se incluye el contenido de la celda en el mensaje.
    if (reglaHtml) {
      for (const nombreColumna of columnasConContenidoHtml(fila, nombresColumnasAValidar)) {
        errores.push({
          numeroFila,
          columna: nombreColumna,
          tipoError: "REGLA_VALIDACION",
          mensaje: reglaHtml.mensaje,
        });
      }
    }
  });

  const erroresAcotados = acotarErrores(errores);
  const estado: EstadoCargaArchivo = erroresAcotados.length > 0 ? "CON_ERRORES" : "PENDIENTE_VISTO_BUENO";

  const carga = await dependencias.repositorio.crear({
    formatoExcelId: datos.formatoExcelId,
    ventanaCargaId: ventana.id,
    usuarioId: datos.usuarioId,
    nombreArchivoOriginal: datos.nombreArchivoOriginal,
    tipoContenidoArchivo: datos.tipoContenidoArchivo,
    contenidoArchivo: datos.contenidoArchivo,
    cantidadFilasDatos: filasLeidas.length,
    // Total real de errores encontrados, no el acotado: `erroresAcotados` puede terminar más
    // corto que `errores` (tope de `TOPE_ERRORES_PERSISTIDOS`), y `cantidadErrores` debe reflejar
    // el conteo real para no contradecir el mensaje "... y N errores más" de la fila resumen.
    cantidadErrores: errores.length,
    estado,
    errores: erroresAcotados,
  });

  return { ok: true, carga };
}
