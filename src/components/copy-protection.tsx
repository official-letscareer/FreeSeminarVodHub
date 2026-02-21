'use client';

import { ReactNode, useEffect } from 'react';

export default function CopyProtection({ children }: { children: ReactNode }) {
  useEffect(() => {
    // 우클릭 차단
    const blockContextMenu = (e: MouseEvent) => e.preventDefault();

    // 개발자 도구 단축키 차단 (F12, Ctrl+Shift+I/J/C, Ctrl+U)
    const blockDevTools = (e: KeyboardEvent) => {
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(e.key.toUpperCase())) ||
        (e.ctrlKey && e.key.toUpperCase() === 'U')
      ) {
        e.preventDefault();
      }
    };

    document.addEventListener('contextmenu', blockContextMenu);
    document.addEventListener('keydown', blockDevTools);

    return () => {
      document.removeEventListener('contextmenu', blockContextMenu);
      document.removeEventListener('keydown', blockDevTools);
    };
  }, []);

  return (
    // 드래그·텍스트 선택 방지
    <div
      className="select-none"
      style={{ WebkitUserDrag: 'none' } as React.CSSProperties}
      onDragStart={(e) => e.preventDefault()}
    >
      {children}
    </div>
  );
}
