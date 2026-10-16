import React from 'react';

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
}

export const RequestWindowTabs: React.FC<RequestWindowTabsProps> = ({
  tabs,
  activeKey,
  suppressActive = false,
  onSelect,
  onClose,
}) => {
  if (tabs.length === 0) return null;

  return (
    <div className="window-tabs" role="tablist" aria-label="Open requests and runners">
      {tabs.map(tab => {
        const selected = !suppressActive && tab.key === activeKey;
        return (
          <div
            key={tab.key}
            role="tab"
            aria-selected={selected}
            className={`window-tab${selected ? ' active' : ''}`}
            title={tab.title}
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
