-- Supabase default privileges may grant more than the workspace API needs.
revoke truncate,references,trigger on public.workspace_settings,public.workspace_records,public.workspace_operations from service_role;
