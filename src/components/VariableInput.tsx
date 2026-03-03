import React, { useState, useRef, useEffect } from 'react';
import { Environment } from '../types';

interface VariableInputProps {
  value: string;
  onChange: (value: string) => void;
  environment: Environment | null;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  multiline?: boolean;
}

export const VariableInput: React.FC<VariableInputProps> = ({
  value,
  onChange,
  environment,
  placeholder,
  className,
  style,
  multiline = false
}) => {
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!environment || !inputRef.current) {
      setTooltip(null);
      return;
    }

    const rect = inputRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;

    // Find variables in the text
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

    // Check if mouse is over a variable
    // This is approximate - for precise positioning we'd need to measure text
    const charWidth = 8; // Approximate character width
    const mouseCharPos = Math.floor(mouseX / charWidth);

    for (const variable of variables) {
      if (mouseCharPos >= variable.start && mouseCharPos <= variable.end) {
        const varValue = environment.variables[variable.name];
        if (varValue !== undefined) {
          setTooltip({
            text: `${variable.name} = ${varValue}`,
            x: e.clientX,
            y: e.clientY - 40
          });
          return;
        } else {
          setTooltip({
            text: `${variable.name} = (not defined)`,
            x: e.clientX,
            y: e.clientY - 40
          });
          return;
        }
      }
    }

    setTooltip(null);
  };

  const handleMouseLeave = () => {
    setTooltip(null);
  };

  const highlightVariables = (text: string): string => {
    // This creates a visual hint that variables are present
    return text.replace(/\{\{(\w+)\}\}/g, '{{$1}}');
  };

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
      {multiline ? (
        <textarea {...commonProps} />
      ) : (
        <input type="text" {...commonProps} />
      )}

      {tooltip && (
        <div style={{
          position: 'fixed',
          left: tooltip.x,
          top: tooltip.y,
          backgroundColor: '#0d7377',
          color: '#ffffff',
          padding: '0.5rem 0.75rem',
          borderRadius: '4px',
          fontSize: '0.85rem',
          fontFamily: 'monospace',
          zIndex: 10000,
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
          transform: 'translateX(-50%)'
        }}>
          {tooltip.text}
        </div>
      )}
    </>
  );
};