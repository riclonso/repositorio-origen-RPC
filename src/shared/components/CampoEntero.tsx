"use client";

import { useState } from "react";
import { CampoTexto } from "@/shared/components/CampoTexto";
import { interpretarTextoNumerico } from "@/shared/utils/edicionReglasValidacion";

type CampoEnteroProps = {
  id: string;
  etiqueta: string;
  // Valor vigente en la configuración (fuente de verdad fuera del campo).
  valor: number;
  onCambiarValor: (valor: number) => void;
  // Con negativos se usa el teclado de texto completo: los teclados numéricos móviles (iOS) no
  // traen el signo menos.
  permitirNegativos?: boolean;
  ayuda?: string;
  error?: string | null;
};

// Campo entero que conserva el texto tecleado como estado local. Un `type="number"` controlado
// entrega "" mientras se escribe "-" y el valor numérico lo repinta como "0", impidiendo escribir
// un negativo. Aquí el texto se conserva tal cual y cada cambio se publica con
// `interpretarTextoNumerico`: un estado intermedio como "-" se publica como NaN, de modo que el error
// inline del padre queda visible y nunca se guarda en silencio un valor distinto del que se ve.
// NaN no dispara la resincronización: `Object.is(NaN, NaN)` es `true`.
export function CampoEntero({ id, etiqueta, valor, onCambiarValor, permitirNegativos = false, ayuda, error }: CampoEnteroProps) {
  const [estado, setEstado] = useState({ texto: String(valor), valorSincronizado: valor });

  // El valor cambió desde fuera (recarga, cambio de tipo, etc.): se ajusta el texto durante el render,
  // sin efecto, siguiendo el patrón de "estado derivado de una prop anterior".
  if (!Object.is(valor, estado.valorSincronizado)) {
    setEstado({ texto: String(valor), valorSincronizado: valor });
  }

  return (
    <CampoTexto
      id={id}
      etiqueta={etiqueta}
      type="text"
      inputMode={permitirNegativos ? "text" : "numeric"}
      autoComplete="off"
      value={estado.texto}
      onChange={(evento) => {
        const texto = evento.target.value;
        const interpretado = interpretarTextoNumerico(texto);
        setEstado({ texto, valorSincronizado: interpretado });
        onCambiarValor(interpretado);
      }}
      ayuda={ayuda}
      error={error}
    />
  );
}
