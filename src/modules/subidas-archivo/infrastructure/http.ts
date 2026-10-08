import { NextResponse } from "next/server";
import { env, directorioArchivosCargas, directorioArchivosBioestadistica } from "@/infrastructure/config/env";
import { logger } from "@/infrastructure/logging/logger";
import { detalleErrorSeguro } from "@/infrastructure/logging/detalleErrorSeguro";
import { exigirNotificador, exigirBioestadistica, respuestaSinAcceso } from "@/app/api/_lib/http";
import { recibirCompleto as recibirNotificador, dependenciasRecepcion as depsNotificador } from "@/app/api/notificador/cargas/_lib/recepcion";
import { recibirCompleto as recibirBio, dependenciasRecepcion as depsBio } from "@/app/api/bioestadistica/cargas/_lib/recepcion";
import { validarInicioCarga } from "@/modules/reporte-excel/application/use-cases/RecibirArchivoCarga";
import { validarInicioBioestadistica } from "@/modules/bioestadistica/application/use-cases/RecibirArchivoBioestadistica";
import { subirCargaArchivoSchema } from "@/modules/reporte-excel/schemas/reporte-excel.schema";
import { subirArchivoBioestadisticaSchema } from "@/modules/bioestadistica/schemas/bioestadistica.schema";
import { respuestaRechazoRecepcionCarga } from "@/app/api/notificador/cargas/_lib/http";
import { respuestaRechazoRecepcion } from "@/app/api/bioestadistica/_lib/http";
import { inicioSubidaSchema, idSubidaSchema, indiceParteSchema, TAMANO_PARTE, type ManifiestoSubida } from "../schemas/subida.schema";
import { ErrorSubida } from "../domain/ErrorSubida";
import { crearSesionesSubidaDisco } from "./SesionesSubidaDisco";
import { clavesExcelDesdeEntorno } from "@/infrastructure/cifrado/CifradoExcel";
import { completarSubida } from "../application/CompletarSubida";

type Origen = ManifiestoSubida["origen"];
const repositorios = { notificador: crearSesionesSubidaDisco(directorioArchivosCargas), bioestadistica: crearSesionesSubidaDisco(directorioArchivosBioestadistica) };
function dto(manifiesto: ManifiestoSubida) { return { subida: { id: manifiesto.id, tamanoParteBytes: TAMANO_PARTE, siguienteParte: manifiesto.partes.length, estado: manifiesto.estado, resultado: manifiesto.resultado } }; }
function origenPermitido(request: Request) {
  const origen = request.headers.get("origin");
  const esperado = env.APP_URL ? new URL(env.APP_URL).origin : new URL(request.url).origin;
  return origen === esperado && request.headers.get("sec-fetch-site") !== "cross-site";
}
async function prevalidar(origen: Origen, usuarioId: string, parametros: Record<string,string>, nombreArchivoOriginal: string, tamanoDeclarado: number): Promise<Response | null> {
  const comun = { usuarioId, nombreArchivoOriginal, tamanoDeclarado, cuerpo: null, ahora: new Date() };
  if (origen === "notificador") {
    const datos = subirCargaArchivoSchema.parse(parametros);
    const resultado = await validarInicioCarga({ ...comun, ...datos }, depsNotificador);
    return resultado.ok ? null : respuestaRechazoRecepcionCarga(resultado.motivo);
  }
  const datos = subirArchivoBioestadisticaSchema.parse(parametros);
  const resultado = await validarInicioBioestadistica({ ...comun, ...datos }, depsBio);
  return resultado.ok ? null : respuestaRechazoRecepcion(resultado.motivo, null);
}
async function leerInicio(request: Request): Promise<unknown> {
  if (!request.body) throw new ErrorSubida("DATOS_INVALIDOS",400,"Faltan datos de la subida");
  const lector = request.body.getReader(); const trozos: Uint8Array[] = []; let total = 0;
  try { for (;;) { const {done,value} = await lector.read(); if (done) break; total += value.byteLength; if (total > 4096) { await lector.cancel(); throw new ErrorSubida("DATOS_INVALIDOS",400,"Los datos enviados no son válidos"); } trozos.push(value); } }
  finally { lector.releaseLock(); }
  try { return JSON.parse(Buffer.concat(trozos).toString("utf8")) as unknown; }
  catch { throw new ErrorSubida("DATOS_INVALIDOS",400,"Los datos enviados no son válidos"); }
}
export async function atenderSubida(request: Request, origen: Origen, accion: "iniciar" | "estado" | "parte" | "completar" | "cancelar", id?: string, indice?: string): Promise<Response> {
  if (!origenPermitido(request) && accion !== "estado") return NextResponse.json({ error: "Origen no permitido", codigo: "SIN_ACCESO" }, { status: 403 });
  const acceso = await (origen === "notificador" ? exigirNotificador() : exigirBioestadistica());
  if (!acceso.ok) return respuestaSinAcceso(acceso.estado);
  const repositorio = repositorios[origen];
  try {
    if (accion === "iniciar") {
      const longitud = Number(request.headers.get("content-length"));
      if (longitud > 4096) throw new ErrorSubida("DATOS_INVALIDOS",400,"Los datos enviados no son válidos");
      const datos = inicioSubidaSchema.parse(await leerInicio(request));
      const schema = origen === "notificador" ? subirCargaArchivoSchema : subirArchivoBioestadisticaSchema;
      const parametrosValidos = schema.parse(Object.fromEntries(new URL(request.url).searchParams));
      if (!/\.xlsx$/i.test(datos.nombreArchivo) && (origen === "notificador" || !/\.csv$/i.test(datos.nombreArchivo))) throw new ErrorSubida("ARCHIVO_INVALIDO",400,"El tipo de archivo no está permitido");
      const parametros = Object.fromEntries(Object.entries(parametrosValidos).map(([clave, valor]) => [clave, String(valor)]));
      const rechazo = await prevalidar(origen, acceso.sesion.sub, parametros, datos.nombreArchivo, datos.tamanoBytes);
      if (rechazo) return rechazo;
      if (/\.xlsx$/i.test(datos.nombreArchivo)) clavesExcelDesdeEntorno();
      return NextResponse.json(dto(await repositorio.iniciar({ usuarioId: acceso.sesion.sub, origen, parametros, nombreArchivo: datos.nombreArchivo, tamanoBytes: datos.tamanoBytes })), {status:201});
    }
    const subidaId = idSubidaSchema.parse(id);
    if (accion === "estado") return NextResponse.json(dto(await repositorio.leer(subidaId, acceso.sesion.sub, origen)), { headers: { "Cache-Control": "no-store" } });
    await repositorio.leer(subidaId, acceso.sesion.sub, origen);
    return await repositorio.bloquear(subidaId, async () => {
      const manifiesto = await repositorio.leer(subidaId, acceso.sesion.sub, origen);
      if (accion === "cancelar") { await repositorio.cancelar(manifiesto); return new Response(null,{status:204}); }
      if (accion === "parte") {
        await repositorio.recibirParte(manifiesto, indiceParteSchema.parse(indice), request.body);
        return NextResponse.json(dto(manifiesto));
      }
      return completarSubida(manifiesto, repositorio, {
        async recuperar(sesion) {
          const carga = origen === "notificador" ? await depsNotificador.repositorio.obtenerPorId(sesion.cargaId) : await depsBio.repositorioCargas.obtenerPropia(sesion.cargaId, sesion.usuarioId);
          return carga && carga.usuarioId === sesion.usuarioId ? Response.json({carga:{id:carga.id,estado:carga.estado}},{status:202}) : null;
        },
        async recibir(sesion, cuerpo) {
          const url = new URL(`/api/${origen}/cargas`, request.url); url.search = new URLSearchParams(sesion.parametros).toString();
          const cabeceras = new Headers(request.headers); cabeceras.set("x-nombre-archivo",encodeURIComponent(sesion.nombreArchivo)); cabeceras.set("content-length",String(sesion.tamanoBytes));
          const reconstruida = new Request(url, { method:"POST", headers:cabeceras, body:cuerpo, duplex:"half" } as RequestInit & {duplex:"half"});
          return (origen === "notificador" ? recibirNotificador : recibirBio)(reconstruida,sesion.cargaId);
        },
      });
    });
  } catch (error) {
    if (error instanceof ErrorSubida) return NextResponse.json({error:error.message,codigo:error.codigo},{status:error.estado});
    if (error instanceof Error && error.name === "ZodError") return NextResponse.json({error:"Los datos enviados no son válidos",codigo:"DATOS_INVALIDOS"},{status:400});
    logger.error("Error en subida por partes", { origen, accion, ...detalleErrorSeguro(error) });
    return NextResponse.json({error:"No se pudo completar la subida. Intenta nuevamente.",codigo:"ERROR_INTERNO"},{status:500});
  }
}
