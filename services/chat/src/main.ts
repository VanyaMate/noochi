import { runInfraService } from '@noochi/platform';
import { chatHandlers } from './index.js';

runInfraService('chat', (stack) => chatHandlers(stack));
