import { useEffect, useRef, useState, type ReactNode } from 'react';

// Wraps a floating panel and lets the user drag it around by grabbing any
// non-interactive part (or the grip pill at the top). The offset is a translate
// on top of the panel's normal anchored position, so layout stays responsive.
export default function Draggable({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const [off, setOff] = useState({ x: 0, y: 0 });
  const drag = useRef<{ mx: number; my: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!drag.current) return;
      setOff({
        x: drag.current.ox + (e.clientX - drag.current.mx),
        y: drag.current.oy + (e.clientY - drag.current.my),
      });
    };
    const up = () => {
      drag.current = null;
      document.body.classList.remove('dragging');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    // Don't hijack clicks on controls — only drag from panel chrome / empty space.
    if (
      (e.target as HTMLElement).closest(
        'button, input, select, textarea, a, [type="range"], .searchbox-results, .result-thumb',
      )
    ) {
      return;
    }
    drag.current = { mx: e.clientX, my: e.clientY, ox: off.x, oy: off.y };
    document.body.classList.add('dragging');
  };

  return (
    <div
      className={`draggable${className ? ` ${className}` : ''}`}
      style={{ transform: off.x || off.y ? `translate(${off.x}px, ${off.y}px)` : undefined }}
      onPointerDown={onPointerDown}
    >
      <span className="drag-grip" title="Drag to move" aria-hidden="true" />
      {children}
    </div>
  );
}
