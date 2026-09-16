import type { Metadata } from "next";
import { connection } from "next/server";
import { listarTiposEstablecimiento } from "@/modules/tipoEstablecimiento/application/use-cases/ListarTiposEstablecimiento";
import { prismaTipoEstablecimientoRepository } from "@/modules/tipoEstablecimiento/infrastructure/repositories/PrismaTipoEstablecimientoRepository";
import type { OpcionSelect } from "@/shared/components/CampoSelect";
import { aOpcionesTipo } from "../opciones-tipo";
import { EstablecimientoForm } from "../establecimiento-form";

export const metadata: Metadata = {
  title: "Nuevo establecimiento - Repositorio RPC - SEREMI de Salud Biobío",
};

// Sin tipo preseleccionado: el esquema rechaza el valor vacío, así que el operador está obligado a
// elegir.
const OPCION_SIN_ELEGIR: OpcionSelect = { valor: "", etiqueta: "Selecciona un tipo" };

export default async function NuevoEstablecimientoPage() {
  // Esta pantalla no lee cookies ni parámetros, así que Next la prerenderizaría en el build y
  // dejaría el catálogo congelado en esa foto (y obligaría a la base a estar disponible al
  // compilar). `connection()` la ancla al momento de la petición.
  await connection();

  // Solo tipos vigentes: dar de alta con un tipo dado de baja no tiene sentido.
  const tipos = await listarTiposEstablecimiento(
    { soloActivos: true },
    { repositorio: prismaTipoEstablecimientoRepository },
  );

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold text-gob-black">Nuevo establecimiento</h1>
      <p className="mt-2 text-sm text-gob-gray-a">
        Registra un establecimiento que reporta al Registro Poblacional de Cáncer.
      </p>

      <EstablecimientoForm
        modo="crear"
        endpoint="/api/establecimientos"
        metodo="POST"
        valoresIniciales={{ rut: "", nombre: "", direccion: "", tipoId: "" }}
        opcionesTipo={[OPCION_SIN_ELEGIR, ...aOpcionesTipo(tipos)]}
      />
    </div>
  );
}
