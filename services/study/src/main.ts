import { runInfraService } from '@noochi/platform';
import { studyHandlers } from './index.js';

runInfraService('study', (stack) => studyHandlers(stack));
