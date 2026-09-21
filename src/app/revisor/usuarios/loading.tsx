import { EsqueletoTablaUsuarios } from "@/shared/components/EsqueletoTablaUsuarios";

export default function CargandoUsuariosRevisor() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-gob-black">Usuarios</h1>
      <p className="mt-2 text-sm text-gob-gray-a">Cargando el padrón de usuarios.</p>
      <EsqueletoTablaUsuarios />
    </div>
  );
}
