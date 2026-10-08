import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { completarSubida } from "../src/modules/subidas-archivo/application/CompletarSubida";
import { TAMANO_MAXIMO, inicioSubidaSchema, indiceParteSchema, TAMANO_PARTE } from "../src/modules/subidas-archivo/schemas/subida.schema";
process.env.DATABASE_URL ??= "postgres://prueba:prueba@localhost:1/prueba";
process.env.AUTH_SECRET ??= "secreto-de-prueba-de-al-menos-32-caracteres";
process.env.EXCEL_ENCRYPTION_KEY_ID = "v1";
process.env.EXCEL_ENCRYPTION_KEYS = JSON.stringify({v1:randomBytes(32).toString("base64")});
const flujo = (contenido: Uint8Array) => new ReadableStream<Uint8Array>({start(controlador){controlador.enqueue(contenido);controlador.close();}});
async function entorno() {
 const { crearSesionesSubidaDisco } = await import("../src/modules/subidas-archivo/infrastructure/SesionesSubidaDisco");
 const base = await mkdtemp(path.join(os.tmpdir(), "subidas-partes-"));
 const repositorio = crearSesionesSubidaDisco(() => base);
 return {base,repositorio,limpiar:()=>rm(base,{recursive:true,force:true})};
}
test("recibe 50 MiB y última parte; cifrado persistente, propietario, orden y retry exacto",async()=>{
 const e=await entorno();try {
 const original=Buffer.alloc(TAMANO_PARTE+123,97);original.write("PK\u0003\u0004");
 const sesion=await e.repositorio.iniciar({usuarioId:"usuario",origen:"notificador",parametros:{anio:"2025",formatoExcelId:"uno"},nombreArchivo:"prueba.xlsx",tamanoBytes:original.length});
 await assert.rejects(()=>e.repositorio.leer(sesion.id,"otro","notificador"),/no existe/);
 await assert.rejects(()=>e.repositorio.recibirParte(sesion,1,flujo(original.subarray(TAMANO_PARTE))),/orden/);
 await e.repositorio.recibirParte(sesion,0,flujo(original.subarray(0,TAMANO_PARTE)));
 await e.repositorio.recibirParte(sesion,0,flujo(original.subarray(0,TAMANO_PARTE)));
 assert.equal(sesion.partes.length,1);
 const disco=await readFile(path.join(e.base,"subidas",sesion.id,sesion.partes[0].referencia));assert.equal(disco.subarray(0,8).toString(),"RPCXLS01");assert.equal(disco.includes(Buffer.alloc(1024,97)),false);
 await e.repositorio.recibirParte(sesion,1,flujo(original.subarray(TAMANO_PARTE)));
 const recuperada=await e.repositorio.leer(sesion.id,"usuario","notificador");
 assert.deepEqual(Buffer.from(await new Response(e.repositorio.concatenar(recuperada)).arrayBuffer()),original);
 let recepciones=0;
 const receptor={recuperar:async()=>null,recibir:async(_sesion:unknown,cuerpo:ReadableStream<Uint8Array>)=>{recepciones++;assert.equal((await new Response(cuerpo).arrayBuffer()).byteLength,original.length);return Response.json({carga:{id:sesion.cargaId,estado:"PROCESANDO"}},{status:202});}};
 assert.equal((await completarSubida(recuperada,e.repositorio,receptor)).status,202);
 assert.equal((await completarSubida(await e.repositorio.leer(sesion.id,"usuario","notificador"),e.repositorio,receptor)).status,202);assert.equal(recepciones,1);
 await e.repositorio.cancelar(recuperada);assert.ok(await e.repositorio.leer(sesion.id,"usuario","notificador"));
 }finally{await e.limpiar();}
});
test("tamaño exacto, contenido distinto, exclusión de sesiones y cancelación libera contexto",async()=>{
 const e=await entorno();try{
 const datos={usuarioId:"uno",origen:"bioestadistica" as const,parametros:{anio:"2025",tipoArchivo:"DEFUNCIONES"},nombreArchivo:"prueba.csv",tamanoBytes:3};
 const sesion=await e.repositorio.iniciar(datos);
 assert.equal((await e.repositorio.iniciar(datos)).id,sesion.id);
 await assert.rejects(()=>e.repositorio.iniciar({...datos,nombreArchivo:"distinto.csv"}),/Ya hay/);
 await assert.rejects(()=>e.repositorio.iniciar({...datos,tamanoBytes:4}),/Ya hay/);
 await assert.rejects(()=>e.repositorio.recibirParte(sesion,0,flujo(Buffer.from("ab"))),/incompleta/);
 await e.repositorio.recibirParte(sesion,0,flujo(Buffer.from("abc")));
 await assert.rejects(()=>e.repositorio.recibirParte(sesion,0,flujo(Buffer.from("xyz"))),/diferente/);
 await e.repositorio.bloquear(sesion.id,()=>e.repositorio.cancelar(sesion));
 assert.ok(await e.repositorio.iniciar(datos));
 }finally{await e.limpiar();}
});
test("bloqueo entre peticiones y recuperación tras caída al crear carga",async()=>{
 const e=await entorno();try{
 const sesion=await e.repositorio.iniciar({usuarioId:"uno",origen:"notificador",parametros:{anio:"2025"},nombreArchivo:"uno.xlsx",tamanoBytes:3});
 await e.repositorio.bloquear(sesion.id,async()=>{await assert.rejects(()=>e.repositorio.bloquear(sesion.id,async()=>undefined),/ocupada/);});
 await e.repositorio.recibirParte(sesion,0,flujo(Buffer.from("abc")));
 let llamado=false;
 const respuesta=await completarSubida(sesion,e.repositorio,{recuperar:async()=>Response.json({carga:{id:sesion.cargaId}},{status:202}),recibir:async()=>{llamado=true;throw new Error("No debe recibir otra vez");}});
 assert.equal(respuesta.status,202);assert.equal(llamado,false);assert.deepEqual((await readdir(path.join(e.base,"subidas",sesion.id))).sort(),["manifest.json"]);
 }finally{await e.limpiar();}
});

test("límite total y última parte, vencimiento elimina archivos y permite otra sesión",async()=>{
 assert.equal(inicioSubidaSchema.safeParse({nombreArchivo:"a.xlsx",tamanoBytes:TAMANO_MAXIMO}).success,true);
 assert.equal(inicioSubidaSchema.safeParse({nombreArchivo:"a.xlsx",tamanoBytes:TAMANO_MAXIMO+1}).success,false);
 assert.equal(inicioSubidaSchema.safeParse({nombreArchivo:"a.xlsx",tamanoBytes:0}).success,false);
 assert.equal(indiceParteSchema.safeParse(5).success,true);assert.equal(indiceParteSchema.safeParse(6).success,false);
 const e=await entorno();try{
 const datos={usuarioId:"uno",origen:"notificador" as const,parametros:{anio:"2025"},nombreArchivo:"a.xlsx",tamanoBytes:3};
 const sesion=await e.repositorio.iniciar(datos);
 await assert.rejects(()=>e.repositorio.leer(sesion.id,"uno","bioestadistica"),/no existe/);
 await assert.rejects(()=>e.repositorio.recibirParte(sesion,0,flujo(Buffer.from("abcd"))),/incorrecto/);
 sesion.actualizado=Date.now()-25*60*60*1000;
 await writeFile(path.join(e.base,"subidas",sesion.id,"manifest.json"),JSON.stringify(sesion));
 await assert.rejects(()=>e.repositorio.leer(sesion.id,"uno","notificador"),/expiró/);
 await e.repositorio.limpiar();assert.ok(await e.repositorio.iniciar(datos));
 }finally{await e.limpiar();}
});
