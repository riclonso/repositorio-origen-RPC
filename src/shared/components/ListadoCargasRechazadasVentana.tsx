import { listarCargasRechazadas } from "@/modules/reporte-excel/application/use-cases/ListarCargasRechazadas";
import { prismaCargaArchivoRepository } from "@/modules/reporte-excel/infrastructure/repositories/PrismaCargaArchivoRepository";
import { formatearFechaHora } from "@/shared/utils/fecha";
import { TablaCargasRechazadasVentana, type FilaCargaRechazadaVista } from "@/shared/components/TablaCargasRechazadasVentana";

// Tope defensivo, sin paginación en URL (a diferencia de "Cargas aprobadas"): el volumen esperado
// de rechazos por ventana es bajo, mismo criterio de simplicidad que otras vistas secundarias del
// panel (p. ej. `TablaNotificadoresPendientesVentana`).
const TAMANO_PAGINA = 50;

type ListadoCargasRechazadasVentanaProps = {
  ventanaCargaId: string;
};

// Server Component compartido entre `/dashboard/ventanas-carga/[id]` y
// `/revisor/ventanas-carga/[id]`: lista las cargas ya RECHAZADAS de una ventana puntual. El filtro
// `estado = RECHAZADA` + `ventanaCargaId` se aplica siempre a nivel de consulta SQL
// (`listarRechazadas` en `PrismaCargaArchivoRepository`), nunca en la UI.
export async function ListadoCargasRechazadasVentana({ ventanaCargaId }: ListadoCargasRechazadasVentanaProps) {
  const resultado = await listarCargasRechazadas(
    { ventanaCargaId, pagina: 1, tamano: TAMANO_PAGINA },
    { repositorio: prismaCargaArchivoRepository },
  );

  const filas: FilaCargaRechazadaVista[] = resultado.filas
    .filter((carga): carga is typeof carga & { rechazo: NonNullable<typeof carga.rechazo> } => carga.rechazo !== null)
    .map((carga) => ({
      id: carga.id,
      usuarioNombre: carga.usuarioNombre,
      usuarioRut: carga.usuarioRut,
      nombreArchivoOriginal: carga.nombreArchivoOriginal,
      motivo: carga.rechazo.motivo,
      rechazadoPorNombre: carga.rechazo.rechazadoPorNombre,
      rechazadoEl: formatearFechaHora(carga.rechazo.rechazadoEn),
    }));

  if (filas.length === 0) {
    return (
      <div className="mt-6 rounded-lg border border-gob-accent bg-white p-8 text-center">
        <p className="text-base font-semibold text-gob-black">Ninguna carga ha sido rechazada</p>
        <p className="mt-2 text-sm text-gob-gray-a">
          Cuando un administrador o el revisor del repositorio rechace una carga aprobada de esta ventana, aparecerá
          aquí.
        </p>
      </div>
    );
  }

  return <TablaCargasRechazadasVentana filas={filas} />;
}
