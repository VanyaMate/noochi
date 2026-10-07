import { runInfraService } from '@noochi/platform';
import { botsHandlers } from './index.js';

runInfraService('bots', (stack) => botsHandlers(stack));
