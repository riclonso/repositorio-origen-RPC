// Limitación de frecuencia por IP, con el estado en memoria del proceso.
//
// Se acepta la memoria y no una tabla porque el despliegue es un contenedor único, porque
// perder el contador en un reinicio no es grave (el límite por cuenta, que vive en la tabla de
// tokens, es el que de verdad protege una casilla del bombardeo) y porque una tabla obligaría a
// insertar una fila por cada correo tecleado, incluidos los de terceros que ni siquiera son
// usuarios del sistema.
//
// Limitaciones aceptadas y documentadas: el contador se reinicia con el proceso y no se
// comparte entre varias instancias.

export type ResultadoLimite =
  | { permitido: true }
  | { permitido: false; segundosEspera: number };

type Ventana = { conteo: number; expiraEn: number };

// Tope de claves para que un atacante con IPs rotativas no convierta el limitador en una fuga
// de memoria: al llegar al tope se descartan las entradas más antiguas por orden de inserción,
// que es el que conserva `Map`.
const MAXIMO_CLAVES = 5000;

const globalParaLimitador = globalThis as unknown as {
  ventanasLimitador?: Map<string, Ventana>;
};

// En `globalThis` por el mismo motivo que `prisma.ts`: sobrevivir a la recarga en caliente del
// servidor de desarrollo, donde si no el contador se reiniciaría con cada edición.
const ventanas: Map<string, Ventana> =
  globalParaLimitador.ventanasLimitador ?? new Map<string, Ventana>();

if (process.env.NODE_ENV !== "production") {
  globalParaLimitador.ventanasLimitador = ventanas;
}

// Purga perezosa: se hace al escribir, no con un temporizador, para no dejar un intervalo vivo
// en el proceso. Recorre el Map completo, que está acotado por MAXIMO_CLAVES.
function purgarVencidas(ahora: number): void {
  for (const [clave, ventana] of ventanas) {
    if (ventana.expiraEn <= ahora) {
      ventanas.delete(clave);
    }
  }
}

function descartarMasAntiguas(): void {
  while (ventanas.size >= MAXIMO_CLAVES) {
    const masAntigua = ventanas.keys().next();

    if (masAntigua.done) {
      return;
    }

    ventanas.delete(masAntigua.value);
  }
}

/**
 * Registra un intento contra una ventana fija y responde si está permitido.
 *
 * `ambito` separa contadores independientes (por ejemplo, solicitar y confirmar) para que
 * agotar uno no bloquee el otro.
 */
export function registrarIntento(
  ambito: string,
  identificador: string,
  maximoIntentos: number,
  ventanaMinutos: number,
): ResultadoLimite {
  const ahora = Date.now();
  const clave = `${ambito}:${identificador}`;

  purgarVencidas(ahora);

  const ventanaActual = ventanas.get(clave);

  if (!ventanaActual || ventanaActual.expiraEn <= ahora) {
    descartarMasAntiguas();
    ventanas.set(clave, { conteo: 1, expiraEn: ahora + ventanaMinutos * 60_000 });
    return { permitido: true };
  }

  if (ventanaActual.conteo >= maximoIntentos) {
    return {
      permitido: false,
      segundosEspera: Math.max(1, Math.ceil((ventanaActual.expiraEn - ahora) / 1000)),
    };
  }

  ventanaActual.conteo += 1;
  return { permitido: true };
}
