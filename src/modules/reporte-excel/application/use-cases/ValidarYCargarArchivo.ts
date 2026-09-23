import type { FormatoExcelRepository } from "@/modules/formatos-excel/domain/repositories/FormatoExcelRepository";
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
import { estaAbierta } from "@/modules/ventanas-carga/domain/entities/VentanaCarga";
import { reaperturaVigente } from "@/modules/reporte-excel/domain/entities/CargaArchivoRechazo";
import { ValidadoresTipoDato, celdaVacia } from "@/modules/reporte-excel/infrastructure/validacion/ValidadoresTipoDato";
import {
  crearRastreadorFilasDuplicadas,
  cumpleReglaValidacion,
  evaluarFilaDuplicada,
} from "@/modules/reporte-excel/infrastructure/validacion/EvaluadorReglasValidacion";

export type DatosValidarYCargarArchivo = {
  formatoExcelId: string;
  // Año de la ventana de carga elegida por el notificador para esta subida (RF-15). Se
  // revalida SIEMPRE en servidor: nunca se confía en que el desplegable del cliente refleje el
  // estado real de la ventana al momento del envío.
  anio: number;
  usuarioId: string;
  nombreArchivoOriginal: string;
  tipoContenidoArchivo: string;
  contenidoArchivo: Buffer;
};

export type ResultadoValidarYCargarArchivo =
  | { ok: true; carga: CargaArchivo }
  // Cubre tanto "nunca estuvo asignado" como "se dio de baja entre que el notificador abrió el
  // selector y envió el archivo": ambos casos son indistinguibles desde este endpoint y se tratan
  // igual, cerrando la ventana de carrera.
  | { ok: false; motivo: "FORMATO_NO_ASIGNADO" }
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
  // utilizable que autorice volver a subir.
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

  // Nuevo (rechazo de cargas aprobadas): una ventana ya vencida sigue habilitando la subida si el
  // notificador tiene una reapertura vigente (su carga anterior para esta combinación fue
  // rechazada, y el plazo de reapertura no expiró). Se consume por el intento en sí, exista o no
  // error de validación en él, mismo criterio que una autorización de reemplazo.
  let cargaArchivoRechazoAConsumirId: string | null = null;

  if (!estaAbierta(ventana, new Date())) {
    const reapertura = await dependencias.repositorio.obtenerReaperturaPendientePorUsuarioYVentana(
      datos.usuarioId,
      ventana.id,
    );

    if (reapertura && reaperturaVigente(reapertura, { fechaVencimiento: ventana.fechaVencimiento }, new Date())) {
      cargaArchivoRechazoAConsumirId = reapertura.id;
    } else {
      return { ok: false, motivo: "SIN_VENTANA_ABIERTA" };
    }
  }

  // RF-15 (ampliación): una ventana en borrador (no publicada) no debe habilitar subidas, aunque
  // esté dentro de su rango de fechas.
  if (!ventana.publicada) {
    return { ok: false, motivo: "VENTANA_NO_PUBLICADA" };
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
  // autorización previa. Barato primero, antes de leer el archivo completo.
  const cargaAprobadaVigente = await dependencias.repositorio.obtenerAprobadaVigentePorUsuarioYVentana(
    datos.usuarioId,
    ventana.id,
  );

  let solicitudReemplazoAConsumirId: string | null = null;

  if (cargaAprobadaVigente) {
    const solicitud = await dependencias.repositorioSolicitudesReemplazo.obtenerAprobadaUtilizablePorCarga(
      cargaAprobadaVigente.id,
      new Date(),
    );

    if (!solicitud) {
      return { ok: false, motivo: "REEMPLAZO_NO_AUTORIZADO" };
    }

    solicitudReemplazoAConsumirId = solicitud.id;
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

  if (columnasInesperadas.length > 0) {
    errores.push({
      numeroFila: 0,
      columna: columnasInesperadas.join(", "),
      tipoError: "COLUMNA_INESPERADA",
      mensaje: `El archivo trae columnas no declaradas en el formato: ${columnasInesperadas.join(", ")}`,
    });
  }

  // Solo se validan las columnas del formato que sí están presentes en el archivo: una columna
  // ausente ya quedó cubierta por `COLUMNA_FALTANTE` y no se repite fila por fila.
  const columnasAValidar = formato.columnas.filter((columna) =>
    encabezadosPresentes.has(normalizarNombre(columna.nombre)),
  );

  const filasAValidar = filas.slice(0, TOPE_FILAS_DATOS);

  // Reglas `FILA_DUPLICADA` del formato: a diferencia del resto, necesitan memoria entre filas
  // (ver comentario en `EvaluadorReglasValidacion.ts`). El rastreador se crea una sola vez, antes
  // del recorrido, y se reutiliza fila a fila dentro del mismo `forEach` de abajo: sin una segunda
  // pasada sobre el archivo ni bucles anidados.
  const reglasFilaDuplicada = formato.reglasValidacion.filter((regla) => regla.tipo === "FILA_DUPLICADA");
  const rastreadorFilasDuplicadas = crearRastreadorFilasDuplicadas(reglasFilaDuplicada);

  filasAValidar.forEach((fila: Record<string, ValorCeldaArchivo>, indice) => {
    // La fila de encabezado cuenta como fila 1, así que la primera fila de datos es la 2.
    const numeroFila = indice + 2;

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
    cantidadFilasDatos: filasAValidar.length,
    // Total real de errores encontrados, no el acotado: `erroresAcotados` puede terminar más
    // corto que `errores` (tope de `TOPE_ERRORES_PERSISTIDOS`), y `cantidadErrores` debe reflejar
    // el conteo real para no contradecir el mensaje "... y N errores más" de la fila resumen.
    cantidadErrores: errores.length,
    estado,
    errores: erroresAcotados,
    // Se consume por el intento en sí, exista o no error de validación en él (sección 5.4 del
    // diseño): así no quedan solicitudes "fantasma" reutilizables indefinidamente en reintentos.
    solicitudReemplazoAConsumirId,
    cargaArchivoRechazoAConsumirId,
  });

  return { ok: true, carga };
}
