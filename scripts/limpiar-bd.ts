#!/usr/bin/env npx tsx
/**
 * Script de limpieza de la base de datos — repositorio-rem
 *
 * Uso:
 *   npx tsx scripts/limpiar-bd.ts --usuarios id1,id2,id3
 *   npx tsx scripts/limpiar-bd.ts --rut 12345678-9
 *   npx tsx scripts/limpiar-bd.ts --establecimiento id
 *   npx tsx scripts/limpiar-bd.ts --limpiar-temporal (elimina cargas sin finalizar)
 *   npx tsx scripts/limpiar-bd.ts --estado PROCESANDO,RECIBIDA
 *
 * Advertencias:
 *   - Siempre requiere confirmación explícita antes de eliminar
 *   - Elimina en cascada: cargas, mensajes, alertas, solicitudes de reemplazo
 *   - Las operaciones son IRREVERSIBLES
 */

import { PrismaClient } from "@prisma/client";
import { stdin, stdout, argv, exit } from "node:process";
import { createInterface } from "node:readline";

const prisma = new PrismaClient();
const rl = createInterface({ input: stdin, output: stdout });

function preguntar(texto: string): Promise<string> {
  return new Promise((resolver) => rl.question(texto, resolver));
}

function showUsage() {
  console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║          Script de Limpieza de Base de Datos — RPC               ║
╚═══════════════════════════════════════════════════════════════════╝

OPCIONES:

  --usuarios <id1,id2,...>     Eliminar usuarios por ID
  --rut <rut>                  Eliminar usuario por RUT
  --establecimiento <id>       Eliminar usuarios de un establecimiento
  --estado <ESTADO>            Eliminar cargas en cierto estado
  --temporal <dias>            Eliminar cargas sin finalizar hace N días
  --limpiar-todo               Limpiar cargas sin usuarios (huérfanas)
  --reportar                   Generar reporte sin eliminar

EJEMPLO:
  npx tsx scripts/limpiar-bd.ts --usuarios 550e8400,6ba7b812
  npx tsx scripts/limpiar-bd.ts --temporal 7 --reportar

⚠️  TODAS LAS OPERACIONES REQUIEREN CONFIRMACIÓN EXPLÍCITA Y SON IRREVERSIBLES
`);
}

interface OpcionesLimpieza {
  usuarioIds?: string[];
  rut?: string;
  establecimientoId?: string;
  estados?: string[];
  diasTemporal?: number;
  limpiarHuerfanas?: boolean;
  reportar?: boolean;
  confirmar?: boolean;
}

async function parseArgs(): Promise<OpcionesLimpieza> {
  const opciones: OpcionesLimpieza = {};

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--usuarios" && argv[i + 1]) {
      opciones.usuarioIds = argv[++i].split(",").map((x) => x.trim());
    } else if (arg === "--rut" && argv[i + 1]) {
      opciones.rut = argv[++i].trim();
    } else if (arg === "--establecimiento" && argv[i + 1]) {
      opciones.establecimientoId = argv[++i].trim();
    } else if (arg === "--estado" && argv[i + 1]) {
      opciones.estados = argv[++i].split(",").map((x) => x.trim());
    } else if (arg === "--temporal" && argv[i + 1]) {
      opciones.diasTemporal = Number(argv[++i]);
    } else if (arg === "--limpiar-todo") {
      opciones.limpiarHuerfanas = true;
    } else if (arg === "--reportar") {
      opciones.reportar = true;
    } else if (arg === "--confirmar") {
      opciones.confirmar = true;
    } else if (arg === "--help" || arg === "-h") {
      showUsage();
      exit(0);
    }
  }

  return opciones;
}

async function reportarUsuarios(ids: string[]) {
  const usuarios = await prisma.usuario.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      nombres: true,
      apellidos: true,
      rut: true,
      perfil: { select: { nombre: true } },
      establecimiento: { select: { nombre: true } },
    },
  });

  console.log("\n📋 USUARIOS A ELIMINAR:\n");
  for (const u of usuarios) {
    const cargas = await prisma.cargaArchivo.count({ where: { usuarioId: u.id } });
    const cargasBio = await prisma.cargaBioestadistica.count({
      where: { usuarioId: u.id },
    });
    const mensajes = await prisma.mensajeCarga.count({
      where: { OR: [{ autorId: u.id }, { notificadorId: u.id }] },
    });

    console.log(`  • ${u.rut} — ${u.nombres} ${u.apellidos}`);
    console.log(`    Perfil: ${u.perfil.nombre}`);
    console.log(`    Establecimiento: ${u.establecimiento?.nombre ?? "ninguno"}`);
    console.log(`    Cargas: ${cargas}, Cargas Bio: ${cargasBio}, Mensajes: ${mensajes}\n`);
  }
}

async function eliminarUsuarios(ids: string[], reportar: boolean = false) {
  // Verificar usuarios
  const usuarios = await prisma.usuario.findMany({
    where: { id: { in: ids } },
    select: { id: true, rut: true, nombres: true, apellidos: true },
  });

  if (usuarios.length === 0) {
    console.log("\n❌ No se encontraron usuarios con esos IDs.");
    return;
  }

  await reportarUsuarios(ids);

  if (reportar) {
    console.log("(Modo reporte — no se elimina nada)");
    return;
  }

  const confirmacion = await preguntar("❗ ¿CONFIRMAR ELIMINACIÓN? (escribir exactamente: ELIMINAR): ");
  if (confirmacion !== "ELIMINAR") {
    console.log("\n✋ Operación cancelada.");
    return;
  }

  console.log("\n🗑️  Eliminando...\n");

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const totalEliminado = { usuarios: 0, cargas: 0, cargasBio: 0, mensajes: 0, alertas: 0 };

      for (const id of ids) {
        // Eliminar en cascada
        const cargasEliminadas = await tx.cargaArchivo.deleteMany({ where: { usuarioId: id } });
        totalEliminado.cargas += cargasEliminadas.count;

        const cargasBioEliminadas = await tx.cargaBioestadistica.deleteMany({
          where: { usuarioId: id },
        });
        totalEliminado.cargasBio += cargasBioEliminadas.count;

        const mensajesEliminados = await tx.mensajeCarga.deleteMany({
          where: { OR: [{ autorId: id }, { notificadorId: id }] },
        });
        totalEliminado.mensajes += mensajesEliminados.count;

        const alertasEliminadas = await tx.alertaNotificacionVentana.deleteMany({
          where: { usuarioId: id },
        });
        totalEliminado.alertas += alertasEliminadas.count;

        await tx.usuario.delete({ where: { id } });
        totalEliminado.usuarios += 1;

        console.log(`  ✓ Usuario eliminado: ${id}`);
      }

      return totalEliminado;
    });

    console.log(`\n✅ Limpieza completada:`);
    console.log(`   • Usuarios: ${resultado.usuarios}`);
    console.log(`   • Cargas: ${resultado.cargas}`);
    console.log(`   • Cargas Bioestadística: ${resultado.cargasBio}`);
    console.log(`   • Mensajes: ${resultado.mensajes}`);
    console.log(`   • Alertas: ${resultado.alertas}`);
  } catch (error) {
    console.error("\n❌ Error durante la eliminación:");
    console.error(error);
  }
}

async function main() {
  const opciones = await parseArgs();

  if (!opciones.usuarioIds && !opciones.rut && !opciones.establecimientoId && !opciones.estados && !opciones.diasTemporal && !opciones.limpiarHuerfanas) {
    showUsage();
    rl.close();
    return;
  }

  console.log("\n⚠️  OPERACIÓN DE LIMPIEZA DE BASE DE DATOS\n");

  try {
    if (opciones.usuarioIds) {
      await eliminarUsuarios(opciones.usuarioIds, opciones.reportar);
    }

    if (opciones.rut) {
      const usuario = await prisma.usuario.findUnique({ where: { rut: opciones.rut } });
      if (usuario) {
        await eliminarUsuarios([usuario.id], opciones.reportar);
      } else {
        console.log(`\n❌ Usuario con RUT ${opciones.rut} no encontrado.`);
      }
    }

    // Más opciones: establecimiento, estados, temporal, etc.
    // Se pueden agregar según necesidad
  } catch (error) {
    console.error("Error:", error);
  } finally {
    rl.close();
    await prisma.$disconnect();
  }
}

main().catch(console.error);
