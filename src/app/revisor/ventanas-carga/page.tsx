import type { Metadata } from "next";
import { connection } from "next/server";
import { ListadoVentanasCarga } from "@/shared/components/ListadoVentanasCarga";

export const metadata: Metadata = {
  title: "Ventanas de carga - Repositorio RPC - SEREMI de Salud Biobío",
};

export default async function VentanasCargaRevisorPage() {
  // Esta pantalla no lee cookies ni parámetros: sin `connection()`, Next la prerenderizaría en el
  // build y dejaría el listado congelado en esa foto (mismo motivo que `formatos-excel/page.tsx`).
  await connection();

  return (
    <div>
      <section className="mb-8 border-b border-gob-accent/30 pb-6">
        <div className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight text-gob-tertiary">Ventanas de carga</h1>
          <p className="text-base text-gob-gray-a max-w-2xl leading-relaxed">
            Define, por año, el período durante el cual un notificador puede subir un archivo de
            reporte. La ventana se cierra automáticamente al vencer, pero sus fechas y su formato de
            archivo pueden editarse en cualquier momento. Debe publicarse con el interruptor de la
            tabla para que sea visible en el panel del notificador.
          </p>
        </div>
      </section>

      <ListadoVentanasCarga rutaBase="/revisor/ventanas-carga" />
    </div>
  );
}
