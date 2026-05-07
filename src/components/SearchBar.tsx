import React, { useState, useRef, useEffect } from 'react';

interface SearchBarProps {
  isOpen: boolean;
  onClose: () => void;
  onSearch: (term: string, options: SearchOptions) => void;
  totalMatches?: number;
  activeMatch?: number;
  onPrevious?: () => void;
  onNext?: () => void;
}

export interface SearchOptions {
  caseSensitive: boolean;
  wholeWords: boolean;
  useRegex: boolean;
}

export interface SearchResult {
  elementId: string;
  startIndex: number;
  endIndex: number;
  text: string;
  panel: 'request' | 'response';
  context: string; // e.g., 'url', 'headers', 'body', 'response-body'
}

export const SearchBar: React.FC<SearchBarProps> = ({
  isOpen,
  onClose,
  onSearch,
  totalMatches = 0,
  activeMatch = 0,
  onPrevious,
  onNext,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWords, setWholeWords] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleSearch = (term: string) => {
    setSearchTerm(term);

    // Clear existing debounce timeout
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Set up new debounced search (300ms delay)
    debounceRef.current = setTimeout(() => {
      onSearch(term, { caseSensitive, wholeWords, useRegex });
    }, 300);
  };

  const handleOptionsChange = () => {
    // Options changes should execute immediately (no debounce)
    if (searchTerm) {
      onSearch(searchTerm, { caseSensitive, wholeWords, useRegex });
    }
  };

  useEffect(() => {
    handleOptionsChange();
  }, [caseSensitive, wholeWords, useRegex]);

  // Cleanup debounce timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: '60px',
      right: '20px',
      background: '#2d2d2d',
      border: '1px solid #0d7377',
      borderRadius: '6px',
      padding: '0.75rem',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      minWidth: '280px',
    }}>
      <span style={{ fontSize: '1rem' }}>🔍</span>
      <input
        ref={inputRef}
        type="text"
        value={searchTerm}
        onChange={(e) => handleSearch(e.target.value)}
        placeholder={useRegex ? "Regex: user\\d+ or (get|post)..." : "Find in request and response..."}
        style={{
          flex: 1,
          background: '#1a1a1a',
          border: '1px solid #404040',
          borderRadius: '4px',
          padding: '0.4rem 0.6rem',
          color: '#fff',
          fontSize: '0.85rem',
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            onClose();
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) {
              onPrevious?.();
            } else {
              onNext?.();
            }
          }
        }}
      />
      {searchTerm.trim() && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
          <button
            onClick={onPrevious}
            disabled={totalMatches === 0}
            title="Previous match (Shift+Enter)"
            style={{
              background: 'none',
              border: '1px solid #555',
              borderRadius: '3px',
              color: totalMatches === 0 ? '#555' : '#ccc',
              cursor: totalMatches === 0 ? 'default' : 'pointer',
              padding: '0.1rem 0.35rem',
              fontSize: '0.7rem',
              lineHeight: 1,
            }}
          >
            &#9650;
          </button>
          <span style={{ fontSize: '0.75rem', color: '#aaa', minWidth: '50px', textAlign: 'center', whiteSpace: 'nowrap' }}>
            {totalMatches === 0 ? 'No results' : `${activeMatch + 1} / ${totalMatches}`}
          </span>
          <button
            onClick={onNext}
            disabled={totalMatches === 0}
            title="Next match (Enter)"
            style={{
              background: 'none',
              border: '1px solid #555',
              borderRadius: '3px',
              color: totalMatches === 0 ? '#555' : '#ccc',
              cursor: totalMatches === 0 ? 'default' : 'pointer',
              padding: '0.1rem 0.35rem',
              fontSize: '0.7rem',
              lineHeight: 1,
            }}
          >
            &#9660;
          </button>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
            fontSize: '0.75rem',
            color: '#ccc',
            cursor: 'pointer',
          }}
          title="Case sensitive search"
        >
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(e) => setCaseSensitive(e.target.checked)}
            style={{ transform: 'scale(0.8)' }}
          />
          Aa
        </label>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
            fontSize: '0.75rem',
            color: '#ccc',
            cursor: 'pointer',
          }}
          title="Whole words only (e.g., 'test' won't match 'testing')"
        >
          <input
            type="checkbox"
            checked={wholeWords}
            onChange={(e) => setWholeWords(e.target.checked)}
            style={{ transform: 'scale(0.8)' }}
          />
          |W|
        </label>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
            fontSize: '0.75rem',
            color: '#ccc',
            cursor: 'pointer',
          }}
          title="Use regular expressions (e.g., 'user\d+' or '(get|post)')"
        >
          <input
            type="checkbox"
            checked={useRegex}
            onChange={(e) => setUseRegex(e.target.checked)}
            style={{ transform: 'scale(0.8)' }}
          />
          .*
        </label>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#888',
            cursor: 'pointer',
            padding: '0.2rem',
            fontSize: '1rem',
            lineHeight: 1,
          }}
          title="Close (Esc)"
        >
          ✕
        </button>
      </div>
    </div>
  );
};