import { useCallback, useEffect, useRef } from 'react';

/** Invalidates async results when their owning component or draft goes away. */
export function useTaskScope() {
  const scope = useRef({ active: true, generation: 0 });
  useEffect(() => {
    scope.current.active = true;
    return () => {
      scope.current.active = false;
      scope.current.generation++;
    };
  }, []);
  const capture = useCallback(() => {
    const generation = scope.current.generation;
    return () => scope.current.active && scope.current.generation === generation;
  }, []);
  const invalidate = useCallback(() => { scope.current.generation++; }, []);
  return { capture, invalidate };
}
