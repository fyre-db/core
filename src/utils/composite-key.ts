import type { Tenant } from '@/adapter';

export function compositeKey(tenant: Tenant | undefined, key: string): string {
  return tenant ? `${tenant.id}:${key}` : key;
}

export function parseCompositeKey(key: string): { entityName: string; rest: string } | null {
  const dotIndex = key.indexOf('.');
  if (dotIndex < 0) return null;
  return { entityName: key.substring(0, dotIndex), rest: key.substring(dotIndex + 1) };
}

export function formatEntityId(entityName: string, partitionKey: string, uniqueId: string): string {
  return `${entityName}.${partitionKey}.${uniqueId}`;
}

export function parseEntityKey(id: string): string {
  const lastDot = id.lastIndexOf('.');
  return id.substring(0, lastDot);
}
