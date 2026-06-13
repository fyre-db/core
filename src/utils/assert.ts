import { FyreDbConfigError } from '@/errors';

export function assertNotDisposed(disposed: boolean, name: string = 'Instance'): void {
  if (disposed) throw new FyreDbConfigError(`${name} is disposed`);
}
