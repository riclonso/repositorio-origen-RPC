import { EsqueletoTablaEstablecimientos } from "./esqueleto-tabla-establecimientos";

export default function CargandoEstablecimientos() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-gob-black">Establecimientos</h1>
      <p className="mt-2 text-sm text-gob-gray-a">Cargando el listado de establecimientos.</p>
      <EsqueletoTablaEstablecimientos />
    </div>
  );
}
