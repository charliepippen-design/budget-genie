import { useCallback, useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

export interface GridNavCellElement extends HTMLElement {
  dataset: {
    plCell?: string;
    plRow?: string;
    plCol?: string;
  };
}

export interface GridNavCell {
  row: number;
  col: number;
  element: GridNavCellElement;
}

const NAV_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);

function sortCells(cells: GridNavCell[]): GridNavCell[] {
  return cells.sort((a, b) => {
    if (a.row !== b.row) return a.row - b.row;
    return a.col - b.col;
  });
}

function focusCell(cell: GridNavCell) {
  requestAnimationFrame(() => {
    cell.element.focus();
    if (cell.element instanceof HTMLInputElement) {
      cell.element.select();
    }
  });
}

export function usePlGridNavigation() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const getCells = useCallback((): GridNavCell[] => {
    if (!containerRef.current) return [];

    const nodes = containerRef.current.querySelectorAll<HTMLElement>('[data-pl-cell="true"]');

    return sortCells(
      Array.from(nodes)
        .map((node) => {
          const element = node as GridNavCellElement;
          const row = Number(element.dataset.plRow);
          const col = Number(element.dataset.plCol);

          if (!Number.isFinite(row) || !Number.isFinite(col)) return null;

          return { row, col, element };
        })
        .filter((cell): cell is GridNavCell => cell !== null)
    );
  }, []);

  const handleGridKeyDownCapture = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (!NAV_KEYS.has(event.key)) return;

      const target = event.target as GridNavCellElement | null;
      if (!target || target.dataset.plCell !== 'true') return;

      const currentRow = Number(target.dataset.plRow);
      const currentCol = Number(target.dataset.plCol);
      if (!Number.isFinite(currentRow) || !Number.isFinite(currentCol)) return;

      const cells = getCells();
      if (cells.length === 0) return;

      event.preventDefault();
      event.stopPropagation();

      if (event.key === 'Tab') {
        const currentIndex = cells.findIndex(
          (cell) => cell.row === currentRow && cell.col === currentCol
        );
        if (currentIndex < 0) return;

        const direction = event.shiftKey ? -1 : 1;
        const nextIndex = (currentIndex + direction + cells.length) % cells.length;
        focusCell(cells[nextIndex]);
        return;
      }

      let candidate: GridNavCell | undefined;

      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const horizontal = cells
          .filter((cell) => cell.row === currentRow)
          .sort((a, b) => a.col - b.col);

        if (event.key === 'ArrowLeft') {
          candidate = horizontal
            .filter((cell) => cell.col < currentCol)
            .sort((a, b) => b.col - a.col)[0];
        } else {
          candidate = horizontal
            .filter((cell) => cell.col > currentCol)
            .sort((a, b) => a.col - b.col)[0];
        }
      }

      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        const vertical = cells
          .filter((cell) => cell.col === currentCol)
          .sort((a, b) => a.row - b.row);

        if (event.key === 'ArrowUp') {
          candidate = vertical
            .filter((cell) => cell.row < currentRow)
            .sort((a, b) => b.row - a.row)[0];
        } else {
          candidate = vertical
            .filter((cell) => cell.row > currentRow)
            .sort((a, b) => a.row - b.row)[0];
        }
      }

      if (candidate) {
        focusCell(candidate);
      }
    },
    [getCells]
  );

  return {
    containerRef,
    handleGridKeyDownCapture,
  };
}
