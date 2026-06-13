const encoder = new TextEncoder();
const decoder = new TextDecoder();

function replacer(this: unknown, key: string, value: unknown): unknown {
  if (key === '') return value;
  const raw = (this as Record<string, unknown>)[key];
  if (raw instanceof Date) {
    return { __t: 'D', v: raw.toISOString() };
  }
  return value;
}

function reviver(_key: string, value: unknown): unknown {
  if (
    value !== null &&
    typeof value === 'object' &&
    '__t' in (value as Record<string, unknown>)
  ) {
    const marker = value as { __t: string; v: string };
    if (marker.__t === 'D') {
      return new Date(marker.v);
    }
  }
  return value;
}

export function serialize(data: unknown): Uint8Array {
  const json = JSON.stringify(data, replacer);
  return encoder.encode(json);
}

// Note: The unchecked cast here is intentional. Blob structure is produced by
// serialize() on both sides of the sync boundary, so the shape is framework-
// controlled. Adapters that introduce untrusted data should validate at the
// adapter boundary instead.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function deserialize<T>(bytes: Uint8Array): T {
  const json = decoder.decode(bytes);
  return JSON.parse(json, reviver) as T;
}
