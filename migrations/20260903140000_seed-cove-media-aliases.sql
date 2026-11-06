-- Asigna automáticamente el código COVE (Costo de Ventas) a los proveedores de
-- medios/publicidad más frecuentes del libro de compras, usando su RUT como
-- alias. El motor de detección reconoce un alias con forma de RUT y lo calza
-- contra el RUT del documento, de modo que estas compras quedan codificadas
-- solas al importar.
--
-- Se eligió COVE porque en la cartola bancaria es el código más usado para
-- pagos a proveedores y estos son insumos de medios de una agencia (costo de
-- venta). Se EXCLUYEN a propósito: bancos (BCI, Santander), utilities (Enel) y
-- proveedores con código propio (Qumran -> QMR) o de rubro ambiguo.
--
-- Es aditivo: sólo agrega RUT a los alias existentes de COVE, sin duplicar.
UPDATE public.codigos AS c
SET aliases = ARRAY(
  SELECT DISTINCT btrim(valor)
  FROM unnest(
    COALESCE(c.aliases, '{}'::text[]) || ARRAY[
      '84364100-8',  -- Publicidad Exterior Publivia SpA
      '96669520-K',  -- Red de Televisión Chilevisión S.A.
      '96516560-6',  -- Bío Bío Comunicaciones S.A.
      '76394590-1',  -- Servicios Publicitarios Publivisión Ltda.
      '82066500-7',  -- Prisa Media Corp SpA
      '76047103-8',  -- Gestión Regional de Medios S.A.
      '94795000-2',  -- Cía. Chilena de Comunicaciones S.A.
      '90193000-7',  -- Empresa El Mercurio S.A.P.
      '79947310-0',  -- Prisa Media Chile S.A.
      '81689800-5',  -- TVN
      '76115132-0',  -- Canal 13 SpA
      '84383200-8',  -- Global Media SpA
      '76984948-3',  -- Coneccionlineal Publicidad y Marketing SpA
      '96810030-0',  -- RDF Media SpA
      '84295700-1',  -- Empresa Periodística El Norte S.A.
      '77954644-6',  -- Wapa Marketing y Comunicaciones Ltda.
      '78794060-9',  -- Megamedia Radio S.A.
      '76126782-5',  -- Visual Media Ltda.
      '78319760-K',  -- Soc. Radiodifusora F.M. 102 Ltda.
      '77837600-8',  -- Comunicaciones San Andrés Ltda.
      '77176333-2'   -- Marketing, Publicidad e Informática Grupo 4 Ltda.
    ]::text[]
  ) AS valor
  WHERE btrim(valor) <> ''
)
WHERE c.id = 'COVE';

NOTIFY pgrst, 'reload schema';
