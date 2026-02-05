import { useRef, useCallback } from 'react';

interface UseTouchNavigationArgs {
  onNext?: () => void;
  onPrev?: () => void;
  minSwipeDistance?: number;
}

export function useTouchNavigation({ onNext, onPrev, minSwipeDistance = 50 }: UseTouchNavigationArgs) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchEndRef = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    touchEndRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);

  const onTouchEnd = useCallback(() => {
    if (!touchStartRef.current || !touchEndRef.current) return;

    const deltaX = touchEndRef.current.x - touchStartRef.current.x;
    const deltaY = touchEndRef.current.y - touchStartRef.current.y;
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);

    // Only handle horizontal swipes where horizontal distance is greater than vertical
    if (absDeltaX > minSwipeDistance && absDeltaX > absDeltaY) {
      if (deltaX > 0 && onNext) onNext();
      else if (deltaX < 0 && onPrev) onPrev();
    }

    touchStartRef.current = null;
    touchEndRef.current = null;
  }, [minSwipeDistance, onNext, onPrev]);

  return { onTouchStart, onTouchMove, onTouchEnd };
}

