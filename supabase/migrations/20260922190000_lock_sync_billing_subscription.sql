-- The signature changed when workspace_mode was dropped, and the new one inherited the
-- default public EXECUTE. Without this, any caller could sync themselves an active
-- subscription through /rest/v1/rpc. Only the webhook's service role may call it.
revoke all on function public.sync_billing_subscription(
  uuid, text, text, text, text, text, text, timestamptz, timestamptz, boolean, timestamptz, timestamptz
) from public, anon, authenticated;

grant execute on function public.sync_billing_subscription(
  uuid, text, text, text, text, text, text, timestamptz, timestamptz, boolean, timestamptz, timestamptz
) to service_role;
