import { useLayoutEffect, useRef } from 'react';

/**
 * A ref that always holds the latest value. D3 event handlers read callbacks
 * through this, so passing new inline callbacks doesn't force the D3 effect
 * (and its transitions) to re-run.
 */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
