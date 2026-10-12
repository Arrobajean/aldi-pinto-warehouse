-- F0: esquema `aldi_pinto` para el gemelo digital.
-- Si el proyecto de Supabase se comparte con RAG Atlas, TODO va en este esquema.

create schema if not exists aldi_pinto;

-- Exponer el esquema a la API de PostgREST y a los roles de Supabase.
alter default privileges in schema aldi_pinto
  grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema aldi_pinto
  grant all on sequences to postgres, anon, authenticated, service_role;
alter default privileges in schema aldi_pinto
  grant all on functions to postgres, anon, authenticated, service_role;

grant usage on schema aldi_pinto to anon, authenticated, service_role;

-- Sentido de las coordenadas del plano (documentación):
-- 1 unidad = 1 metro, origen en el centro de la nave.
-- +X = este, -X = oeste, +Z = sur (fachada de muelles), -Z = norte.