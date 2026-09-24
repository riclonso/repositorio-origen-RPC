import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { listarFormatosExcel } from "@/modules/formatos-excel/application/use-cases/ListarFormatosExcel";
import { prismaFormatoExcelRepository } from "@/modules/formatos-excel/infrastructure/repositories/PrismaFormatoExcelRepository";
import { TablaFormatosExcel } from "@/shared/components/TablaFormatosExcel";

export const metadata: Metadata = {
  title: "Formatos de archivo - Repositorio RPC - SEREMI de Salud Biobío",
};

const RUTA_FORMATOS_EXCEL = "/revisor/formatos-excel";

const CLASES_BOTON_PRIMARIO =
  "inline-flex items-center justify-center rounded-lg bg-gob-primary px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-gob-primary-oscuro active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary";

// Mismo listado que `/dashboard/formatos-excel` (RF-06 extendido a REVISOR_REPOSITORIO): acceso
// completo y simétrico al mantenedor de formatos de archivo, sin restricción de autoría. La
// pantalla comparte componentes con `shared/components/`, y los endpoints bajo
// `/api/formatos-excel/**` (guardados con `exigirAdminORevisor()`) son los mismos para ambos
// paneles.
export default async function FormatosExcelRevisorPage() {
  // Esta pantalla no lee cookies ni parámetros: sin `connection()`, Next la prerenderizaría en
  // el build y dejaría el listado congelado en esa foto (mismo motivo que en
  // `usuarios/nuevo/page.tsx`).
  await connection();

  const formatos = await listarFormatosExcel({ repositorio: prismaFormatoExcelRepository });

  return (
    <div>
      <section className="mb-8 border-b border-gob-accent/30 pb-6">
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div className="space-y-3">
            <h1 className="text-3xl font-bold tracking-tight text-gob-tertiary">Formatos de archivo</h1>
            <p className="text-base text-gob-gray-a max-w-2xl leading-relaxed">
              Define las columnas y campos requeridos que deben cumplir los archivos que suben los
              notificadores.
            </p>
          </div>

          <Link href={`${RUTA_FORMATOS_EXCEL}/nuevo`} className={`${CLASES_BOTON_PRIMARIO} self-start sm:self-auto`}>
            Nuevo formato
          </Link>
        </div>
      </section>

      {formatos.length > 0 ? (
        <TablaFormatosExcel filas={formatos} rutaBase={RUTA_FORMATOS_EXCEL} />
      ) : (
        <div className="card-sistema rounded-lg border-2 border-dashed border-gob-accent/50 p-8 text-center">
          <p className="text-lg font-semibold text-gob-tertiary">Aún no hay formatos configurados</p>
          <p className="mt-2 text-base text-gob-gray-a">
            Crea el primer formato para poder asignarlo a un notificador.
          </p>
          <div className="mt-6 flex justify-center">
            <Link href={`${RUTA_FORMATOS_EXCEL}/nuevo`} className={CLASES_BOTON_PRIMARIO}>
              Crear formato
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
