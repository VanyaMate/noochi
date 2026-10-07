import { runInfraService } from '@noochi/platform';
import { usersHandlers } from './index.js';

runInfraService('users', (stack) => usersHandlers(stack));
