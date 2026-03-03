import React, { useState, useRef, useEffect } from 'react';

interface ResizableSidebarProps {
  children: React.ReactNode;
  minWidth?: number;
  maxWidth?: number;
  defaultWidth?: number;
}

export const ResizableSidebar: React.FC<ResizableSidebarProps> = ({
  children,
  minWidth = 250,
  maxWidth = 600,
  defaultWidth = 300
}) => {
  const [width, setWidth] = useState(defaultWidth);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const newWidth = e.clientX;
      if (newWidth >= minWidth && newWidth <= maxWidth) {
        setWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, minWidth, maxWidth]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  return (
    <div
      ref={sidebarRef}
      style={{
        width: `${width}px`,
        minWidth: `${width}px`,
        maxWidth: `${width}px`,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {children}

      {/* Resize Handle */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: '5px',
          cursor: 'col-resize',
          backgroundColor: 'transparent',
          zIndex: 1000,
          transition: 'background-color 0.2s'
        }}
        onMouseEnter={(e) => {
          if (!isResizing) {
            e.currentTarget.style.backgroundColor = '#0d7377';
          }
        }}
        onMouseLeave={(e) => {
          if (!isResizing) {
            e.currentTarget.style.backgroundColor = 'transparent';
          }
        }}
      >
        {/* Visual indicator on hover */}
        <div style={{
          position: 'absolute',
          right: '2px',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '3px',
          height: '40px',
          backgroundColor: isResizing ? '#14a085' : 'rgba(13, 115, 119, 0.5)',
          borderRadius: '2px',
          transition: 'background-color 0.2s'
        }}></div>
      </div>
    </div>
  );
};
