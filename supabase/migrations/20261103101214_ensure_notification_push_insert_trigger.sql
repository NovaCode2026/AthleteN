-- Ensure every persisted notification is handed to the asynchronous Expo push dispatcher.
drop trigger if exists notifications_push_after_insert on public.notifications;
create trigger notifications_push_after_insert
after insert on public.notifications
for each row
execute function public.dispatch_notification_push();

revoke all on function public.dispatch_notification_push() from public, anon, authenticated;
