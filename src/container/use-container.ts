import { DefaultContainer } from './default-container.js';
import type { IocAdapter } from './ioc-adapter.js';

const defaultContainer: IocAdapter = new DefaultContainer();
let activeContainer: IocAdapter = defaultContainer;

export function useContainer(adapter: IocAdapter): void {
  activeContainer = adapter;
}

export function getContainer(): IocAdapter {
  return activeContainer;
}

/** Test-only API. Documented for users in README. */
export function resetContainer(): void {
  activeContainer = defaultContainer;
}
