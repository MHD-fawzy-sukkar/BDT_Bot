-- Add vault_message_id to store immutable mirrored message ID in vault storage channel
ALTER TABLE node_contents ADD COLUMN vault_message_id INTEGER NULL;
