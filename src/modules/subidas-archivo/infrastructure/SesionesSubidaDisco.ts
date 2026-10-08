import { randomUUID, createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, readdir, stat, writeFile, utimes } from "node:fs/promises";
import path from "node:path";
import { crearAlmacenArchivosDisco } from "@/infrastructure/almacenamiento/AlmacenArchivosDisco";
import { manifiestoSchema, idSubidaSchema, TAMANO_PARTE, type ManifiestoSubida } from "../schemas/subida.schema";
import { ErrorSubida } from "../domain/ErrorSubida";

const VIGENCIA = 24 * 60 * 60 * 1000;
const obtenerCodigo = (error: unknown): string | undefined => typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;
export function crearSesionesSubidaDisco(obtenerBase: () => string) {
  const raiz = () => path.join(obtenerBase(), "subidas");
  const carpeta = (id: string) => path.join(raiz(), idSubidaSchema.parse(id));
  const almacen = (id: string) => crearAlmacenArchivosDisco({ obtenerDirectorioBase: () => carpeta(id), etiqueta: "subida por partes", bytesPrimeros: 4 });
  async function guardar(manifiesto: ManifiestoSubida) {
    manifiesto.actualizado = Date.now();
    const temporal = path.join(carpeta(manifiesto.id), `${randomUUID()}.json.tmp`);
    await writeFile(temporal, JSON.stringify(manifiesto), { mode: 0o600 });
    await rename(temporal, path.join(carpeta(manifiesto.id), "manifest.json"));
  }
  async function leer(id: string, usuarioId: string, origen: ManifiestoSubida["origen"]) {
    let manifiesto: ManifiestoSubida;
    try { manifiesto = manifiestoSchema.parse(JSON.parse(await readFile(path.join(carpeta(id), "manifest.json"), "utf8"))); }
    catch (error) { if (obtenerCodigo(error) === "ENOENT") throw new ErrorSubida("NO_ENCONTRADO", 404, "La subida no existe o expiró"); throw error; }
    if (manifiesto.usuarioId !== usuarioId || manifiesto.origen !== origen) throw new ErrorSubida("NO_ENCONTRADO", 404, "La subida no existe o expiró");
    if (Date.now() - manifiesto.actualizado > VIGENCIA) throw new ErrorSubida("SUBIDA_EXPIRADA", 410, "La subida expiró. Selecciona el archivo nuevamente");
    return manifiesto;
  }
  async function bloquear<T>(id: string, accion: () => Promise<T>): Promise<T> {
    const bloqueo = path.join(carpeta(id), "lock");
    try { await mkdir(bloqueo, { mode: 0o700 }); }
    catch (error) {
      if (obtenerCodigo(error) === "ENOENT") throw new ErrorSubida("NO_ENCONTRADO", 404, "La subida no existe");
      if (obtenerCodigo(error) !== "EEXIST") throw error;
      const informacion = await stat(bloqueo);
      if (Date.now() - informacion.mtimeMs > 10 * 60 * 1000) {
        await rm(bloqueo, { recursive: true, force: true });
        return bloquear(id, accion);
      }
      throw new ErrorSubida("SUBIDA_OCUPADA", 409, "La subida está ocupada. Reintenta en unos segundos");
    }
    const latido = setInterval(() => { const ahora = new Date(); void utimes(bloqueo, ahora, ahora).catch(() => undefined); }, 30_000);
    try { return await accion(); }
    finally { clearInterval(latido); await rm(bloqueo, { recursive: true, force: true }); }
  }
  async function limpiar() {
    let ids: string[];
    try { ids = await readdir(raiz()); } catch (error) { if (obtenerCodigo(error) === "ENOENT") return; throw error; }
    const inicio = ids.length ? Math.floor(Date.now() / 1000) % ids.length : 0;
    const candidatos = [...ids.slice(inicio), ...ids.slice(0,inicio)].slice(0,100);
    for (const id of candidatos) {
      if (!idSubidaSchema.safeParse(id).success) continue;
      try {
        const manifiesto = manifiestoSchema.parse(JSON.parse(await readFile(path.join(carpeta(id), "manifest.json"), "utf8")));
        if (Date.now() - manifiesto.actualizado <= VIGENCIA) continue;
        await bloquear(id, async () => {
          const vigente = manifiestoSchema.parse(JSON.parse(await readFile(path.join(carpeta(id), "manifest.json"), "utf8")));
          if (Date.now() - vigente.actualizado > VIGENCIA) await rm(carpeta(id), { recursive: true, force: true });
        });
      } catch (error) { if (!(error instanceof ErrorSubida) && obtenerCodigo(error) !== "ENOENT") throw error; }
    }
  }
  async function iniciar(datos: Omit<ManifiestoSubida, "id" | "cargaId" | "actualizado" | "estado" | "partes">) {
    await mkdir(raiz(), { recursive: true, mode: 0o700 });
    await limpiar();
    // Serializa creación por combinación; no confía en hashes o rutas enviados por el cliente.
    const combinacion = createHash("sha256").update(JSON.stringify([datos.usuarioId, datos.origen, datos.parametros])).digest("hex");
    const candado = path.join(raiz(), `${combinacion}.inicio`);
    try { await mkdir(candado, { mode: 0o700 }); }
    catch (error) { if (obtenerCodigo(error) === "EEXIST") {
        if (Date.now() - (await stat(candado)).mtimeMs > 10 * 60 * 1000) { await rm(candado,{recursive:true,force:true}); return iniciar(datos); }
        throw new ErrorSubida("SUBIDA_OCUPADA",409,"Otra subida está iniciándose");
      } throw error; }
    try {
      for (const id of await readdir(raiz())) {
        if (!idSubidaSchema.safeParse(id).success) continue;
        let previa: ManifiestoSubida;
        try { previa = manifiestoSchema.parse(JSON.parse(await readFile(path.join(carpeta(id), "manifest.json"), "utf8"))); }
        catch (error) { if (obtenerCodigo(error) === "ENOENT") continue; throw error; }
        if (previa.usuarioId === datos.usuarioId && previa.origen === datos.origen && JSON.stringify(previa.parametros) === JSON.stringify(datos.parametros) && previa.estado !== "COMPLETADA" && Date.now() - previa.actualizado < VIGENCIA) {
          if (previa.nombreArchivo === datos.nombreArchivo && previa.tamanoBytes === datos.tamanoBytes) return previa;
          throw new ErrorSubida("SUBIDA_EXISTENTE",409,"Ya hay una subida en curso para este formato y año");
        }
      }
      const manifiesto: ManifiestoSubida = { ...datos, id: randomUUID(), cargaId: randomUUID(), actualizado: Date.now(), estado: "RECEPCION", partes: [] };
      await mkdir(carpeta(manifiesto.id), { mode: 0o700 }); await guardar(manifiesto); return manifiesto;
    } finally { await rm(candado, { recursive: true, force: true }); }
  }
  async function recibirParte(manifiesto: ManifiestoSubida, indice: number, cuerpo: ReadableStream<Uint8Array> | null) {
    if (manifiesto.estado !== "RECEPCION" || !cuerpo) throw new ErrorSubida("PARTE_INVALIDA",409,"La subida no admite partes");
    const cantidad = Math.ceil(manifiesto.tamanoBytes / TAMANO_PARTE);
    if (indice >= cantidad || indice > manifiesto.partes.length) throw new ErrorSubida("PARTE_FUERA_ORDEN",409,"La parte no corresponde al orden de la subida");
    const esperado = Math.min(TAMANO_PARTE, manifiesto.tamanoBytes - indice * TAMANO_PARTE);
    const disco = almacen(manifiesto.id);
    const guardado = await disco.guardarTemporal(cuerpo, esperado, { usuarioId: manifiesto.usuarioId, archivoId: randomUUID(), excel: /\.xlsx$/i.test(manifiesto.nombreArchivo) });
    if (!guardado.ok) throw new ErrorSubida("TAMANO_PARTE_INVALIDO",400,"El tamaño de la parte es incorrecto");
    try {
      if (guardado.tamanoBytes !== esperado) throw new ErrorSubida("TAMANO_PARTE_INVALIDO",400,"La parte llegó incompleta");
      const anterior = manifiesto.partes[indice];
      if (anterior) {
        if (anterior.sha256 !== guardado.sha256) throw new ErrorSubida("PARTE_CONFLICTIVA",409,"La parte ya enviada tiene contenido diferente");
        await guardar(manifiesto); return;
      }
      // .part.enc mantiene el formato cifrado existente sin vincularse a un nombre .xlsx.enc definitivo.
      const referencia = `piezas/${indice}.part${guardado.referenciaTemporal.endsWith(".enc") ? ".enc" : ""}`;
      await mkdir(path.join(carpeta(manifiesto.id), "piezas"), { mode: 0o700, recursive: true });
      await rename(disco.rutaAbsoluta(guardado.referenciaTemporal), disco.rutaAbsoluta(referencia));
      manifiesto.partes.push({ referencia, sha256: guardado.sha256, tamanoBytes: guardado.tamanoBytes });
      await guardar(manifiesto);
    } finally { await disco.eliminar(guardado.referenciaTemporal); }
  }
  function concatenar(manifiesto: ManifiestoSubida): ReadableStream<Uint8Array> {
    const disco = almacen(manifiesto.id); let indice = 0; let hash = createHash("sha256"); let lector: ReadableStreamDefaultReader<Uint8Array> | undefined;
    return new ReadableStream<Uint8Array>({
      async pull(controlador) {
        try {
          for (;;) {
            if (!lector) {
              const parte = manifiesto.partes[indice++];
              if (!parte) { controlador.close(); return; }
              const abierto = await disco.abrirLectura(parte.referencia);
              if (!abierto || abierto.tamanoBytes !== parte.tamanoBytes) throw new Error("Parte almacenada incompleta");
              lector = abierto.flujo.getReader();
            }
            const trozo = await lector.read();
            if (trozo.done) {
              if (hash.digest("hex") !== manifiesto.partes[indice - 1].sha256) throw new Error("La integridad de la parte no coincide");
              hash = createHash("sha256"); lector.releaseLock(); lector = undefined; continue;
            }
            hash.update(trozo.value); controlador.enqueue(trozo.value); return;
          }
        } catch (error) { await lector?.cancel().catch(() => undefined); controlador.error(error); }
      },
      async cancel() { await lector?.cancel(); lector?.releaseLock(); },
    });
  }
  async function eliminarPartes(id: string) { await rm(path.join(carpeta(id), "piezas"), { recursive: true, force: true }); await rm(path.join(carpeta(id), "tmp"), { recursive: true, force: true }); }
  async function cancelar(manifiesto: ManifiestoSubida) {
    if (manifiesto.estado === "COMPLETADA") return;
    await rm(carpeta(manifiesto.id), { recursive: true, force: true });
  }
  return { iniciar, leer, guardar, bloquear, recibirParte, concatenar, eliminarPartes, cancelar, limpiar };
}
