import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { listarFormatosExcel } from "@/modules/formatos-excel/application/use-cases/ListarFormatosExcel";
import { prismaFormatoExcelRepository } from "@/modules/formatos-excel/infrastructure/repositories/PrismaFormatoExcelRepository";
import { RUTA_FORMATOS_EXCEL } from "./ruta-formatos-excel";
import { TablaFormatosExcel } from "./tabla-formatos-excel";

export const metadata: Metadata = {
  title: "Formatos de archivo - Repositorio RPC - SEREMI de Salud Biobío",
};

const CLASES_BOTON_PRIMARIO =
  "inline-flex items-center justify-center rounded-md bg-gob-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gob-tertiary active:translate-y-[1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary";

export default async function FormatosExcelPage() {
  // Esta pantalla no lee cookies ni parámetros: sin `connection()`, Next la prerenderizaría en
  // el build y dejaría el listado congelado en esa foto (mismo motivo que en
  // `usuarios/nuevo/page.tsx`).
  await connection();

  const formatos = await listarFormatosExcel({ repositorio: prismaFormatoExcelRepository });

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gob-black">Formatos de archivo</h1>
          <p className="mt-2 text-sm text-gob-gray-a">
            Define las columnas y campos requeridos que deben cumplir los archivos que suben los
            notificadores.
          </p>
        </div>

        <Link href={`${RUTA_FORMATOS_EXCEL}/nuevo`} className={CLASES_BOTON_PRIMARIO}>
          Nuevo formato
        </Link>
      </div>

      {formatos.length > 0 ? (
        <TablaFormatosExcel filas={formatos} />
      ) : (
        <div className="mt-6 rounded-lg border border-gob-accent bg-white p-8 text-center">
          <p className="text-base font-semibold text-gob-black">Aún no hay formatos configurados</p>
          <p className="mt-2 text-sm text-gob-gray-a">
            Crea el primer formato para poder asignarlo a un notificador.
          </p>
          <div className="mt-4 flex justify-center">
            <Link href={`${RUTA_FORMATOS_EXCEL}/nuevo`} className={CLASES_BOTON_PRIMARIO}>
              Crear formato
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
