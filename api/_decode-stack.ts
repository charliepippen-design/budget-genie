import { readFileSync } from 'node:fs';
import path from 'node:path';
import { SourceMapConsumer, type RawSourceMap } from 'source-map-js';

// Matches "(https://host/assets/Report-abc.js:1:2345)" and "at https://host/assets/x.js:1:2".
const FRAME = /((?:https?:\/\/[^\s()]+)?\/assets\/([\w.-]+\.js)):(\d+):(\d+)/g;

/**
 * Replaces minified frames with original source positions using maps stored as
 * `<mapDir>/<asset file name>.map`. Any failure leaves the raw stack untouched.
 */
export function decodeStack(stack: string, mapDir: string): string {
  try {
    const consumers = new Map<string, SourceMapConsumer | null>();
    const consumerFor = (file: string) => {
      if (!consumers.has(file)) {
        try {
          const raw = JSON.parse(readFileSync(path.join(mapDir, `${file}.map`), 'utf8')) as RawSourceMap;
          consumers.set(file, new SourceMapConsumer(raw));
        } catch {
          consumers.set(file, null);
        }
      }
      return consumers.get(file) ?? null;
    };

    return stack.replace(FRAME, (match, _url: string, file: string, line: string, col: string) => {
      try {
        const consumer = consumerFor(file);
        if (!consumer) return match;
        const pos = consumer.originalPositionFor({ line: Number(line), column: Number(col) - 1 });
        if (!pos.source) return match;
        return `${pos.source}:${pos.line}:${(pos.column ?? 0) + 1}${pos.name ? ` (${pos.name})` : ''} [${file}:${line}:${col}]`;
      } catch {
        return match;
      }
    });
  } catch {
    return stack;
  }
}
