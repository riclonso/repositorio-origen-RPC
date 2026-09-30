import type { Metadata } from "next";
import { connection } from "next/server";
import { listarProvincias } from "@/modules/provincias/application/use-cases/ListarProvincias";
import { prismaProvinciaRepository } from "@/modules/provincias/infrastructure/repositories/PrismaProvinciaRepository";
import { aGruposProvinciaPorRegion } from "@/shared/components/opciones-territorio";
import { ComunaForm } from "../comuna-form";

export const metadata: Metadata = {
  title: "Nueva comuna - Repositorio RPC - SEREMI de Salud Biobío",
};

const VALORES_VACIOS = { nombre: "", codigo: "", provinciaId: "" };

export default async function NuevaComunaPage() {
  // Esta pantalla no lee cookies ni parámetros, así que Next la prerenderizaría en el build y
  // dejaría el catálogo de provincias congelado en esa foto. `connection()` la ancla al momento
  // de la petición.
  await connection();

  const provincias = await listarProvincias({}, { repositorio: prismaProvinciaRepository });

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold text-gob-black">Nueva comuna</h1>
      <p className="mt-2 text-sm text-gob-gray-a">
        El código debe ser único y el nombre no puede repetirse dentro de la provincia.
      </p>

      <ComunaForm
        modo="crear"
        endpoint="/api/comunas"
        metodo="POST"
        valoresIniciales={VALORES_VACIOS}
        gruposProvincia={aGruposProvinciaPorRegion(provincias)}
      />
    </div>
  );
}
