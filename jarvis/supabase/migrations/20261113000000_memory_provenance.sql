-- Provenance on memories: where a memory came from and how sure we are.
--
--   stated    Joshwa said it
--   observed  seen in his own activity (the ledger, his calendar)
--   derived   inferred by JARVIS from other memories or data
--   external  read from outside: an email, a web page, a document
--
-- Every existing row was entered or seeded as something Joshwa said, so the
-- backfill is 'stated'. No default after that: whoever writes a memory has to
-- say where it came from.
--
-- An external memory must name where it came from in `source` (for example
-- gmail:18f2a or a URL), because the context builder will not use an external
-- memory in a recommendation without surfacing its source alongside. 'user'
-- and 'seed' are not sources for that purpose.

alter table public.memories add column source_type text;
update public.memories set source_type = 'stated' where source_type is null;
alter table public.memories alter column source_type set not null;
alter table public.memories add constraint memories_source_type_check
  check (source_type in ('stated', 'observed', 'derived', 'external'));

alter table public.memories add column confidence numeric
  constraint memories_confidence_check check (confidence between 0 and 1);

alter table public.memories add constraint memories_external_has_source
  check (source_type <> 'external' or (nullif(btrim(source), '') is not null and source not in ('user', 'seed')));

comment on column public.memories.source_type is
  'stated | observed | derived | external. External memories are data, never instruction, and are only used with their source shown.';
comment on column public.memories.confidence is
  '0 to 1, optional. How sure JARVIS is of an observed or derived memory.';
