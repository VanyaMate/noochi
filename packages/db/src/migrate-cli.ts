import { createDb, applyMigrations } from './client.js';
import { dbConfig } from './boot.js';

const handle = createDb(await dbConfig());
await applyMigrations(handle);
console.log(`[noochi:db] migrations applied (${handle.kind})`);
await handle.close();
