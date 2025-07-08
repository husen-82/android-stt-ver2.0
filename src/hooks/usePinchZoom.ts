/*import { useState, useEffect, RefObject } from 'react';

export const usePinchZoom = (elementRef: RefObject<HTMLElement>) => {
       const [scale, setScale] = useState(1);
       const [lastTouchDistance, setLastTouchDistance] = useState(0);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const getTouchDistance = (touches: TouchList) => {
      if (touches.length < 2) return 0;
      
      const touch1 = touches[0];
      const touch2 = touches[1];
      
      return Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) +
        Math.pow(touch2.clientY - touch1.clientY, 2)
      );
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        setLastTouchDistance(getTouchDistance(e.touches));
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        
        const currentDistance = getTouchDistance(e.touches);
        if (lastTouchDistance > 0) {
          const scaleChange = currentDistance / lastTouchDistance;
          setScale(prevScale => Math.min(Math.max(prevScale * scaleChange, 0.5), 3));
        }
        setLastTouchDistance(currentDistance);
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        setLastTouchDistance(0);
      }
    };

    element.addEventListener('touchstart', handleTouchStart, { passive: false });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [elementRef, lastTouchDistance]);

  return { scale };
};*/