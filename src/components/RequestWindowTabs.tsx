import React, { useState } from 'react';

export interface WindowTabItem {
  key: string;
  kind: 'request' | 'runner';
  method?: string;
  title: string;
  loading?: boolean;
}

interface RequestWindowTabsProps {
  tabs: WindowTabItem[];
  activeKey: string | null;
  /** When a saved response is on screen, no request or runner tab is shown as selected. */
  suppressActive?: boolean;
  onSelect: (key: string) => void;
  onClose: (key: string) => void;
  /** Called when a tab is dropped on another tab; `toKey` is the tab it was dropped on. */
  onMove: (fromKey: string, toKey: string) => void;
}

export const RequestWindowTabs: React.FC<RequestWindowTabsProps> = ({
  tabs,
  activeKey,
  suppressActive = false,
  onSelect,
  onClose,
  onMove,
}) => {
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);

  if (tabs.length === 0) return null;

  const clearDrag = () => {
    setDraggedKey(null);
    setDropKey(null);
  };

  return (
    <div className="window-tabs" role="tablist" aria-label="Open requests and runners">
      {tabs.map(tab => {
        const selected = !suppressActive && tab.key === activeKey;
        const classes = ['window-tab'];
        if (selected) classes.push('active');
        if (tab.key === draggedKey) classes.push('dragging');
        if (tab.key === dropKey && draggedKey !== null && draggedKey !== tab.key) classes.push('drop-target');
        return (
          <div
            key={tab.key}
            role="tab"
            aria-selected={selected}
            className={classes.join(' ')}
            title={tab.title}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', tab.key);
              setDraggedKey(tab.key);
            }}
            onDragOver={(event) => {
              if (draggedKey === null) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              if (dropKey !== tab.key) setDropKey(tab.key);
            }}
            onDragLeave={() => {
              if (dropKey === tab.key) setDropKey(null);
            }}
            onDrop={(event) => {
              if (draggedKey === null) return;
              event.preventDefault();
              if (draggedKey !== tab.key) onMove(draggedKey, tab.key);
              clearDrag();
            }}
            onDragEnd={clearDrag}
            onClick={() => onSelect(tab.key)}
            onAuxClick={(event) => {
              if (event.button === 1) {
                event.preventDefault();
                onClose(tab.key);
              }
            }}
          >
            {tab.kind === 'request' ? (
              <span className={`http-method ${tab.method || ''}`}>{tab.method}</span>
            ) : (
              <span className="window-tab-kind">RUN</span>
            )}
            <span className="window-tab-title">{tab.title}</span>
            {tab.loading && <span className="window-tab-loading" aria-label="Sending" />}
            <button
              type="button"
              className="window-tab-close"
              aria-label={`Close ${tab.title}`}
              onClick={(event) => {
                event.stopPropagation();
                onClose(tab.key);
              }}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
};
