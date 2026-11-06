-- Organización principal y alta automática de miembros.
-- Necesario para que current_organization_id() funcione con Supabase Auth.

insert into public.organizations (id, name)
values ('00000000-0000-4000-8000-000000000001', 'Organización principal')
on conflict (id) do nothing;

-- Inscribe a cada usuario nuevo de auth.users en la organización principal.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  insert into public.organization_members (organization_id, user_id, role)
  values ('00000000-0000-4000-8000-000000000001', new.id, 'admin')
  on conflict (organization_id, user_id) do nothing;
  return new;
end;
$function$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Inscribe a los usuarios ya existentes (si los hubiera).
insert into public.organization_members (organization_id, user_id, role)
select '00000000-0000-4000-8000-000000000001', u.id, 'admin'
from auth.users u
on conflict (organization_id, user_id) do nothing;
