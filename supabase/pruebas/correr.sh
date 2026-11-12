#!/bin/sh
# Prueba votaciones.sql en un PostgreSQL local, en una base nueva "vota_prueba" (nunca en Supabase).
# Uso: PGHOST=... PGPORT=... PGUSER=postgres sh supabase/pruebas/correr.sh   (desde la carpeta del proyecto)
set -e
cd "$(dirname "$0")/../.."
psql -q -v ON_ERROR_STOP=1 -c "drop database if exists vota_prueba" -c "create database vota_prueba" >/dev/null
P="psql -q -v ON_ERROR_STOP=1 -d vota_prueba"
$P -f supabase/pruebas/supabase-simulado.sql >/dev/null
$P -f supabase/votaciones.sql >/dev/null 2>&1
$P -o /dev/null -f supabase/pruebas/pruebas.sql 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //'
