begin;

create table public.workspace_settings (
  id boolean primary key default true check (id),
  name text not null check (length(btrim(name)) between 1 and 80),
  timezone text not null default 'America/Mexico_City',
  version integer not null default 1
);
insert into public.workspace_settings(name) values ('Comunidad Kids');

create table public.areas (
  id text primary key check (id in ('babies','kinder','kids','preteens','checkin')),
  name text not null
);
insert into public.areas values
  ('babies','Babies'), ('kinder','Kinder'), ('kids','Kids'), ('preteens','Preteens'), ('checkin','Check-in');

create table public.volunteers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 80),
  active boolean not null default true,
  area_ids text[] not null check (
    cardinality(area_ids) between 0 and 5 and
    area_ids <@ array['babies','kinder','kids','preteens','checkin']::text[]
  ),
  note text not null default '' check (length(note) <= 300),
  version integer not null default 1,
  check (not active or cardinality(area_ids)>0)
);
create unique index volunteers_name on public.volunteers(lower(btrim(name)));

create table public.access_grants (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(btrim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
  role text not null check (role in ('admin','coordinator','volunteer')),
  area_ids text[] not null default '{}' check (
    area_ids <@ array['babies','kinder','kids','preteens','checkin']::text[]
  ),
  volunteer_id uuid references public.volunteers(id),
  active boolean not null default true,
  version integer not null default 1,
  check ((role = 'coordinator' and cardinality(area_ids) > 0) or (role <> 'coordinator' and cardinality(area_ids) = 0))
);
create unique index one_account_per_volunteer on public.access_grants(volunteer_id)
  where volunteer_id is not null and active;

create table public.members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  grant_id uuid not null unique references public.access_grants(id)
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 60),
  weekday integer not null check (weekday between 0 and 6),
  start_time time not null,
  active boolean not null default true,
  version integer not null default 1
);
create unique index services_active_time on public.services(weekday, start_time) where active;
insert into public.services(name, weekday, start_time) values
  ('Primero',0,'09:00'), ('Segundo',0,'10:40'), ('Tercero',0,'12:25');

create table public.positions (
  id uuid primary key default gen_random_uuid(),
  sort_order bigint generated always as identity,
  area_id text not null references public.areas(id),
  name text not null check (length(btrim(name)) between 1 and 60),
  active boolean not null default true,
  version integer not null default 1,
  unique(id, area_id)
);
create unique index positions_name on public.positions(area_id, lower(btrim(name)));
insert into public.positions(area_id, name)
  select a.id, r.name from public.areas a
  cross join (values ('Maestro/a',1),('Ayuda',2),('Asistente 1',3)) r(name,ordinal)
  where a.id <> 'checkin' order by a.id,r.ordinal;
insert into public.positions(area_id, name) values ('checkin','Check-in 1'),('checkin','Check-in 2');

create table public.occurrences (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id),
  service_date date not null,
  start_time time not null,
  name text not null,
  unique(service_id, service_date),
  unique(service_date, start_time)
);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references public.occurrences(id),
  area_id text not null references public.areas(id),
  position_id uuid not null,
  volunteer_id uuid references public.volunteers(id),
  note text not null default '' check (length(note) <= 300),
  version integer not null default 1,
  foreign key (position_id, area_id) references public.positions(id, area_id),
  unique(occurrence_id, position_id)
);
create unique index one_position_per_person on public.assignments(occurrence_id, volunteer_id)
  where volunteer_id is not null;
create index assignments_volunteer on public.assignments(volunteer_id);

create table public.workspace_version (
  id boolean primary key default true check(id),
  revision bigint not null default 0
);
insert into public.workspace_version default values;

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  actor_label text not null,
  message text not null,
  detail text not null default '',
  before_data jsonb,
  after_data jsonb
);

create function public.is_member() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members m join public.access_grants g on g.id=m.grant_id
    where m.user_id=auth.uid() and g.active);
$$;
create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members m join public.access_grants g on g.id=m.grant_id
    where m.user_id=auth.uid() and g.active and g.role='admin');
$$;
create function public.can_edit_area(p_area text) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members m join public.access_grants g on g.id=m.grant_id
    where m.user_id=auth.uid() and g.active and
      (g.role='admin' or (g.role='coordinator' and p_area=any(g.area_ids))));
$$;
create function public.require_member() returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_member() then raise exception 'Tu cuenta no tiene acceso activo. Pide autorización a administración.' using errcode='42501'; end if;
end;
$$;
create function public.require_admin() returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Esta operación requiere administración.' using errcode='42501'; end if;
end;
$$;
create function public.lock_workspace() returns void language sql security definer set search_path = '' as $$
  select pg_advisory_xact_lock(73521941);
$$;
create function public.record_change(p_message text, p_detail text default '', p_before jsonb default null, p_after jsonb default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_role text;
begin
  select g.role into v_role from public.members m join public.access_grants g on g.id=m.grant_id where m.user_id=auth.uid();
  insert into public.audit_log(actor_id, actor_label, message, detail, before_data, after_data)
    values(auth.uid(), coalesce(v_role,'sistema') || ' · ' || coalesce(left(auth.uid()::text,8),'SQL'), p_message, p_detail, p_before, p_after);
  update public.workspace_version set revision=revision+1 where id;
end;
$$;

create function public.enter_workspace() returns text language plpgsql security definer set search_path = '' as $$
declare v_email text; v_grant uuid; v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Inicia sesión con Google.' using errcode='42501'; end if;
  select lower(i.identity_data->>'email') into v_email
    from auth.identities i where i.user_id=v_user and i.provider='google'
      and i.identity_data->>'email_verified'='true' limit 1;
  if v_email is null then raise exception 'Se requiere una cuenta de Google con correo verificado.' using errcode='42501'; end if;
  select id into v_grant from public.access_grants where email=v_email and active;
  if v_grant is null then raise exception 'Tu correo de Google todavía no está autorizado. Contacta a administración.' using errcode='42501'; end if;
  insert into public.members(user_id,grant_id) values(v_user,v_grant)
    on conflict(user_id) do update set grant_id=excluded.grant_id;
  return v_grant::text;
end;
$$;

create function public.get_revision() returns bigint language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_member();
  return (select revision from public.workspace_version where id);
end;
$$;
create function public.read_workspace() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_grant public.access_grants; v_result jsonb;
begin
  perform public.require_member();
  select g.* into v_grant from public.members m join public.access_grants g on g.id=m.grant_id where m.user_id=auth.uid();
  select jsonb_build_object(
    'revision', (select revision from public.workspace_version where id),
    'actor', jsonb_build_object('id',auth.uid(),'role',v_grant.role,'areas',v_grant.area_ids,'volunteerId',v_grant.volunteer_id),
    'settings', (select jsonb_build_object('name',name,'timezone',timezone,'version',version) from public.workspace_settings where id),
    'volunteers', coalesce((select jsonb_agg(jsonb_build_object(
      'id',v.id,'name',v.name,'active',v.active,'areas',v.area_ids,'note',v.note,'version',v.version) order by v.name) from public.volunteers v),'[]'),
    'services', coalesce((select jsonb_agg(jsonb_build_object(
      'id',s.id,'name',s.name,'day',s.weekday,'time',to_char(s.start_time,'HH24:MI'),'active',s.active,'version',s.version) order by s.weekday,s.start_time) from public.services s),'[]'),
    'positions', coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.id,'areaId',p.area_id,'name',p.name,'active',p.active,'version',p.version) order by p.area_id,p.sort_order) from public.positions p),'[]'),
    'occurrences', coalesce((select jsonb_agg(jsonb_build_object(
      'id',o.id,'serviceId',o.service_id,'date',o.service_date,'time',to_char(o.start_time,'HH24:MI'),'name',o.name) order by o.service_date,o.start_time) from public.occurrences o),'[]'),
    'assignments', coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'occurrenceId',a.occurrence_id,'areaId',a.area_id,'positionId',a.position_id,
      'volunteerId',a.volunteer_id,'note',a.note,'version',a.version) order by a.occurrence_id,a.area_id,p.sort_order)
      from public.assignments a join public.positions p on p.id=a.position_id),'[]'),
    'activity', coalesce((select jsonb_agg(jsonb_build_object(
      'id',l.id::text,'at',l.at,'actor',l.actor_label,'text',l.message,'detail',l.detail) order by l.id desc)
      from (select * from public.audit_log order by id desc limit 100) l),'[]'),
    'grants', case when v_grant.role='admin' then coalesce((select jsonb_agg(jsonb_build_object(
      'id',g.id,'email',g.email,'role',g.role,'areas',g.area_ids,'volunteerId',g.volunteer_id,'active',g.active,'version',g.version) order by g.email) from public.access_grants g),'[]') else '[]'::jsonb end
  ) into v_result;
  return v_result;
end;
$$;

create function public.write_assignment(p_id uuid,p_volunteer_id uuid,p_note text,p_version integer)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old public.assignments; v_date date; v_position text; v_area text;
begin
  perform public.lock_workspace();
  select * into v_old from public.assignments where id=p_id;
  if not found then raise exception 'La asignación no existe.'; end if;
  if not public.can_edit_area(v_old.area_id) then raise exception 'No tienes permiso para editar esta área.' using errcode='42501'; end if;
  if v_old.version is distinct from p_version then raise exception 'La asignación cambió; vuelve a abrirla.' using errcode='40001'; end if;
  if p_note is null or length(p_note)>300 then raise exception 'La nota debe tener como máximo 300 caracteres.'; end if;
  select service_date into v_date from public.occurrences where id=v_old.occurrence_id;
  if p_volunteer_id is not null and (p_volunteer_id is distinct from v_old.volunteer_id or
    v_date >= (now() at time zone (select timezone from public.workspace_settings where id))::date) then
    if not exists(select 1 from public.volunteers where id=p_volunteer_id and active and v_old.area_id=any(area_ids)) then
      raise exception 'Selecciona una persona activa que pertenezca a esta área.';
    end if;
  end if;
  if p_volunteer_id is not null and exists(select 1 from public.assignments where
    occurrence_id=v_old.occurrence_id and id<>p_id and volunteer_id=p_volunteer_id) then
    raise exception 'Esta persona ya tiene otro puesto en el mismo servicio.';
  end if;
  update public.assignments set volunteer_id=p_volunteer_id,note=btrim(p_note),version=version+1 where id=p_id;
  select name into v_position from public.positions where id=v_old.position_id;
  select name into v_area from public.areas where id=v_old.area_id;
  perform public.record_change('Se actualizó ' || v_position || ' en ' || v_area, v_date::text,
    to_jsonb(v_old), jsonb_build_object('id',p_id,'volunteer_id',p_volunteer_id,'note',btrim(p_note)));
end;
$$;

create function public.save_volunteer(p_id uuid,p_name text,p_areas text[],p_active boolean,p_note text,p_version integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_old public.volunteers; v_id uuid;
begin
  perform public.require_admin(); perform public.lock_workspace();
  if p_name is null or length(btrim(p_name)) not between 1 and 80 or p_note is null or length(p_note)>300 or
    p_areas is null or (p_active and cardinality(p_areas)=0) or p_active is null then raise exception 'Revisa el nombre, las áreas, el estado y la nota del voluntario.'; end if;
  if p_id is null then
    insert into public.volunteers(name,area_ids,active,note) values(btrim(p_name),p_areas,p_active,btrim(p_note)) returning id into v_id;
  else
    select * into v_old from public.volunteers where id=p_id;
    if not found then raise exception 'El voluntario no existe.'; end if;
    if v_old.version is distinct from p_version then raise exception 'El voluntario cambió.' using errcode='40001'; end if;
    if exists(select 1 from public.assignments a join public.occurrences o on o.id=a.occurrence_id
      where a.volunteer_id=p_id and o.service_date >= (now() at time zone (select timezone from public.workspace_settings where id))::date
      and (not p_active or not a.area_id=any(p_areas))) then
      raise exception 'Libera primero sus asignaciones presentes o futuras antes de desactivar a la persona o quitarle un área.';
    end if;
    update public.volunteers set name=btrim(p_name),area_ids=p_areas,active=p_active,note=btrim(p_note),version=version+1 where id=p_id;
    v_id:=p_id;
  end if;
  perform public.record_change('Se guardó un voluntario.',btrim(p_name),to_jsonb(v_old),jsonb_build_object('id',v_id,'name',btrim(p_name),'areas',p_areas,'active',p_active));
  return v_id;
end;
$$;

create function public.save_service(p_id uuid,p_name text,p_day integer,p_time time,p_active boolean,p_version integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_old public.services; v_id uuid;
begin
  perform public.require_admin(); perform public.lock_workspace();
  if p_id is null then
    insert into public.services(name,weekday,start_time,active) values(btrim(p_name),p_day,p_time,p_active) returning id into v_id;
  else
    select * into v_old from public.services where id=p_id;
    if not found then raise exception 'El servicio no existe.'; end if;
    if v_old.version is distinct from p_version then raise exception 'El servicio cambió.' using errcode='40001'; end if;
    update public.services set name=btrim(p_name),weekday=p_day,start_time=p_time,active=p_active,version=version+1 where id=p_id;
    v_id:=p_id;
  end if;
  perform public.record_change('Se guardó una plantilla de servicio.',btrim(p_name),to_jsonb(v_old),jsonb_build_object('id',v_id,'name',p_name,'day',p_day,'time',p_time,'active',p_active));
  return v_id;
end;
$$;
create function public.save_position(p_id uuid,p_area text,p_name text,p_active boolean,p_version integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_old public.positions; v_id uuid;
begin
  perform public.require_admin(); perform public.lock_workspace();
  if p_id is null then
    insert into public.positions(area_id,name,active) values(p_area,btrim(p_name),p_active) returning id into v_id;
  else
    select * into v_old from public.positions where id=p_id;
    if not found then raise exception 'El puesto no existe.'; end if;
    if v_old.version is distinct from p_version then raise exception 'El puesto cambió.' using errcode='40001'; end if;
    if v_old.area_id<>p_area then raise exception 'No se puede mover un puesto a otra área. Crea otro puesto.'; end if;
    update public.positions set name=btrim(p_name),active=p_active,version=version+1 where id=p_id;
    v_id:=p_id;
  end if;
  perform public.record_change('Se guardó un puesto.',btrim(p_name),to_jsonb(v_old),jsonb_build_object('id',v_id,'name',p_name,'area',p_area,'active',p_active));
  return v_id;
end;
$$;
create function public.save_grant(p_id uuid,p_email text,p_role text,p_areas text[],p_volunteer_id uuid,p_active boolean,p_version integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_old public.access_grants; v_id uuid;
begin
  perform public.require_admin(); perform public.lock_workspace();
  if p_id is null then
    insert into public.access_grants(email,role,area_ids,volunteer_id,active)
      values(lower(btrim(p_email)),p_role,p_areas,p_volunteer_id,p_active) returning id into v_id;
  else
    select * into v_old from public.access_grants where id=p_id;
    if not found then raise exception 'El acceso no existe.'; end if;
    if v_old.version is distinct from p_version then raise exception 'El acceso cambió.' using errcode='40001'; end if;
    if v_old.email<>lower(btrim(p_email)) then raise exception 'El correo de un acceso no se modifica. Desactiva el anterior y crea otro.'; end if;
    if v_old.active and v_old.role='admin' and (not p_active or p_role<>'admin') and
      not exists(select 1 from public.access_grants where id<>p_id and role='admin' and active) then
      raise exception 'Debe quedar al menos un administrador activo.';
    end if;
    update public.access_grants set role=p_role,area_ids=p_areas,volunteer_id=p_volunteer_id,active=p_active,version=version+1 where id=p_id;
    v_id:=p_id;
  end if;
  perform public.record_change('Se actualizaron los permisos de acceso.','',to_jsonb(v_old),
    jsonb_build_object('id',v_id,'role',p_role,'areas',p_areas,'active',p_active,'volunteer_id',p_volunteer_id));
  return v_id;
end;
$$;
create function public.save_settings(p_name text,p_timezone text,p_version integer)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old public.workspace_settings;
begin
  perform public.require_admin(); perform public.lock_workspace();
  select * into v_old from public.workspace_settings where id;
  if v_old.version is distinct from p_version then raise exception 'La configuración cambió.' using errcode='40001'; end if;
  if not exists(select 1 from pg_timezone_names where name=p_timezone) then raise exception 'La zona horaria IANA no es válida.'; end if;
  update public.workspace_settings set name=btrim(p_name),timezone=p_timezone,version=version+1 where id;
  perform public.record_change('Se actualizó la configuración.',p_timezone,to_jsonb(v_old),jsonb_build_object('name',p_name,'timezone',p_timezone));
end;
$$;
create function public.generate_schedule(p_start date,p_end date)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer; v_occurrences integer;
begin
  perform public.require_admin(); perform public.lock_workspace();
  if p_start is null or p_end is null or p_end<p_start or p_end-p_start>120 then
    raise exception 'Selecciona un periodo de 1 a 121 días.';
  end if;
  insert into public.occurrences(service_id,service_date,start_time,name)
    select s.id,d::date,s.start_time,s.name
    from generate_series(p_start::timestamp,p_end::timestamp,interval '1 day') d
    join public.services s on s.active and s.weekday=extract(dow from d)::integer
    on conflict(service_id,service_date) do nothing;
  get diagnostics v_occurrences=row_count;
  insert into public.assignments(occurrence_id,area_id,position_id)
    select o.id,p.area_id,p.id from public.occurrences o
    join public.services s on s.id=o.service_id and s.active cross join public.positions p
    where o.service_date between p_start and p_end and p.active
    on conflict(occurrence_id,position_id) do nothing;
  get diagnostics v_count=row_count;
  perform public.record_change('Se generó un periodo sin borrar asignaciones.',p_start::text || ' a ' || p_end::text || ' · ' || v_occurrences || ' servicios, ' || v_count || ' puestos nuevos');
  return v_count;
end;
$$;

create function public.import_workbook(p_payload jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  r jsonb; v_id uuid; v_volunteers jsonb:='{}'; v_services jsonb:='{}'; v_positions jsonb:='{}'; v_occurrences jsonb:='{}';
  v_area text; v_person uuid; v_occurrence uuid; v_position uuid; v_count integer:=0;
begin
  perform public.require_admin(); perform public.lock_workspace();
  if exists(select 1 from public.volunteers) or exists(select 1 from public.occurrences) then
    raise exception 'La importación inicial solo se permite con voluntarios y calendario vacíos. No sobrescribe datos existentes.';
  end if;
  if p_payload->>'format' is distinct from 'area-excel-v1' or length(p_payload::text)>5000000 or
    jsonb_array_length(p_payload->'volunteers')>2000 or
    jsonb_array_length(p_payload->'assignments')>10000 or
    jsonb_array_length(p_payload->'services')=0 then raise exception 'El archivo no cumple los límites de importación.'; end if;
  if jsonb_typeof(p_payload->'volunteers') is distinct from 'array' or
    jsonb_typeof(p_payload->'services') is distinct from 'array' or
    jsonb_typeof(p_payload->'positions') is distinct from 'array' or
    jsonb_typeof(p_payload->'occurrences') is distinct from 'array' or
    jsonb_typeof(p_payload->'assignments') is distinct from 'array' then raise exception 'La estructura de importación está incompleta.'; end if;
  delete from public.positions where id is not null;
  delete from public.services where id is not null;
  for r in select * from jsonb_array_elements(p_payload->'volunteers') loop
    if r->>'ref' is null or v_volunteers ? (r->>'ref') then raise exception 'Referencia de voluntario vacía o duplicada.'; end if;
    insert into public.volunteers(name,active,area_ids,note)
      values(btrim(r->>'name'),(r->>'active')::boolean,array(select jsonb_array_elements_text(r->'areas')),coalesce(r->>'note','')) returning id into v_id;
    v_volunteers:=v_volunteers || jsonb_build_object(r->>'ref',v_id);
  end loop;
  for r in select * from jsonb_array_elements(p_payload->'services') loop
    if r->>'ref' is null or v_services ? (r->>'ref') then raise exception 'Referencia de servicio vacía o duplicada.'; end if;
    insert into public.services(name,weekday,start_time,active)
      values(r->>'name',(r->>'day')::integer,(r->>'time')::time,(r->>'active')::boolean) returning id into v_id;
    v_services:=v_services || jsonb_build_object(r->>'ref',v_id);
  end loop;
  for r in select * from jsonb_array_elements(p_payload->'positions') loop
    if r->>'ref' is null or v_positions ? (r->>'ref') then raise exception 'Referencia de puesto vacía o duplicada.'; end if;
    insert into public.positions(area_id,name,active) values(r->>'areaId',r->>'name',(r->>'active')::boolean) returning id into v_id;
    v_positions:=v_positions || jsonb_build_object(r->>'ref',v_id);
  end loop;
  for r in select * from jsonb_array_elements(p_payload->'occurrences') loop
    if r->>'ref' is null or v_occurrences ? (r->>'ref') then raise exception 'Referencia de fecha vacía o duplicada.'; end if;
    insert into public.occurrences(service_id,service_date,start_time,name)
      values((v_services->>(r->>'serviceRef'))::uuid,(r->>'date')::date,(r->>'time')::time,r->>'name') returning id into v_id;
    v_occurrences:=v_occurrences || jsonb_build_object(r->>'ref',v_id);
  end loop;
  for r in select * from jsonb_array_elements(p_payload->'assignments') loop
    v_person:=case when coalesce(r->>'volunteerRef','')='' then null else (v_volunteers->>(r->>'volunteerRef'))::uuid end;
    v_occurrence:=(v_occurrences->>(r->>'occurrenceRef'))::uuid;
    v_position:=(v_positions->>(r->>'positionRef'))::uuid;
    v_area:=r->>'areaId';
    if coalesce(r->>'volunteerRef','')<>'' and v_person is null then raise exception 'Hay una persona desconocida en las asignaciones.'; end if;
    if v_person is not null and not exists(select 1 from public.volunteers where id=v_person and v_area=any(area_ids)) then
      raise exception 'Una persona asignada no pertenece al área. Corrige el Excel antes de importar.';
    end if;
    if v_person is not null and exists(select 1 from public.volunteers v, public.occurrences o
      where v.id=v_person and o.id=v_occurrence and not v.active and
      o.service_date >= (now() at time zone (select timezone from public.workspace_settings where id))::date) then
      raise exception 'Hay personas inactivas con asignaciones presentes o futuras.';
    end if;
    insert into public.assignments(occurrence_id,area_id,position_id,volunteer_id,note)
      values(v_occurrence,v_area,v_position,v_person,coalesce(r->>'note',''));
    v_count:=v_count+1;
  end loop;
  perform public.record_change('Se importó el Excel inicial.',v_count || ' puestos. Importación completa en una sola transacción.');
  return v_count;
end;
$$;

alter table public.workspace_settings enable row level security;
alter table public.areas enable row level security;
alter table public.volunteers enable row level security;
alter table public.access_grants enable row level security;
alter table public.members enable row level security;
alter table public.services enable row level security;
alter table public.positions enable row level security;
alter table public.occurrences enable row level security;
alter table public.assignments enable row level security;
alter table public.workspace_version enable row level security;
alter table public.audit_log enable row level security;

create policy member_read on public.workspace_settings for select to authenticated using (public.is_member());
create policy member_read on public.areas for select to authenticated using (public.is_member());
create policy member_read on public.volunteers for select to authenticated using (public.is_member());
create policy admin_read on public.access_grants for select to authenticated using (public.is_admin());
create policy self_read on public.members for select to authenticated using (user_id=auth.uid() or public.is_admin());
create policy member_read on public.services for select to authenticated using (public.is_member());
create policy member_read on public.positions for select to authenticated using (public.is_member());
create policy member_read on public.occurrences for select to authenticated using (public.is_member());
create policy member_read on public.assignments for select to authenticated using (public.is_member());
create policy member_read on public.workspace_version for select to authenticated using (public.is_member());
create policy admin_read on public.audit_log for select to authenticated using (public.is_admin());

revoke all on public.workspace_settings,public.areas,public.volunteers,public.access_grants,public.members,
  public.services,public.positions,public.occurrences,public.assignments,public.workspace_version,public.audit_log from anon, authenticated;
grant usage on schema public to authenticated;
grant select on public.workspace_settings,public.areas,public.volunteers,public.access_grants,public.members,
  public.services,public.positions,public.occurrences,public.assignments,public.workspace_version,public.audit_log to authenticated;
revoke execute on function public.is_member(),public.is_admin(),public.can_edit_area(text),
  public.require_member(),public.require_admin(),public.lock_workspace(),public.record_change(text,text,jsonb,jsonb),
  public.enter_workspace(),public.get_revision(),public.read_workspace(),
  public.write_assignment(uuid,uuid,text,integer),
  public.save_volunteer(uuid,text,text[],boolean,text,integer),
  public.save_service(uuid,text,integer,time,boolean,integer),
  public.save_position(uuid,text,text,boolean,integer),
  public.save_grant(uuid,text,text,text[],uuid,boolean,integer),
  public.save_settings(text,text,integer),
  public.generate_schedule(date,date),public.import_workbook(jsonb) from public, anon, authenticated;
grant execute on function public.is_member(),public.is_admin(),public.can_edit_area(text),
  public.enter_workspace(),public.get_revision(),public.read_workspace(),
  public.write_assignment(uuid,uuid,text,integer),
  public.save_volunteer(uuid,text,text[],boolean,text,integer),
  public.save_service(uuid,text,integer,time,boolean,integer),
  public.save_position(uuid,text,text,boolean,integer),
  public.save_grant(uuid,text,text,text[],uuid,boolean,integer),
  public.save_settings(text,text,integer),
  public.generate_schedule(date,date),public.import_workbook(jsonb) to authenticated;

do $$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    alter publication supabase_realtime add table public.workspace_version;
  end if;
end;
$$;

commit;
