import { GripVertical } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface ResizeHandleProps {
  onResize: (deltaPercent: number) => void;
  style?: CSSProperties;
}

export function ResizeHandle({ onResize, style }: ResizeHandleProps) {
  const [isResizing, setIsResizing] = useState(false);
  const [startX, setStartX] = useState(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    setStartX(e.clientX);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startX;
      setStartX(e.clientX);
      // Convert to percentage based on window width
      const deltaPercent = (deltaX / window.innerWidth) * 100;
      onResize(deltaPercent);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, startX, onResize]);

  return (
    <div
      className={cn(
        'group absolute top-0 bottom-0 z-50 flex w-px -translate-x-1/2 shrink-0 cursor-col-resize items-center justify-center bg-border/50 hover:bg-accent transition-colors',
        isResizing && 'bg-accent'
      )}
      style={style}
      onMouseDown={handleMouseDown}
    >
      <GripVertical className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100" />
    </div>
  );
}
