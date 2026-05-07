import React from 'react';
import { SearchOptions } from '../components/SearchBar';

export interface HighlightMatch {
  index: number;
  length: number;
  text: string;
}

export function findMatches(text: string, searchTerm: string, options: SearchOptions): HighlightMatch[] {
  if (!searchTerm.trim() || !text) return [];

  const matches: HighlightMatch[] = [];

  try {
    if (options.useRegex) {
      // Handle regex search
      const flags = options.caseSensitive ? 'g' : 'gi';
      const regex = new RegExp(searchTerm, flags);
      let match;
      while ((match = regex.exec(text)) !== null) {
        matches.push({
          index: match.index,
          length: match[0].length,
          text: match[0]
        });
        // Prevent infinite loop with zero-length matches
        if (match[0].length === 0) {
          regex.lastIndex++;
        }
      }
    } else if (options.wholeWords) {
      // Handle whole words search
      const regex = new RegExp(`\\b${escapeRegExp(searchTerm)}\\b`, options.caseSensitive ? 'g' : 'gi');
      let match;
      while ((match = regex.exec(text)) !== null) {
        matches.push({
          index: match.index,
          length: match[0].length,
          text: match[0]
        });
      }
    } else {
      // Handle simple text search
      let searchText = text;
      let originalSearchTerm = searchTerm;

      // Handle case sensitivity
      if (!options.caseSensitive) {
        searchText = text.toLowerCase();
        originalSearchTerm = searchTerm.toLowerCase();
      }

      let startIndex = 0;
      let index = searchText.indexOf(originalSearchTerm, startIndex);

      while (index !== -1) {
        matches.push({
          index,
          length: originalSearchTerm.length,
          text: text.substring(index, index + originalSearchTerm.length)
        });
        startIndex = index + 1;
        index = searchText.indexOf(originalSearchTerm, startIndex);
      }
    }
  } catch (error) {
    // Invalid regex pattern - fall back to simple text search
    console.warn('Invalid regex pattern, falling back to text search:', error);
    const searchText = options.caseSensitive ? text : text.toLowerCase();
    const termToFind = options.caseSensitive ? searchTerm : searchTerm.toLowerCase();

    let startIndex = 0;
    let index = searchText.indexOf(termToFind, startIndex);

    while (index !== -1) {
      matches.push({
        index,
        length: termToFind.length,
        text: text.substring(index, index + termToFind.length)
      });
      startIndex = index + 1;
      index = searchText.indexOf(termToFind, startIndex);
    }
  }

  return matches;
}

export function highlightText(
  text: string,
  matches: HighlightMatch[],
  matchOffset: number = 0,
  activeMatchIndex: number = -1
): React.ReactNode[] {
  if (matches.length === 0) return [text];

  const result: React.ReactNode[] = [];
  let lastIndex = 0;

  // Sort matches by index to ensure proper order
  const sortedMatches = [...matches].sort((a, b) => a.index - b.index);

  sortedMatches.forEach((match, i) => {
    // Add text before the match
    if (match.index > lastIndex) {
      result.push(text.substring(lastIndex, match.index));
    }

    const globalIndex = matchOffset + i;
    const isActive = globalIndex === activeMatchIndex;

    // Add the highlighted match
    result.push(
      React.createElement('mark', {
        key: `match-${i}`,
        id: isActive ? 'search-match-active' : undefined,
        style: {
          backgroundColor: isActive ? '#f97316' : '#f59e0b',
          color: '#000',
          padding: '0 1px',
          borderRadius: '2px',
          outline: isActive ? '2px solid #fff' : undefined,
        }
      }, match.text)
    );

    lastIndex = match.index + match.length;
  });

  // Add remaining text after the last match
  if (lastIndex < text.length) {
    result.push(text.substring(lastIndex));
  }

  return result;
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Function to search within structured data (for headers, form data, etc.)
export function searchInKeyValuePairs(
  pairs: Array<{key: string, value: string}>,
  searchTerm: string,
  options: SearchOptions
): { matches: HighlightMatch[], keys: string[], values: string[] } {
  const keyMatches: string[] = [];
  const valueMatches: string[] = [];
  let allMatches: HighlightMatch[] = [];

  pairs.forEach((pair, pairIndex) => {
    // Search in keys
    const keySearchMatches = findMatches(pair.key, searchTerm, options);
    if (keySearchMatches.length > 0) {
      keyMatches[pairIndex] = pair.key;
      allMatches = [...allMatches, ...keySearchMatches];
    }

    // Search in values
    const valueSearchMatches = findMatches(pair.value, searchTerm, options);
    if (valueSearchMatches.length > 0) {
      valueMatches[pairIndex] = pair.value;
      allMatches = [...allMatches, ...valueSearchMatches];
    }
  });

  return { matches: allMatches, keys: keyMatches, values: valueMatches };
}