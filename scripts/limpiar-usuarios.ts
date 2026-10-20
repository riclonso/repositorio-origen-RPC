import { PrismaClient } from "@prisma/client";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline";

const prisma = new PrismaClient();
const rl = createInterface({ input: stdin, output: stdout });

function preguntar(texto: string): Promise<string> {
  return new Promise((resolver) => rl.question(texto, resolver));
}

async function main() {
  console.log("\n=== LIMPIEZA DE USUARIOS Y CARGAS ===\n");
  console.log("⚠️  ADVERTENCIA: Esta operación es IRREVERSIBLE\n");

  const ids = (await preguntar("IDs de usuarios a eliminar (separados por comas): "))
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  if (ids.length === 0) {
    console.log("\n❌ No se proporcionaron IDs.");
    rl.close();
    return;
  }

  // Verificar que los usuarios existan
  console.log("\n📋 Buscando usuarios...");
  const usuarios = await prisma.usuario.findMany({
    where: { id: { in: ids } },
    select: { id: true, nombres: true, apellidos: true, rut: true },
  });

  if (usuarios.length === 0) {
    console.log("❌ No se encontraron usuarios con esos IDs.");
    rl.close();
    return;
  }

  console.log("\n📊 Usuarios encontrados:");
  usuarios.forEach((u) => {
    console.log(`  • ${u.nombres} ${u.apellidos} (${u.rut}) [${u.id}]`);
  });

  // Contar cargas por usuario
  console.log("\n📤 Cargas por usuario:");
  for (const usuario of usuarios) {
    const cargasCount = await prisma.cargaArchivo.count({
      where: { usuarioId: usuario.id },
    });
    console.log(`  • ${usuario.rut}: ${cargasCount} carga(s)`);
  }

  // Preguntar confirmación
  const confirmacion = await preguntar("\n❗ ¿Eliminar estos usuarios y todo su historial? (escribir: SÍ): ");
  if (confirmacion !== "SÍ") {
    console.log("\n✋ Operación cancelada.");
    rl.close();
    return;
  }

  console.log("\n🗑️  Eliminando...\n");

  // Transacción atómica: eliminar cargas primero, luego usuarios
  try {
    const resultado = await prisma.$transaction(async (tx) => {
      let cargasEliminadas = 0;
      let usuariosEliminados = 0;

      for (const id of ids) {
        // Eliminar cargas del usuario (CASCADE de la BD eliminará relacionados)
        const cargasCount = await tx.cargaArchivo.deleteMany({
          where: { usuarioId: id },
        });
        cargasEliminadas += cargasCount.count;

        // Eliminar cargas de Bioestadística del usuario
        const cargasBioCount = await tx.cargaBioestadistica.deleteMany({
          where: { usuarioId: id },
        });
        cargasEliminadas += cargasBioCount.count;

        // Eliminar alertas recibidas por el usuario
        const alertasCount = await tx.alertaNotificacionVentana.deleteMany({
          where: { usuarioId: id },
        });
        console.log(`  ✓ Alertas del usuario ${id}: ${alertasCount.count}`);

        // Finalmente, eliminar el usuario
        await tx.usuario.delete({
          where: { id },
        });
        usuariosEliminados += 1;
        console.log(`  ✓ Usuario eliminado: ${id}`);
      }

      return { usuariosEliminados, cargasEliminadas };
    });

    console.log(`\n✅ Limpieza completada:`);
    console.log(`   • Usuarios eliminados: ${resultado.usuariosEliminados}`);
    console.log(`   • Cargas eliminadas: ${resultado.cargasEliminadas}`);
  } catch (error) {
    console.error("\n❌ Error durante la eliminación:");
    console.error(error);
  } finally {
    rl.close();
    await prisma.$disconnect();
  }
}

main().catch(console.error);
