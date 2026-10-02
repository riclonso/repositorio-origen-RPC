import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// Script puntual de corrección de datos (bloqueo del reemplazo de cargas aprobadas). Antes de la
// corrección, una `SolicitudReemplazoCarga` APROBADA se consumía al SUBIR el archivo, aunque ese
// intento tuviera errores o el notificador nunca lo finalizara: el notificador quedaba bloqueado con
// `REEMPLAZO_NO_AUTORIZADO`. Ahora se consume al finalizar. Este script libera
// (`utilizadaEn = NULL`, `nuevaCargaArchivoId = NULL`) las solicitudes que quedaron consumidas por
// un intento que nunca llegó a enviarse:
//
//   - `estado = APROBADA` y `utilizadaEn` no nulo, y
//   - su `nuevaCargaArchivo` está en `CON_ERRORES`, o en `PENDIENTE_VISTO_BUENO` sin `finalizadaEn`, y
//   - siguen dentro de su vigencia (5 días desde `revisadoEn`, hasta las 23:59 hora de Chile).
//
// Por defecto es DRY-RUN (solo informa). Para escribir: `--aplicar`.
//
//   npm run datos:liberar-solicitudes-reemplazo              # dry-run
//   npm run datos:liberar-solicitudes-reemplazo -- --aplicar # aplica
//
// Solo imprime ids y conteos: nunca motivos ni datos personales.

try {
  process.loadEnvFile();
} catch {
  // Sin .env: se usan las variables de entorno tal como estén.
}

// DUPLICADO a propósito (este script no importa nada de `src/`, mismo criterio que
// `seed-admin.ts`). Fuente de verdad: `DIAS_VIGENCIA_SOLICITUD_APROBADA` y `solicitudUtilizable()`
// en src/modules/solicitudes-reemplazo/domain/entities/SolicitudReemplazoCarga.ts, y
// `finDelDiaChile()` en src/shared/utils/fecha.ts. Si cambian allá, hay que cambiarlos aquí.
const DIAS_VIGENCIA_SOLICITUD_APROBADA = 5;

const FORMATEADOR_PARTES_CHILE = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Santiago",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function desfaseChileMs(instante: Date): number {
  const partes = Object.fromEntries(
    FORMATEADOR_PARTES_CHILE.formatToParts(instante).map((parte) => [parte.type, parte.value]),
  );
  const paredComoUtc = Date.UTC(
    Number(partes.year),
    Number(partes.month) - 1,
    Number(partes.day),
    Number(partes.hour),
    Number(partes.minute),
    Number(partes.second),
    instante.getUTCMilliseconds(),
  );
  return paredComoUtc - instante.getTime();
}

function instanteAParedChile(instante: Date): Date {
  return new Date(instante.getTime() + desfaseChileMs(instante));
}

function paredChileAInstante(pared: Date): Date {
  const estimado = pared.getTime() - desfaseChileMs(pared);
  return new Date(pared.getTime() - desfaseChileMs(new Date(estimado)));
}

function finDelDiaChile(instante: Date, diasExtra: number): Date {
  const pared = instanteAParedChile(instante);
  pared.setUTCDate(pared.getUTCDate() + diasExtra);
  pared.setUTCHours(23, 59, 59, 999);
  return paredChileAInstante(pared);
}

// DUPLICADO de `DIAS_REAPERTURA_TRAS_VENCIMIENTO` y `fechaLimiteReapertura()` en
// src/modules/reporte-excel/domain/entities/CargaArchivoRechazo.ts (mismo criterio que arriba).
const DIAS_REAPERTURA_TRAS_VENCIMIENTO = 5;

function fechaLimiteReapertura(rechazadoEn: Date, fechaVencimientoVentana: Date): Date {
  const vencimientoVentana = paredChileAInstante(fechaVencimientoVentana);
  if (vencimientoVentana.getTime() > rechazadoEn.getTime()) return vencimientoVentana;
  return finDelDiaChile(rechazadoEn, DIAS_REAPERTURA_TRAS_VENCIMIENTO);
}

// SOLO INFORMATIVO (nunca escribe, ni con `--aplicar`): reaperturas que el código anterior consumió
// al SUBIR con la ventana cerrada, enlazadas a un intento que nunca se envió (`CON_ERRORES` o
// `PENDIENTE_VISTO_BUENO` sin finalizar), y cuyo plazo de reapertura sigue vigente. Su liberación
// queda a decisión aparte. Solo ids y conteos.
async function informarReaperturasConsumidasPorIntentoNoEnviado(prisma: PrismaClient, ahora: Date): Promise<void> {
  const rechazos = await prisma.cargaArchivoRechazo.findMany({
    where: {
      reaperturaConsumidaPorCargaArchivo: {
        is: { OR: [{ estado: "CON_ERRORES" }, { estado: "PENDIENTE_VISTO_BUENO", finalizadaEn: null }] },
      },
    },
    select: {
      id: true,
      rechazadoEn: true,
      reaperturaConsumidaPorCargaArchivoId: true,
      cargaArchivo: { select: { ventanaCarga: { select: { fechaVencimiento: true } } } },
    },
    orderBy: { rechazadoEn: "asc" },
  });

  const enPlazo = rechazos.filter(
    (rechazo) =>
      ahora.getTime() <=
      fechaLimiteReapertura(rechazo.rechazadoEn, rechazo.cargaArchivo.ventanaCarga.fechaVencimiento).getTime(),
  );

  console.log(`[Informativo, no se modifica] Reaperturas consumidas por un intento no enviado: ${rechazos.length}`);
  console.log(`[Informativo, no se modifica] De ellas, con plazo de reapertura vigente: ${enPlazo.length}`);
  for (const rechazo of enPlazo) {
    console.log(`  rechazo ${rechazo.id} <- carga ${rechazo.reaperturaConsumidaPorCargaArchivoId ?? "-"}`);
  }
}

async function main(): Promise<void> {
  const aplicar = process.argv.includes("--aplicar");
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("Falta DATABASE_URL");
  }

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  try {
    const candidatas = await prisma.solicitudReemplazoCarga.findMany({
      where: {
        estado: "APROBADA",
        utilizadaEn: { not: null },
        nuevaCargaArchivo: {
          is: {
            OR: [{ estado: "CON_ERRORES" }, { estado: "PENDIENTE_VISTO_BUENO", finalizadaEn: null }],
          },
        },
      },
      select: { id: true, revisadoEn: true, nuevaCargaArchivoId: true },
      orderBy: { revisadoEn: "asc" },
    });

    const ahora = new Date();
    const vigentes = candidatas.filter(
      (solicitud) =>
        solicitud.revisadoEn !== null &&
        ahora.getTime() <= finDelDiaChile(solicitud.revisadoEn, DIAS_VIGENCIA_SOLICITUD_APROBADA).getTime(),
    );

    console.log(`Modo: ${aplicar ? "APLICAR" : "DRY-RUN (usa --aplicar para escribir)"}`);
    console.log(`Solicitudes consumidas por un intento no enviado: ${candidatas.length}`);
    console.log(`De ellas, todavía dentro de su vigencia (a liberar): ${vigentes.length}`);
    for (const solicitud of vigentes) {
      console.log(`  solicitud ${solicitud.id} <- carga ${solicitud.nuevaCargaArchivoId ?? "-"}`);
    }

    await informarReaperturasConsumidasPorIntentoNoEnviado(prisma, ahora);

    if (!aplicar || vigentes.length === 0) {
      return;
    }

    // Mismas condiciones en el `WHERE` de la escritura: si entre la lectura y la escritura alguna
    // cambió (p.ej. se finalizó la carga), no se toca.
    const resultado = await prisma.solicitudReemplazoCarga.updateMany({
      where: {
        id: { in: vigentes.map((solicitud) => solicitud.id) },
        estado: "APROBADA",
        utilizadaEn: { not: null },
        nuevaCargaArchivo: {
          is: {
            OR: [{ estado: "CON_ERRORES" }, { estado: "PENDIENTE_VISTO_BUENO", finalizadaEn: null }],
          },
        },
      },
      data: { utilizadaEn: null, nuevaCargaArchivoId: null },
    });

    console.log(`Liberadas: ${resultado.count}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Error al liberar solicitudes de reemplazo:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
