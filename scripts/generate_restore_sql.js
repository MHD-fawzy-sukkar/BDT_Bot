const fs = require('fs');

const items = JSON.parse(fs.readFileSync('scripts/forwarded_items.json', 'utf8'));

const sqlStatements = items.map(it => 
  `UPDATE node_contents SET source_chat_id = '${it.sourceChatId}', source_message_id = ${it.sourceMsgId} WHERE id = ${it.id};`
).join('\n');

fs.writeFileSync('scripts/restore_forwarded.sql', sqlStatements);
console.log(`Generated ${items.length} UPDATE statements in scripts/restore_forwarded.sql`);
