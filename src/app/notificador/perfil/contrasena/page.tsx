import type { Metadata } from "next";
import { CambiarContrasenaPropiaForm } from "@/shared/components/CambiarContrasenaPropiaForm";

export const metadata: Metadata = {
  title: "Cambiar contraseña - Repositorio RPC - SEREMI de Salud Biobío",
};

export default function CambiarContrasenaNotificadorPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-gob-black">Cambiar contraseña</h1>
      <p className="mt-2 text-sm text-gob-gray-a">
        Al guardar, se cerrará tu sesión actual y deberás ingresar nuevamente con la contraseña nueva.
      </p>

      <CambiarContrasenaPropiaForm />
    </div>
  );
}
