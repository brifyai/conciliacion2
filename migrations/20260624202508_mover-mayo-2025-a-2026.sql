-- Mueve toda la data de mayo 2025 a mayo 2026 (suma 1 año).
UPDATE transacciones
SET fecha = fecha + INTERVAL '1 year'
WHERE fecha >= DATE '2025-05-01'
  AND fecha <  DATE '2025-06-01';