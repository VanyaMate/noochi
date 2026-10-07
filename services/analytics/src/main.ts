import { runInfraService } from '@noochi/platform';
import { analyticsHandlers } from './index.js';

runInfraService('analytics', (stack) => analyticsHandlers(stack));
