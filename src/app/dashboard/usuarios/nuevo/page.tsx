import type { Metadata } from "next";
import { UsuarioForm } from "../usuario-form";

export const metadata: Metadata = {
  title: "Nuevo usuario - Intranet SEREMI de Salud Biobío",
};

export default function NuevoUsuarioPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold text-gob-black">Nuevo usuario</h1>
      <p className="mt-2 text-sm text-gob-gray-a">
        El RUT queda como nombre de usuario de ingreso y no se puede modificar después.
      </p>

      <UsuarioForm
        modo="crear"
        endpoint="/api/usuarios"
        metodo="POST"
        valoresIniciales={{ nombres: "", apellidos: "", rut: "", email: "", rol: "USUARIO" }}
      />
    </div>
  );
}
