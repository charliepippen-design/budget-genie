import { useMemo, useState } from 'react';

export type SortDirection = 'asc' | 'desc';

function parseLooseNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const normalized = String(value).replace(/[^0-9.-]+/g, '');
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function useSortableTable<T, K extends string>(
  rows: T[],
  getRawValue: (row: T, key: K) => string | number | null | undefined,
  initialKey?: K,
  initialDirection: SortDirection = 'desc'
) {
  const [sortKey, setSortKey] = useState<K>((initialKey ?? ('roas' as K)) as K);
  const [sortDirection, setSortDirection] = useState<SortDirection>(initialDirection);

  const toggleSort = (key: K) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDirection('desc');
  };

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const aVal = parseLooseNumber(getRawValue(a, sortKey));
      const bVal = parseLooseNumber(getRawValue(b, sortKey));
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });
    return copy;
  }, [rows, sortKey, sortDirection, getRawValue]);

  return { sortedRows, sortKey, sortDirection, toggleSort };
}
