#!/bin/bash
# ============================================================================
# Ejemplos de uso de scripts de limpieza
# ============================================================================

set -e  # Salir si hay error

DB_HOST=${PGHOST:-localhost}
DB_USER=${PGUSER:-usuario}
DB_NAME=${PGDATABASE:-repositorio-rem}

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Ejemplos de Limpieza de Base de Datos ===${NC}\n"

# ============================================================================
# EJEMPLO 1: Ver reporte SQL sin cambiar nada
# ============================================================================
echo -e "${YELLOW}[1] REPORTE: Ver todos los usuarios y sus cargas${NC}"
echo "Comando:"
echo "psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c \"SELECT * FROM reportar_usuarios();\""
echo ""
echo -e "${YELLOW}(Este es un READ-ONLY, seguro)${NC}\n"

# ============================================================================
# EJEMPLO 2: Auditar un usuario específico
# ============================================================================
echo -e "${YELLOW}[2] AUDITAR: Datos de un usuario antes de eliminar${NC}"
USUARIO_ID="550e8400-e29b-41d4-a716-446655440000"
echo "Comando:"
echo "psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c \"SELECT * FROM reportar_usuario('$USUARIO_ID');\""
echo ""
echo -e "${YELLOW}(Reemplaza USUARIO_ID con el UUID real)${NC}\n"

# ============================================================================
# EJEMPLO 3: Contar registros antes de eliminar
# ============================================================================
echo -e "${YELLOW}[3] CONTAR: Qué se va a eliminar${NC}"
echo "Comando:"
echo "psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c \"SELECT * FROM contar_a_eliminar('$USUARIO_ID');\""
echo ""
echo -e "${YELLOW}(Muestra cuántos registros se borran de cada tabla)${NC}\n"

# ============================================================================
# EJEMPLO 4: Hacer respaldo antes de eliminar
# ============================================================================
echo -e "${YELLOW}[4] RESPALDO: Guardar copia de seguridad antes${NC}"
echo "Comando:"
echo "pg_dump -h $DB_HOST -U $DB_USER -d $DB_NAME > respaldo-$(date +%Y%m%d_%H%M%S).sql"
echo ""
echo -e "${YELLOW}(Crea un archivo respaldo-YYYYMMDD_HHMMSS.sql en el directorio actual)${NC}\n"

# ============================================================================
# EJEMPLO 5: ELIMINAR un usuario (SQL)
# ============================================================================
echo -e "${RED}[5] ELIMINAR: Borrar un usuario (SQL - IRREVERSIBLE)${NC}"
echo "Comando:"
echo "psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c \"SELECT * FROM limpiar_usuario('$USUARIO_ID');\""
echo ""
echo -e "${RED}⚠️  ESTO BORRA AL USUARIO Y TODO SU HISTORIAL${NC}"
echo -e "${RED}Asegúrate de hacer respaldo primero (paso 4)${NC}\n"

# ============================================================================
# EJEMPLO 6: ELIMINAR por RUT
# ============================================================================
echo -e "${RED}[6] ELIMINAR: Borrar usuario por RUT (SQL)${NC}"
RUT="12345678-9"
echo "Comando:"
echo "psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c \"SELECT * FROM limpiar_por_rut('$RUT');\""
echo ""
echo -e "${RED}⚠️  REEMPLAZA EL RUT CON UNO REAL${NC}\n"

# ============================================================================
# EJEMPLO 7: Usar script TypeScript interactivo
# ============================================================================
echo -e "${YELLOW}[7] ELIMINAR: Usando TypeScript (interactivo)${NC}"
echo "Comando:"
echo "npx tsx scripts/limpiar-usuarios.ts"
echo ""
echo "Flujo:"
echo "  1. Pide IDs de usuarios (separados por comas)"
echo "  2. Muestra reporte de usuarios encontrados"
echo "  3. Pide confirmación (escribir: SÍ)"
echo "  4. Elimina en transacción atómica"
echo ""
echo -e "${YELLOW}(Más seguro: requiere confirmación interactiva)${NC}\n"

# ============================================================================
# EJEMPLO 8: Script avanzado TypeScript
# ============================================================================
echo -e "${YELLOW}[8] ELIMINAR: Usando script avanzado TypeScript${NC}"
echo "Comandos:"
echo "  # Ver reporte sin eliminar"
echo "  npx tsx scripts/limpiar-bd.ts --usuarios id1,id2,id3 --reportar"
echo ""
echo "  # Eliminar"
echo "  npx tsx scripts/limpiar-bd.ts --usuarios id1,id2,id3"
echo ""
echo "  # Por RUT"
echo "  npx tsx scripts/limpiar-bd.ts --rut 12345678-9"
echo ""
echo -e "${YELLOW}(Requiere confirmación manual con ELIMINAR)${NC}\n"

# ============================================================================
# EJEMPLO 9: Restaurar desde respaldo
# ============================================================================
echo -e "${YELLOW}[9] RESTAURAR: Si algo salió mal${NC}"
echo "Comando:"
echo "psql -h $DB_HOST -U $DB_USER -d $DB_NAME < respaldo-20261013_120000.sql"
echo ""
echo -e "${YELLOW}(Restaura desde el archivo de respaldo creado en paso 4)${NC}\n"

# ============================================================================
# EJEMPLO 10: Ver qué usuarios existen en la BD
# ============================================================================
echo -e "${YELLOW}[10] LISTAR: Todos los usuarios sin interactividad${NC}"
echo "Comando:"
echo "psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c \"SELECT id, rut, nombres, apellidos, perfilCodigo FROM usuario ORDER BY createdAt DESC;\""
echo ""
echo -e "${YELLOW}(Útil para encontrar el ID o RUT a eliminar)${NC}\n"

# ============================================================================
# RESUMEN DE SEGURIDAD
# ============================================================================
echo -e "${GREEN}=== PROCEDIMIENTO SEGURO ===${NC}"
echo "1. Haz un respaldo (ejemplo 4)"
echo "2. Consulta el reporte del usuario (ejemplo 2)"
echo "3. Cuenta qué se va a eliminar (ejemplo 3)"
echo "4. Elimina (ejemplo 5 o 7)"
echo "5. Verifica que se haya eliminado"
echo ""
echo -e "${YELLOW}Si algo sale mal: restaura desde el respaldo (ejemplo 9)${NC}\n"

echo -e "${GREEN}=== NOTAS ===${NC}"
echo "- Reemplaza DATABASE_URL en .env si usas TypeScript"
echo "- Reemplaza credenciales psql para SQL directo"
echo "- Todos los UUID/RUT en los ejemplos son ficticios"
echo "- Usa UUIDs reales de tu BD"
echo "- Los scripts SQL se crean en scripts/ del proyecto"
echo ""
