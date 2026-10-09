import type { EnlacePanel } from "@/shared/components/NavegacionPanel";

export const ENLACES_REVISOR: readonly EnlacePanel[] = [
  { href: "/revisor", etiqueta: "Inicio" },
  { href: "/revisor/usuarios", etiqueta: "Usuarios" },
  { href: "/revisor/formatos-excel", etiqueta: "Formatos de archivo" },
  { href: "/revisor/ventanas-carga", etiqueta: "Ventanas de carga" },
  { href: "/revisor/solicitudes", etiqueta: "Solicitudes" },
  // RF-37: archivos de Bioestadística por año y su bandeja de solicitudes de reemplazo.
  {
    etiqueta: "Bioestadística",
    subenlaces: [
      { href: "/revisor/bioestadistica", etiqueta: "Archivos" },
      { href: "/revisor/bioestadistica/solicitudes", etiqueta: "Solicitudes" },
    ],
  },
  // Mismos mantenedores que el ADMIN (pantallas compartidas en `shared/components/Pantallas*`).
  {
    etiqueta: "Administración",
    subenlaces: [
      { href: "/revisor/establecimientos", etiqueta: "Establecimientos" },
      { href: "/revisor/tipos-establecimiento", etiqueta: "Tipos de establecimiento" },
    ],
  },
];
