-- Add message_received notification type for messaging system
do $$ begin
  alter type notification_type add value if not exists 'message_received';
exception when duplicate_object then null; end $$;
