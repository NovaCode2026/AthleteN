-- Internal trigger function: clients must not invoke it as an RPC.
revoke execute on function public.sync_training_group_chat_member() from public, anon, authenticated;