# Feature: Diseño + Implementación + Revisión + Documentación

Orquesta a los tres agentes del proyecto (`architecto`, `desarrollador`, `revisor`, definidos en
`.claude/agents/`) para implementar un requerimiento nuevo, y deja `docs/` actualizado al final.

Sigue este flujo en orden. No saltes fases. Cada fase depende del resultado de la anterior, así que
invoca cada agente y espera su resultado antes de continuar (no lances los tres en paralelo).

Requerimiento: $ARGUMENTS

---

## Fase 1 — Arquitectura

Invoca el agente `architecto` (Task tool, `subagent_type: "architecto"`) pasándole en el prompt:

* El requerimiento completo (`$ARGUMENTS`).
* Instrucción de leer `CLAUDE.md`, `docs/arquitectura.md` y `docs/requerimientos.md` antes de
  diseñar (el agente ya tiene esto en sus instrucciones, pero repite el requerimiento igual).

El agente devuelve el diseño técnico completo (resumen funcional, componentes afectados, modelo de
datos, endpoints, validaciones, seguridad, plan de implementación) y una sección de preguntas
abiertas.

Muestra el diseño completo al usuario. Si hay preguntas abiertas, pregúntaselas ahora.

**Detente aquí y pregunta al usuario si aprueba el diseño o quiere ajustes.** No continúes a la Fase
2 sin aprobación explícita.

## Fase 2 — Implementación

Solo después de que el usuario apruebe el diseño de la Fase 1.

Invoca el agente `desarrollador` (Task tool, `subagent_type: "desarrollador"`) pasándole en el
prompt:

* El diseño técnico completo aprobado en la Fase 1 (texto completo, no un resumen).
* El requerimiento original.
* Instrucción de seguir `CLAUDE.md` y correr react-doctor (scoped) antes y después de sus cambios si
  el diseño afecta componentes React (ya está en sus instrucciones, pero recuérdaselo si el diseño
  toca `app/` o componentes).

El agente devuelve: archivos modificados/creados, explicación de los cambios, resultado de
react-doctor si aplica, y riesgos encontrados.

## Fase 3 — Revisión de código

Ejecuta esta fase inmediatamente después de la Fase 2, sin esperar confirmación del usuario.

Invoca el agente `revisor` (Task tool, `subagent_type: "revisor"`) pasándole en el prompt:

* El diseño aprobado en la Fase 1.
* Los archivos modificados/creados y la explicación de cambios de la Fase 2.
* Instrucción de correr `npx tsc --noEmit`, `npm run lint` y `npm run build` (obligatorio, ya está
  en sus instrucciones) — un fallo ahí es crítico por sí solo.

Muestra al usuario el resultado completo: problemas críticos, problemas importantes, mejoras
recomendadas, código sugerido, puntuación por categoría y veredicto (APROBADO / APROBADO CON
OBSERVACIONES / RECHAZADO).

Si el veredicto es **RECHAZADO** o hay problemas críticos: indica exactamente qué debe corregirse,
**no avances a la Fase 4**, y espera a que el desarrollador (nueva invocación de la Fase 2 con las
correcciones pedidas) resuelva los problemas y el revisor vuelva a aprobar.

## Fase 4 — Actualización de documentación

Ejecuta esta fase solo si el veredicto de la Fase 3 fue APROBADO o APROBADO CON OBSERVACIONES.

Esta fase la ejecutas tú directamente (no es un subagente) porque necesitas el contexto completo de
las tres fases anteriores. Actualiza, según corresponda:

* **`docs/requerimientos.md`** — agrega el requerimiento nuevo a la tabla de "Implementados" (o
  actualiza su estado si ya existía como pendiente), con un ID correlativo (siguiente `RF-XX`
  disponible) y una nota breve. Actualiza la fecha de "Última actualización".
* **`docs/arquitectura.md`** — si el requerimiento introdujo un módulo, capa, patrón o decisión de
  diseño nueva que no estaba documentada, agrégala en la sección correspondiente. Si no hubo cambios
  arquitectónicos, no toques este archivo.
* **`docs/resumen-tecnico.md`** — si el requerimiento agregó una dependencia, un comando de
  `package.json`, una variable de entorno o cambió el estado de un módulo (p. ej. de "stub" a
  "implementado"), actualízalo. Si no hubo cambios técnicos relevantes, no toques este archivo.

No inventes contenido: actualiza solo lo que efectivamente cambió en esta implementación. Termina
confirmando al usuario qué archivos de `docs/` se actualizaron (o que ninguno lo necesitaba).
