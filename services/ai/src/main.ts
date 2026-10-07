import { runInfraService } from '@noochi/platform';
import { aiHandlers } from './index.js';

runInfraService('ai', (stack) => aiHandlers(stack));
