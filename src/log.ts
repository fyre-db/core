import debug from 'debug';

const root = debug('core');

function createLogger(module: string) {
  const base = root.extend(module);
  return Object.assign(base, {
    warn: base.extend('warn'),
    error: base.extend('error'),
  });
}

export const log = {
  fyredb: createLogger('fyredb'),
  repo: createLogger('repo'),
  store: createLogger('store'),
  sync: createLogger('sync'),
  tenant: createLogger('tenant'),
};
