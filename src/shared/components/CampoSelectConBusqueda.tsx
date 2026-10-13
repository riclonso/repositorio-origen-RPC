"use client";

import { useState, useRef, useEffect } from "react";
import type { SelectHTMLAttributes } from "react";
import { MagnifyingGlass, X } from "@phosphor-icons/react";

export type OpcionSelectBusqueda = { valor: string; etiqueta: string };

type CampoSelectConBusquedaProps = {
  id: string;
  etiqueta: string;
  opciones: OpcionSelectBusqueda[];
  ayuda?: string;
  error?: string | null;
  placeholder?: string;
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, "id">;

export function CampoSelectConBusqueda({
  id,
  etiqueta,
  opciones,
  ayuda,
  error,
  placeholder = "Busca un establecimiento...",
  value,
  onChange,
  ...atributos
}: CampoSelectConBusquedaProps) {
  const [filtro, setFiltro] = useState("");
  const [abierto, setAbierto] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const idAyuda = `${id}-ayuda`;
  const idError = `${id}-error`;
  const descripciones = [ayuda ? idAyuda : null, error ? idError : null].filter(Boolean).join(" ");

  // Filtrar opciones por término de búsqueda (case-insensitive, diacritics-insensitive)
  const opcionesFiltradas = opciones.filter((opcion) =>
    opcion.etiqueta.toLowerCase().includes(filtro.toLowerCase()),
  );

  // Obtener etiqueta de la opción seleccionada
  const seleccionada = opciones.find((opcion) => opcion.valor === value);

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    function manejarClickAfuera(evento: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(evento.target as Node)) {
        setAbierto(false);
      }
    }

    if (abierto) {
      document.addEventListener("mousedown", manejarClickAfuera);
      return () => document.removeEventListener("mousedown", manejarClickAfuera);
    }
  }, [abierto]);

  // Enfocar input al abrir
  useEffect(() => {
    if (abierto) {
      inputRef.current?.focus();
    }
  }, [abierto]);

  const manejarSeleccion = (valor: string) => {
    const evento = {
      target: { value: valor },
    } as React.ChangeEvent<HTMLSelectElement>;
    onChange?.(evento);
    setFiltro("");
    setAbierto(false);
  };

  const manejarLimpiar = () => {
    const evento = {
      target: { value: "" },
    } as React.ChangeEvent<HTMLSelectElement>;
    onChange?.(evento);
    setFiltro("");
    setAbierto(false);
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium text-gob-black">
        {etiqueta}
      </label>

      <div ref={containerRef} className="relative">
        {/* Campo de búsqueda / visualización */}
        <div
          className={`relative flex items-center rounded-md border bg-white px-3 py-2 outline-none focus-within:ring-2 ${
            error
              ? "border-gob-danger focus-within:border-gob-danger focus-within:ring-gob-danger/30"
              : "border-gob-accent focus-within:border-gob-primary focus-within:ring-gob-primary/30"
          }`}
        >
          <MagnifyingGlass
            size={18}
            className="mr-2 text-gob-gray-a/50 flex-shrink-0"
            aria-hidden
          />

          <input
            ref={inputRef}
            type="text"
            id={id}
            placeholder={abierto ? placeholder : "Selecciona un establecimiento"}
            value={abierto ? filtro : seleccionada?.etiqueta ?? ""}
            onChange={(e) => {
              setFiltro(e.target.value);
              if (!abierto) setAbierto(true);
            }}
            onFocus={() => setAbierto(true)}
            className="flex-1 bg-transparent text-gob-black outline-none placeholder:text-gob-gray-a/50"
            aria-invalid={error ? true : undefined}
            aria-describedby={descripciones || undefined}
            autoComplete="off"
          />

          {/* Botón limpiar */}
          {value && !abierto ? (
            <button
              type="button"
              onClick={manejarLimpiar}
              className="ml-2 p-1 text-gob-gray-a/50 hover:text-gob-gray-a transition-colors flex-shrink-0"
              aria-label="Limpiar selección"
            >
              <X size={16} />
            </button>
          ) : null}
        </div>

        {/* Dropdown de opciones */}
        {abierto && (
          <div
            id={`${id}-listbox`}
            role="listbox"
            className="absolute top-full left-0 right-0 z-10 mt-1 max-h-64 overflow-y-auto rounded-md border border-gob-accent bg-white shadow-lg"
          >
            {opcionesFiltradas.length > 0 ? (
              opcionesFiltradas.map((opcion) => (
                <button
                  key={opcion.valor}
                  type="button"
                  role="option"
                  aria-selected={value === opcion.valor}
                  onClick={() => manejarSeleccion(opcion.valor)}
                  className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                    value === opcion.valor
                      ? "bg-gob-primary text-white font-medium"
                      : "text-gob-gray-a hover:bg-gob-neutral"
                  }`}
                >
                  {opcion.etiqueta}
                </button>
              ))
            ) : (
              <div className="px-3 py-4 text-center text-sm text-gob-gray-a">
                No hay resultados para &quot;{filtro}&quot;
              </div>
            )}
          </div>
        )}

        {/* Select oculto para manejar el valor del formulario */}
        <select
          {...atributos}
          value={value ?? ""}
          onChange={onChange}
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
        >
          {opciones.map((opcion) => (
            <option key={opcion.valor} value={opcion.valor}>
              {opcion.etiqueta}
            </option>
          ))}
        </select>
      </div>

      {ayuda ? (
        <p id={idAyuda} className="text-xs text-gob-gray-a">
          {ayuda}
        </p>
      ) : null}

      {error ? (
        <p id={idError} role="alert" className="text-sm font-medium text-gob-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
