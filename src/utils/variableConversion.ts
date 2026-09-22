import { EnvironmentVariable, KeyValuePair } from '../types';

/**
 * Converts a saved variablesArray/variables pair (Environment or Collection
 * shape) into the row format KeyValueEditor edits. Prefers variablesArray
 * (secret-aware); falls back to the legacy flat `variables` map; falls back
 * to one empty row if there's nothing yet.
 */
export function toKeyValuePairs(
  variablesArray: EnvironmentVariable[] | undefined,
  variables: Record<string, string> | undefined,
): KeyValuePair[] {
  if (variablesArray && variablesArray.length > 0) {
    return variablesArray.map(v => ({ key: v.key, value: v.value, enabled: true, isSecret: v.isSecret }));
  }
  if (variables && Object.keys(variables).length > 0) {
    return Object.entries(variables).map(([key, value]) => ({ key, value, enabled: true, isSecret: false }));
  }
  return [{ key: '', value: '', enabled: true, isSecret: false }];
}

/**
 * Converts KeyValueEditor's row format back into a variablesArray/variables
 * pair for saving, dropping any row with an empty key.
 */
export function fromKeyValuePairs(data: KeyValuePair[]): { variablesArray: EnvironmentVariable[]; variables: Record<string, string> } {
  const variablesArray: EnvironmentVariable[] = data
    .filter(item => item.key.trim() !== '')
    .map(item => ({ key: item.key, value: item.value, isSecret: item.isSecret || false }));

  const variables: Record<string, string> = {};
  variablesArray.forEach(v => { variables[v.key] = v.value; });

  return { variablesArray, variables };
}
