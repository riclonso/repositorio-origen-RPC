import { EsqueletoTabla } from "@/shared/components/EsqueletoTabla";

const COLUMNAS_ESQUELETO = ["w-12", "w-48", "w-40"];
const FILAS_ESQUELETO = [0, 1, 2, 3, 4];

export default function CargandoProvincias() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-gob-black">Provincias</h1>
      <p className="mt-2 text-sm text-gob-gray-a">Cargando el catálogo de provincias.</p>
      <EsqueletoTabla columnas={COLUMNAS_ESQUELETO} filas={FILAS_ESQUELETO} />
    </div>
  );
}
