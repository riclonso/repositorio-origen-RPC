import type { ErrorCargaArchivo } from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import { IconoAdvertencia} from "@/shared/components/iconos";

// `COLUMNA_FALTANTE`/`COLUMNA_INESPERADA` son errores de estructura (el archivo no tiene las
// columnas del formato, no un dato puntual mal escrito): un mensaje de fila no ayuda tanto como
// sugerir revisar el formato o volver a descargar la plantilla vigente.
function tieneErrorDeEstructura(errores: ErrorCargaArchivo[]): boolean {
  return errores.some((error) => error.tipoError === "COLUMNA_FALTANTE" || error.tipoError === "COLUMNA_INESPERADA");
}

type SugerenciaErrorEstructuraProps = {
  errores: ErrorCargaArchivo[];
};

export function SugerenciaErrorEstructura({ errores }: SugerenciaErrorEstructuraProps) {
  if (!tieneErrorDeEstructura(errores)) return null;

  return (
    <div role="alert" className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
      <IconoAdvertencia className="mt-0.5 shrink-0 text-amber-600" />
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-amber-900">
          Las columnas de tu archivo no coinciden con las del formato requerido. Revisa el nombre y el orden de las
          columnas, o descarga la plantilla vigente para asegurarte de usar el formato correcto.
        </p>
      </div>
    </div>
  );
}
