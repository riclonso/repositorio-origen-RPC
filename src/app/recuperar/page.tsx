import type { Metadata } from "next";
import { MarcoPublico } from "@/shared/components/MarcoPublico";
import { RecuperarForm } from "./recuperar-form";

export const metadata: Metadata = {
  title: "Recuperar contraseña - Repositorio RPC - SEREMI de Salud Biobío",
  // Pantalla de un flujo de credenciales: no tiene por qué aparecer en buscadores, y el
  // `no-referrer` evita que la dirección de esta página viaje a sitios externos.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function RecuperarPage() {
  return (
    <MarcoPublico
      titulo="Recuperar contraseña"
      subtitulo="Te enviaremos un enlace para elegir una contraseña nueva"
    >
      <RecuperarForm />
    </MarcoPublico>
  );
}
