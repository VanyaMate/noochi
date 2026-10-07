import { runInfraService } from '@noochi/platform';
import { billingHandlers } from './index.js';

runInfraService('billing', (stack) => billingHandlers(stack));
