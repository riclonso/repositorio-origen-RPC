"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { IconoConfiguracion } from "@/shared/components/iconos";

type MenuConfiguracionUsuarioProps = {
  // Base de ruta del área actual ("/dashboard" | "/notificador" | "/revisor"), mismo patrón
  // `rutaBase` ya usado por `TablaUsuarios`/`TablaFormatosExcel`: cada layout aporta la suya.
  rutaBase: string;
};

// Patrón WAI-ARIA "menu button" (https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/), nuevo en
// el proyecto: un botón que abre un panel `role="menu"` con `role="menuitem"`, en vez de
// `<details>/<summary>` (que no expone la semántica de menú a un lector de pantalla ni deja
// posicionar el foco en el primer ítem al abrir).
export function MenuConfiguracionUsuario({ rutaBase }: MenuConfiguracionUsuarioProps) {
  const [abierto, setAbierto] = useState(false);
  const referenciaContenedor = useRef<HTMLDivElement>(null);
  const referenciaBoton = useRef<HTMLButtonElement>(null);
  const referenciaPrimerItem = useRef<HTMLAnchorElement>(null);
  const idMenu = useId();

  function cerrarYDevolverFoco() {
    setAbierto(false);
    referenciaBoton.current?.focus();
  }

  // Cierre al hacer clic fuera del menú (captura en `document`, no en el contenedor: un clic
  // fuera nunca burbujea hasta un listener puesto DENTRO del propio menú).
  useEffect(() => {
    if (!abierto) return;

    function alHacerClicFuera(evento: MouseEvent) {
      if (!referenciaContenedor.current?.contains(evento.target as Node)) {
        setAbierto(false);
      }
    }

    document.addEventListener("mousedown", alHacerClicFuera);
    return () => document.removeEventListener("mousedown", alHacerClicFuera);
  }, [abierto]);

  // Cierre con Escape, con devolución de foco al disparador (mismo criterio de accesibilidad que
  // `DialogoConfirmacion`, que usa el cierre nativo de `<dialog>` para lo mismo).
  useEffect(() => {
    if (!abierto) return;

    function alPresionarTecla(evento: KeyboardEvent) {
      if (evento.key === "Escape") {
        cerrarYDevolverFoco();
      }
    }

    document.addEventListener("keydown", alPresionarTecla);
    return () => document.removeEventListener("keydown", alPresionarTecla);
  }, [abierto]);

  // Foco en el primer ítem al abrir, como espera el patrón "menu button".
  useEffect(() => {
    if (abierto) {
      referenciaPrimerItem.current?.focus();
    }
  }, [abierto]);

  return (
    <div ref={referenciaContenedor} className="relative">
      <button
        ref={referenciaBoton}
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls={idMenu}
        onClick={() => setAbierto((estabaAbierto) => !estabaAbierto)}
        className="inline-flex size-9 items-center justify-center rounded-full border border-gob-accent bg-white text-gob-primary transition-colors hover:border-gob-primary hover:bg-gob-neutral focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
      >
        <IconoConfiguracion />
        <span className="sr-only">Configuración de la cuenta</span>
      </button>

      {abierto ? (
        <div
          id={idMenu}
          role="menu"
          aria-label="Configuración de la cuenta"
          className="absolute right-0 z-10 mt-2 w-56 rounded-md border border-gob-accent bg-white py-1 shadow-lg"
        >
          <Link
            ref={referenciaPrimerItem}
            href={`${rutaBase}/perfil`}
            role="menuitem"
            onClick={cerrarYDevolverFoco}
            className="block px-4 py-2 text-sm text-gob-black hover:bg-gob-neutral focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gob-primary"
          >
            Mi perfil
          </Link>
          <Link
            href={`${rutaBase}/perfil/contrasena`}
            role="menuitem"
            onClick={cerrarYDevolverFoco}
            className="block px-4 py-2 text-sm text-gob-black hover:bg-gob-neutral focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gob-primary"
          >
            Cambiar contraseña
          </Link>
        </div>
      ) : null}
    </div>
  );
}
