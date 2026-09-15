import type { Metadata } from "next";
import { AsistenteFormatoExcel } from "@/shared/components/AsistenteFormatoExcel";

export const metadata: Metadata = {
  title: "Nuevo formato de archivo - Repositorio RPC - SEREMI de Salud Biobío",
};

export default function NuevoFormatoExcelRevisorPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold text-gob-black">Nuevo formato de archivo</h1>
      <p className="mt-2 text-sm text-gob-gray-a">
        Define la estructura que deben cumplir los archivos que suban los notificadores.
      </p>

      <AsistenteFormatoExcel rutaBase="/revisor/formatos-excel" />
    </div>
  );
}
