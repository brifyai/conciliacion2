-- RLS y permisos para los roles estándar de Supabase.

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.transacciones enable row level security;
alter table public.reglas enable row level security;
alter table public.codigos enable row level security;
alter table public.bancos enable row level security;
alter table public.importaciones enable row level security;
alter table public.importacion_pendientes enable row level security;
alter table public.importacion_chunks enable row level security;
alter table public.sync_operaciones enable row level security;
alter table public.sync_chunks enable row level security;

create policy organizations_member_select
on public.organizations
for select
to authenticated
using (public.is_organization_member(id));

create policy organization_members_self_select
on public.organization_members
for select
to authenticated
using (user_id = auth.uid());

create policy transacciones_member_select
on public.transacciones
for select
to authenticated
using (public.is_organization_member(organization_id));

create policy importaciones_member_select
on public.importaciones
for select
to authenticated
using (public.is_organization_member(organization_id));

create policy reglas_member_access
on public.reglas
for all
to authenticated
using (public.is_organization_member(organization_id))
with check (public.is_organization_member(organization_id));

create policy codigos_member_access
on public.codigos
for all
to authenticated
using (public.is_organization_member(organization_id))
with check (public.is_organization_member(organization_id));

create policy bancos_member_access
on public.bancos
for all
to authenticated
using (public.is_organization_member(organization_id))
with check (public.is_organization_member(organization_id));

create policy importacion_pendientes_member_select
on public.importacion_pendientes
for select
to authenticated
using (public.is_organization_member(organization_id));

create policy importacion_chunks_member_select
on public.importacion_chunks
for select
to authenticated
using (public.is_organization_member(organization_id));

create policy sync_operaciones_member_select
on public.sync_operaciones
for select
to authenticated
using (public.is_organization_member(organization_id));

create policy sync_chunks_member_select
on public.sync_chunks
for select
to authenticated
using (public.is_organization_member(organization_id));

revoke all on table
  public.organizations,
  public.organization_members,
  public.transacciones,
  public.reglas,
  public.codigos,
  public.bancos,
  public.importaciones,
  public.importacion_pendientes,
  public.importacion_chunks,
  public.sync_operaciones,
  public.sync_chunks
from public, anon, authenticated;

grant select on table
  public.organizations,
  public.organization_members,
  public.transacciones,
  public.importaciones,
  public.importacion_pendientes,
  public.importacion_chunks,
  public.sync_operaciones,
  public.sync_chunks
to authenticated;

grant select, insert, update, delete on table
  public.reglas,
  public.codigos
to authenticated;

grant select, insert, delete on table public.bancos to authenticated;

grant all on table
  public.organizations,
  public.organization_members,
  public.transacciones,
  public.reglas,
  public.codigos,
  public.bancos,
  public.importaciones,
  public.importacion_pendientes,
  public.importacion_chunks,
  public.sync_operaciones,
  public.sync_chunks
to service_role;

revoke all on function public.current_organization_id()
from public, anon;
revoke all on function public.is_organization_member(uuid)
from public, anon;
revoke all on function public.set_row_organization()
from public, anon, authenticated;
revoke all on function public.transaction_canonical(
  text, text, date, numeric, text, text, text, text, text, text
) from public, anon, authenticated;
revoke all on function public.transaction_hash(text)
from public, anon, authenticated;
revoke all on function public.validate_transaction_fingerprint()
from public, anon, authenticated;
revoke all on function public.clear_codigo_from_transactions()
from public, anon, authenticated;
revoke all on function public.import_transacciones(text, text, text, jsonb)
from public, anon;
revoke all on function public.clear_transacciones()
from public, anon;
revoke all on function public.sync_transacciones(jsonb)
from public, anon;
revoke all on function public.begin_importacion(text, text, text, integer)
from public, anon;
revoke all on function public.upload_importacion_chunk(text, integer, jsonb)
from public, anon;
revoke all on function public.finalize_importacion(text)
from public, anon;
revoke all on function public.begin_sync_transacciones(text, integer)
from public, anon;
revoke all on function public.upload_sync_transacciones_chunk(text, integer, jsonb)
from public, anon;
revoke all on function public.finalize_sync_transacciones(text)
from public, anon;

grant execute on function public.current_organization_id()
to authenticated;
grant execute on function public.is_organization_member(uuid)
to authenticated;
grant execute on function public.import_transacciones(text, text, text, jsonb)
to authenticated;
grant execute on function public.clear_transacciones()
to authenticated;
grant execute on function public.sync_transacciones(jsonb)
to authenticated;
grant execute on function public.begin_importacion(text, text, text, integer)
to authenticated;
grant execute on function public.upload_importacion_chunk(text, integer, jsonb)
to authenticated;
grant execute on function public.finalize_importacion(text)
to authenticated;
grant execute on function public.begin_sync_transacciones(text, integer)
to authenticated;
grant execute on function public.upload_sync_transacciones_chunk(text, integer, jsonb)
to authenticated;
grant execute on function public.finalize_sync_transacciones(text)
to authenticated;

grant execute on all functions in schema public to service_role;

notify pgrst, 'reload schema';
