-- ============================================================================
-- Auditoría de conciliación — pegar completo en Supabase → SQL Editor.
--
-- El SQL Editor corre como `postgres`, así que NO necesita claves ni RLS.
-- Cambia el período en el bloque `p` (primera CTE) y ejecuta cada consulta.
-- ============================================================================

-- --- 1. Totales por fuente y estado del período ------------------------------
with p as (select date '2026-01-01' as desde, date '2026-02-01' as hasta)
select t.fuente, t.estado, count(*) as movs, sum(abs(t.monto)) as monto
from public.transacciones t, p
where t.fecha >= p.desde and t.fecha < p.hasta
group by 1, 2
order by 1, 3 desc;

-- --- 2. KPIs (universo = banco con monto <> 0) -------------------------------
with p as (select date '2026-01-01' as desde, date '2026-02-01' as hasta),
b as (
  select t.*
  from public.transacciones t, p
  where t.fuente = 'banco' and t.monto <> 0
    and t.fecha >= p.desde and t.fecha < p.hasta
)
select count(*)                                                        as universo,
       count(*) filter (where estado = 'conciliada')                    as conciliadas,
       count(*) filter (where estado = 'resuelta')                      as resueltas,
       count(*) filter (where estado not in ('conciliada','resuelta'))  as no_conciliadas,
       round(100.0 * count(*) filter (where estado = 'conciliada')
             / nullif(count(*), 0), 1)                                  as tasa_conciliacion,
       round(100.0 * count(*) filter (where estado in ('conciliada','resuelta'))
             / nullif(count(*), 0), 1)                                  as avance_explicado
from b;

-- --- 3. ¿De qué están "resueltas"? código x origen de detección --------------
with p as (select date '2026-01-01' as desde, date '2026-02-01' as hasta)
select t.codigo_id,
       c.nombre,
       t.codigo_origen,
       count(*)                                   as movs,
       round(avg(t.codigo_confianza)::numeric, 2) as conf_media,
       sum(abs(t.monto))                          as monto
from public.transacciones t
join p on t.fecha >= p.desde and t.fecha < p.hasta
left join public.codigos c
       on c.organization_id = t.organization_id and c.id = t.codigo_id
where t.fuente = 'banco' and t.estado = 'resuelta'
group by 1, 2, 3
order by movs desc;

-- --- 4. Resoluciones de menor confianza (posibles falsos positivos) ----------
with p as (select date '2026-01-01' as desde, date '2026-02-01' as hasta)
select t.fecha, t.monto, t.descripcion, t.rut,
       t.codigo_id, t.codigo_origen, t.codigo_confianza, t.codigo_evidencia
from public.transacciones t, p
where t.fuente = 'banco' and t.estado = 'resuelta'
  and t.fecha >= p.desde and t.fecha < p.hasta
order by t.codigo_confianza asc nulls first
limit 60;

-- --- 5. Conciliadas: contra qué calzaron ------------------------------------
with p as (select date '2026-01-01' as desde, date '2026-02-01' as hasta)
select b.fecha as fecha_banco, b.monto, b.descripcion as glosa_banco,
       b.codigo_id, c.fecha as fecha_contab, c.descripcion as glosa_contab,
       c.proveedor, c.rut, b.confianza
from public.transacciones b
join p on b.fecha >= p.desde and b.fecha < p.hasta
left join public.transacciones c on c.id = b.match_id
where b.fuente = 'banco' and b.estado = 'conciliada'
order by b.fecha;

-- --- 6. Contrafactual: brecha real si NO se auto-resolviera ------------------
-- Cuántos movimientos de banco quedarían como brecha si se ignorara el estado
-- 'resuelta' automático (se excluyen los resueltos manuales, que sí son
-- decisiones del usuario).
with p as (select date '2026-01-01' as desde, date '2026-02-01' as hasta)
select count(*) as resueltas_automaticas,
       sum(abs(t.monto)) as monto_que_desaparece
from public.transacciones t, p
where t.fuente = 'banco' and t.estado = 'resuelta'
  and t.fecha >= p.desde and t.fecha < p.hasta
  and coalesce(t.codigo_origen, '') <> 'manual';

-- --- 7. Cómo se cargó cada período (orden de importación) -------------------
-- Si el banco se importó antes que la contabilidad, los movimientos quedaron
-- 'resuelta' y el matching ya no los reconsidera (matching.ts los excluye).
with p as (select date '2026-01-01' as desde, date '2026-02-01' as hasta)
select t.fuente, i.nombre_archivo, i.created_at, i.filas, i.insertadas, i.omitidas
from public.transacciones t
join p on t.fecha >= p.desde and t.fecha < p.hasta
left join public.importaciones i
       on i.organization_id = t.organization_id and i.import_id = t.import_id
group by 1, 2, 3, 4, 5, 6
order by i.created_at nulls last;
