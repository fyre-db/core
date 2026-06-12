import { FyreDbConfigError } from '@/errors';

/**
 * Convert a Uint8Array to an ArrayBuffer, handling byte offset correctly.
 */
export function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

export function toBase64(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

export function fromBase64(base64: string): Uint8Array {
  try {
    return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  } catch {
    throw new FyreDbConfigError('Invalid base64 input');
  }
}

export async function streamToUint8Array(
  readable: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  const reader = readable.getReader();
  try {
    const chunks: Uint8Array[] = [];
    let totalLength = 0;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalLength += value.length;
    }

    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  } finally {
    reader.releaseLock();
  }
}
