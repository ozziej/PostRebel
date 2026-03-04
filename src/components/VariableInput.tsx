import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Environment } from '../types';

interface VariableInputProps {
  value: string;
  onChange: (value: string) => void;
  environment: Environment | null;
  onUpdateVariable?: (varName: string, newValue: string) => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  multiline?: boolean;
}

interface TooltipState {
  varName: string;
  varValue: string;
  isDefined: boolean;
  x: number;
  y: number;
}

interface AutocompleteState {
  variables: string[];
  selectedIndex: number;
  position: { x: number; y: number };
  insertStart: number;
  insertEnd: number;
}

export const VariableInput: React.FC<VariableInputProps> = ({
  value,
  onChange,
  environment,
  onUpdateVariable,
  placeholder,
  className,
  style,
  multiline = false
}) => {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [editValue, setEditValue] = useState('');
  const [autocomplete, setAutocomplete] = useState<AutocompleteState | null>(null);
  const isHoveringTooltipRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimeout = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimeout();
    hideTimeoutRef.current = setTimeout(() => {
      if (!isHoveringTooltipRef.current) {
        setTooltip(null);
        setEditValue('');
      }
    }, 100);
  }, [clearHideTimeout]);

  const getCursorScreenPosition = useCallback((cursorPos: number): { x: number; y: number } => {
    const input = inputRef.current;
    const span = measureRef.current;
    if (!input || !span) return { x: 0, y: 0 };

    const computedStyle = window.getComputedStyle(input);
    span.style.font = computedStyle.font;
    span.style.fontSize = computedStyle.fontSize;
    span.style.fontFamily = computedStyle.fontFamily;
    span.style.letterSpacing = computedStyle.letterSpacing;

    const rect = input.getBoundingClientRect();
    const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
    const paddingTop = parseFloat(computedStyle.paddingTop) || 0;

    if (multiline) {
      const textBefore = value.substring(0, cursorPos);
      const lines = textBefore.split('\n');
      const currentLine = lines[lines.length - 1];
      const lineIndex = lines.length - 1;

      span.textContent = currentLine;
      const textWidth = span.offsetWidth;

      const lineHeight = parseFloat(computedStyle.lineHeight) || parseFloat(computedStyle.fontSize) * 1.2;
      const scrollTop = (input as HTMLTextAreaElement).scrollTop || 0;

      return {
        x: rect.left + paddingLeft + textWidth - (input.scrollLeft || 0),
        y: rect.top + paddingTop + (lineIndex + 1) * lineHeight - scrollTop
      };
    } else {
      span.textContent = value.substring(0, cursorPos);
      const textWidth = span.offsetWidth;
      return {
        x: rect.left + paddingLeft + textWidth - (input.scrollLeft || 0),
        y: rect.bottom
      };
    }
  }, [value, multiline]);

  const checkForAutocomplete = useCallback((inputValue: string, cursorPos: number) => {
    if (!environment) {
      setAutocomplete(null);
      return;
    }

    const before = inputValue.substring(0, cursorPos);
    const openIndex = before.lastIndexOf('{{');

    if (openIndex === -1) {
      setAutocomplete(null);
      return;
    }

    // Check there's no closing }} between the {{ and cursor
    const between = before.substring(openIndex + 2);
    if (between.includes('}}')) {
      setAutocomplete(null);
      return;
    }

    const query = between;
    // Don't show if query contains characters that can't be in variable names (except empty)
    if (/[^a-zA-Z0-9_]/.test(query)) {
      setAutocomplete(null);
      return;
    }

    const allVarNames = Object.keys(environment.variables);
    const filtered = query.length === 0
      ? allVarNames
      : allVarNames.filter(name => name.toLowerCase().includes(query.toLowerCase()));

    if (filtered.length === 0) {
      setAutocomplete(null);
      return;
    }

    // Find insertEnd: the position of `}}` after cursor, or cursor if not present
    const after = inputValue.substring(cursorPos);
    const closeMatch = after.match(/^(\w*)\}\}/);
    const insertEnd = closeMatch
      ? cursorPos + closeMatch[0].length
      : cursorPos;

    const pos = getCursorScreenPosition(cursorPos);
    setAutocomplete({
      variables: filtered,
      selectedIndex: 0,
      position: pos,
      insertStart: openIndex,
      insertEnd
    });
  }, [environment, getCursorScreenPosition]);

  const completeVariable = useCallback((variableName: string) => {
    if (!autocomplete || !inputRef.current) return;

    const newValue = value.substring(0, autocomplete.insertStart)
      + '{{' + variableName + '}}'
      + value.substring(autocomplete.insertEnd);
    onChange(newValue);

    const newCursorPos = autocomplete.insertStart + variableName.length + 4; // {{name}}
    setAutocomplete(null);

    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (input) {
        input.selectionStart = input.selectionEnd = newCursorPos;
        input.focus();
      }
    });
  }, [autocomplete, value, onChange]);

  const getVariableAtPosition = (mouseX: number): { name: string; startX: number; endX: number } | null => {
    if (!inputRef.current || !measureRef.current) return null;

    const variableRegex = /\{\{(\w+)\}\}/g;
    let match;
    const variables: Array<{ name: string; start: number; end: number }> = [];

    while ((match = variableRegex.exec(value)) !== null) {
      variables.push({
        name: match[1],
        start: match.index,
        end: match.index + match[0].length
      });
    }

    if (variables.length === 0) return null;

    const input = inputRef.current;
    const computedStyle = window.getComputedStyle(input);
    const span = measureRef.current;
    span.style.font = computedStyle.font;
    span.style.fontSize = computedStyle.fontSize;
    span.style.fontFamily = computedStyle.fontFamily;
    span.style.letterSpacing = computedStyle.letterSpacing;

    const scrollLeft = input.scrollLeft || 0;

    for (const variable of variables) {
      span.textContent = value.substring(0, variable.start);
      const startX = span.offsetWidth - scrollLeft;

      span.textContent = value.substring(0, variable.end);
      const endX = span.offsetWidth - scrollLeft;

      if (mouseX >= startX && mouseX <= endX) {
        return { name: variable.name, startX, endX };
      }
    }

    return null;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!environment || !inputRef.current) {
      if (!isHoveringTooltipRef.current) setTooltip(null);
      return;
    }

    const rect = inputRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const paddingLeft = parseFloat(window.getComputedStyle(inputRef.current).paddingLeft) || 0;
    const adjustedMouseX = mouseX - paddingLeft;

    const variable = getVariableAtPosition(adjustedMouseX);

    if (variable) {
      const varValue = environment.variables[variable.name];
      const isDefined = varValue !== undefined;
      const centerX = rect.left + paddingLeft + (variable.startX + variable.endX) / 2;
      const topY = rect.top;

      clearHideTimeout();
      setTooltip({
        varName: variable.name,
        varValue: isDefined ? varValue : '',
        isDefined,
        x: centerX,
        y: topY
      });
      setEditValue(isDefined ? varValue : '');
    } else if (!isHoveringTooltipRef.current) {
      scheduleHide();
    }
  };

  const handleMouseLeave = () => {
    scheduleHide();
  };

  const handleTooltipMouseEnter = () => {
    clearHideTimeout();
    isHoveringTooltipRef.current = true;
  };

  const handleTooltipMouseLeave = () => {
    isHoveringTooltipRef.current = false;
    setTooltip(null);
    setEditValue('');
  };

  const handleUpdate = () => {
    if (tooltip && onUpdateVariable) {
      onUpdateVariable(tooltip.varName, editValue);
      setTooltip(null);
      isHoveringTooltipRef.current = false;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleUpdate();
    } else if (e.key === 'Escape') {
      setTooltip(null);
      setEditValue('');
      isHoveringTooltipRef.current = false;
    }
  };

  // Click-outside dismissal for autocomplete
  useEffect(() => {
    if (!autocomplete) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        inputRef.current && !inputRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setAutocomplete(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [autocomplete]);

  const handleAutocompleteKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    // Auto-insert closing braces
    if (e.key === '{') {
      const input = e.currentTarget;
      const cursorPos = input.selectionStart ?? 0;
      const charBefore = value[cursorPos - 1];

      if (charBefore === '{') {
        e.preventDefault();
        const newValue = value.substring(0, cursorPos) + '{}}' + value.substring(cursorPos);
        onChange(newValue);

        const newCursorPos = cursorPos + 1; // between {{ and }}
        requestAnimationFrame(() => {
          input.selectionStart = input.selectionEnd = newCursorPos;
          checkForAutocomplete(newValue, newCursorPos);
        });
        return;
      }
    }

    // When autocomplete is open, handle navigation
    if (autocomplete) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setAutocomplete(prev => prev ? {
          ...prev,
          selectedIndex: (prev.selectedIndex + 1) % prev.variables.length
        } : null);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setAutocomplete(prev => prev ? {
          ...prev,
          selectedIndex: (prev.selectedIndex - 1 + prev.variables.length) % prev.variables.length
        } : null);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        completeVariable(autocomplete.variables[autocomplete.selectedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setAutocomplete(null);
        return;
      }
    }
  }, [autocomplete, value, onChange, checkForAutocomplete, completeVariable]);

  const handleTextareaKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Run autocomplete key handling first
    handleAutocompleteKeyDown(e);
    if (e.defaultPrevented) return;

    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      if (e.shiftKey) {
        // Shift+Tab: remove up to 2 leading spaces from the current line
        const beforeCursor = value.substring(0, start);
        const lineStart = beforeCursor.lastIndexOf('\n') + 1;
        const linePrefix = value.substring(lineStart, start);
        const spacesToRemove = linePrefix.startsWith('  ') ? 2 : linePrefix.startsWith(' ') ? 1 : 0;

        if (spacesToRemove > 0) {
          const newValue = value.substring(0, lineStart) + value.substring(lineStart + spacesToRemove);
          onChange(newValue);
          const newPos = start - spacesToRemove;
          requestAnimationFrame(() => {
            textarea.selectionStart = textarea.selectionEnd = newPos;
          });
        }
      } else {
        // Tab: insert 2 spaces at cursor
        const newValue = value.substring(0, start) + '  ' + value.substring(end);
        onChange(newValue);
        const newPos = start + 2;
        requestAnimationFrame(() => {
          textarea.selectionStart = textarea.selectionEnd = newPos;
        });
      }
    }
  }, [value, onChange, handleAutocompleteKeyDown]);

  const hasVariables = /\{\{\w+\}\}/.test(value);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    const cursorPos = e.target.selectionStart ?? newValue.length;
    // Use rAF so the DOM value is updated before we measure
    requestAnimationFrame(() => {
      checkForAutocomplete(newValue, cursorPos);
    });
  }, [onChange, checkForAutocomplete]);

  const handleInputClick = useCallback(() => {
    const input = inputRef.current;
    if (input) {
      const cursorPos = input.selectionStart ?? 0;
      checkForAutocomplete(value, cursorPos);
    }
  }, [value, checkForAutocomplete]);

  const commonProps = {
    ref: inputRef as any,
    value,
    onChange: handleInputChange,
    onClick: handleInputClick,
    onMouseMove: handleMouseMove,
    onMouseLeave: handleMouseLeave,
    placeholder,
    className,
    style: {
      ...style,
      backgroundColor: hasVariables ? '#1a2d2d' : style?.backgroundColor,
      borderLeft: hasVariables ? '3px solid #0d7377' : undefined,
      paddingLeft: hasVariables ? '0.7rem' : undefined
    }
  };

  return (
    <>
      {/* Hidden span for measuring text widths */}
      <span
        ref={measureRef}
        style={{
          position: 'absolute',
          visibility: 'hidden',
          whiteSpace: 'pre',
          pointerEvents: 'none'
        }}
      />

      {multiline ? (
        <textarea {...commonProps} onKeyDown={handleTextareaKeyDown} />
      ) : (
        <input type="text" {...commonProps} onKeyDown={handleAutocompleteKeyDown} />
      )}

      {tooltip && (
        <div
          onMouseEnter={handleTooltipMouseEnter}
          onMouseLeave={handleTooltipMouseLeave}
          style={{
            position: 'fixed',
            left: tooltip.x,
            top: tooltip.y,
            backgroundColor: '#0d7377',
            color: '#ffffff',
            padding: '0.5rem 0.6rem',
            borderRadius: '4px',
            fontSize: '0.85rem',
            fontFamily: 'monospace',
            zIndex: 10000,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
            transform: 'translate(-50%, calc(-100% - 8px))',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            maxWidth: '400px'
          }}
        >
          <span style={{
            flexShrink: 0,
            fontWeight: 600,
            opacity: 0.85,
            fontSize: '0.8rem'
          }}>
            {tooltip.varName}
          </span>
          <span style={{ flexShrink: 0, opacity: 0.6 }}>=</span>
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            placeholder={tooltip.isDefined ? undefined : 'Enter value...'}
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.25)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '3px',
              color: '#ffffff',
              padding: '0.2rem 0.4rem',
              fontSize: '0.8rem',
              fontFamily: 'monospace',
              minWidth: '120px',
              maxWidth: '240px',
              outline: 'none'
            }}
          />
          {onUpdateVariable && (
            <button
              onClick={handleUpdate}
              style={{
                flexShrink: 0,
                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '3px',
                color: '#ffffff',
                padding: '0.2rem 0.5rem',
                fontSize: '0.75rem',
                cursor: 'pointer',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.25)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
              }}
            >
              {tooltip.isDefined ? 'Update' : 'Create'}
            </button>
          )}
        </div>
      )}

      {autocomplete && (
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            left: autocomplete.position.x,
            top: autocomplete.position.y + 4,
            backgroundColor: '#1e1e2e',
            border: '1px solid #3a3a4a',
            borderRadius: '4px',
            zIndex: 10001,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
            maxHeight: '180px',
            overflowY: 'auto',
            minWidth: '180px',
            maxWidth: '320px',
            fontFamily: 'monospace',
            fontSize: '0.82rem'
          }}
        >
          {autocomplete.variables.map((varName, i) => (
            <div
              key={varName}
              onMouseEnter={() => setAutocomplete(prev => prev ? { ...prev, selectedIndex: i } : null)}
              onClick={() => completeVariable(varName)}
              style={{
                padding: '0.35rem 0.6rem',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '0.8rem',
                backgroundColor: i === autocomplete.selectedIndex ? '#0d7377' : 'transparent',
                color: i === autocomplete.selectedIndex ? '#ffffff' : '#cccccc'
              }}
            >
              <span style={{ fontWeight: 600 }}>{varName}</span>
              {environment && environment.variables[varName] !== undefined && (
                <span style={{
                  opacity: 0.6,
                  fontSize: '0.75rem',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '150px'
                }}>
                  {environment.variables[varName]}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
};