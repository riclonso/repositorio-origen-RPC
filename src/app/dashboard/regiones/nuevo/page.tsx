import type { Metadata } from "next";
import { RegionForm } from "../region-form";

export const metadata: Metadata = {
  title: "Nueva región - Repositorio RPC - SEREMI de Salud Biobío",
};

const VALORES_VACIOS = { nombre: "", codigo: "", numero: "" };

export default function NuevaRegionPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold text-gob-black">Nueva región</h1>
      <p className="mt-2 text-sm text-gob-gray-a">
        El número, el código y el nombre deben ser únicos en el catálogo.
      </p>

      <RegionForm
        modo="crear"
        endpoint="/api/regiones"
        metodo="POST"
        valoresIniciales={VALORES_VACIOS}
      />
    </div>
  );
}
