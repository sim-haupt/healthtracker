begin;

alter table public.providers
  add column rating smallint
  check (rating between 1 and 5);

commit;
