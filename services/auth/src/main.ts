import { runInfraService } from '@noochi/platform';
import { authHandlers } from './index.js';

runInfraService('auth', (stack) => authHandlers(stack));
