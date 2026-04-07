import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Sanitize channel names to prevent XSS and enforce constraints
 * - Strips leading/trailing whitespace
 * - Removes HTML tags
 * - Enforces max length of 100 characters
 * - Returns null if name becomes empty after sanitization
 */
export function sanitizeChannelName(name: string): string | null {
  if (!name || typeof name !== 'string') return null;

  // Strip leading/trailing whitespace
  let sanitized = name.trim();

  // Remove HTML tags to prevent XSS
  sanitized = sanitized.replace(/<[^>]*>/g, '');

  // Enforce max length
  sanitized = sanitized.substring(0, 100);

  // Return null if empty after sanitization
  return sanitized.length > 0 ? sanitized : null;
}
