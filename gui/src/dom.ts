/** Small helpers for working with form elements and errors. */

export const inputValue = (event: Event): string => (event.target as HTMLInputElement).value;

export const isTextField = (element: unknown): element is HTMLElement =>
  element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement;

export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Whether every word of a search query occurs in the (lower-case) text. */
export function matchesQuery(text: string, query: string): boolean {
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((word) => text.includes(word));
}
