import type { SubjectName } from '@noochi/shared';
import type { Handler } from '@noochi/bus';
import { makeStack, type Stack } from './context.js';

export type HandlerMap = Partial<Record<SubjectName, Handler>>;

/** Entry for one microservice in infra mode: connect bus, register handlers, keep alive. */
export async function runInfraService(name: string, build: (stack: Stack) => HandlerMap): Promise<void> {
  const stack = await makeStack('infra');
  const handlers = build(stack);
  let count = 0;
  for (const [subject, handler] of Object.entries(handlers)) {
    stack.bus.registerHandler(subject as SubjectName, handler, name);
    count++;
  }
  console.log(`[noochi:service:${name}] ready, ${count} subjects`);

  const shutdown = async () => {
    console.log(`[noochi:service:${name}] stopping`);
    await stack.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
