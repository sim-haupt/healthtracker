begin;

-- Files remain immutable, while the descriptive metadata shared by every file
-- in a document group can be corrected by its owner through the existing RLS
-- policy.
grant update(document_category, description) on public.attachments to authenticated;

commit;
