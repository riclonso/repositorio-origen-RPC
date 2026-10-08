import type { Readable } from "node:stream";

// RF-38: convierte un flujo de Node en un `ReadableStream` web para un `Response`, con contrapresión
// (pausa el origen cuando la cola del cliente está llena) y cancelación SEGURA. `Readable.toWeb` no
// sirve cuando alguien sigue escribiendo en el origen (el generador de descargas): tras la cancelación
// del cliente vuelve a encolar datos ya leídos y lanza "Controller is already closed" FUERA de toda
// promesa, lo que tumbaría el proceso. Aquí, una vez cancelado o cerrado, todo lo que llega se ignora
// y el origen se destruye (quien escribe lo detecta con `destroyed`).
export function flujoWebDesdeNode(origen: Readable): ReadableStream<Uint8Array> {
  let terminado = false;

  return new ReadableStream<Uint8Array>(
    {
      start(controlador) {
        origen.on("data", (trozo: Buffer | string) => {
          if (terminado) return;
          controlador.enqueue(typeof trozo === "string" ? new TextEncoder().encode(trozo) : new Uint8Array(trozo));
          if ((controlador.desiredSize ?? 0) <= 0) origen.pause();
        });
        origen.once("end", () => {
          if (terminado) return;
          terminado = true;
          controlador.close();
        });
        // `on` y no `once`: tras destruir el origen pueden llegar más errores (escrituras tardías) y
        // un evento `error` sin escuchas también tumbaría el proceso.
        origen.on("error", (error: Error) => {
          if (terminado) return;
          terminado = true;
          controlador.error(error);
        });
        origen.pause();
      },
      pull() {
        origen.resume();
      },
      cancel() {
        terminado = true;
        origen.destroy();
      },
    },
    { highWaterMark: 4 },
  );
}
