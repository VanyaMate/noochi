import { makeStack } from '@noochi/platform';
import { createGateway } from './index.js';

const stack = await makeStack('infra');
const gw = await createGateway(stack);
await gw.listen(stack.env.gatewayPort);

const shutdown = async () => { await gw.close(); await stack.stop(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
