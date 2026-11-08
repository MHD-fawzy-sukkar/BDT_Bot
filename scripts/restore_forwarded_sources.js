const fs = require('fs');

const sql = fs.readFileSync('backups/bdt_db_backup_pre_mod.sql', 'utf8');
const lines = sql.split('\n');

const forwardedItems = [];

for (const line of lines) {
  if (!line.includes('INSERT INTO "node_contents"')) continue;
  
  // Format: VALUES(id,node_id,'content_type','source_chat_id',source_message_id,file_id,title,caption,sort_order,'created_at',is_forwarded);
  const match = line.match(/VALUES\((\d+),(\d+),'([^']+)',('([^']+)'|[^,]+),(\d+),/);
  if (match) {
    const id = Number(match[1]);
    const sourceChatId = match[5] || match[4].replace(/'/g, '');
    const sourceMsgId = Number(match[6]);
    
    // Check if is_forwarded is 1 at the end of values
    // regex: ,1\);?$
    if (/,1\);?\r?$/.test(line)) {
      forwardedItems.push({ id, sourceChatId, sourceMsgId });
    }
  }
}

console.log(`Found ${forwardedItems.length} originally forwarded items in backup.`);
fs.writeFileSync('scripts/forwarded_items.json', JSON.stringify(forwardedItems, null, 2));
