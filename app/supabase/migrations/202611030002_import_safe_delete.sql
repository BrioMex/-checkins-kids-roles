begin;

create or replace function public.import_workbook(p_payload jsonb)
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

commit;
