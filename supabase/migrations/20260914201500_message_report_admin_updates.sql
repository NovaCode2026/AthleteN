create policy "admins can update message reports" on public.message_reports for update to authenticated using ((select private.is_platform_admin())) with check ((select private.is_platform_admin()));
