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
  const isHoveringTooltipRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
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

  const handleTextareaKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
  }, [value, onChange]);

  const hasVariables = /\{\{\w+\}\}/.test(value);

  const commonProps = {
    ref: inputRef as any,
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
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
        <input type="text" {...commonProps} />
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
    </>
  );
};