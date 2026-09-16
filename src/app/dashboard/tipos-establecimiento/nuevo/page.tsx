import type { Metadata } from "next";
import { TipoForm } from "../tipo-form";

export const metadata: Metadata = {
  title: "Nuevo tipo de establecimiento - Repositorio RPC - SEREMI de Salud Biobío",
};

export default function NuevoTipoPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold text-gob-black">Nuevo tipo de establecimiento</h1>
      <p className="mt-2 text-sm text-gob-gray-a">
        El nombre se ofrecerá al registrar establecimientos.
      </p>

      <TipoForm modo="crear" endpoint="/api/tipos-establecimiento" metodo="POST" nombreInicial="" />
    </div>
  );
}
