import { useInput, useStdin } from 'ink';
import type { Key } from 'ink';

type Handler = (input: string, key: Key) => void;

/**
 * Safe wrapper around Ink's useInput that no-ops when stdin isn't a TTY
 * (e.g. when the process is spawned via pipes in tests). Without this,
 * Ink throws "Raw mode is not supported" and crashes the render.
 */
export function useSafeInput(handler: Handler): void {
  const { isRawModeSupported } = useStdin();
  useInput(handler, { isActive: isRawModeSupported });
}
