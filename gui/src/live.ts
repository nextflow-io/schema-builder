import type { ReactiveControllerHost } from "lit";
import { inputValue } from "./dom";
import { store } from "./store";

/**
 * Text fields that change the schema as you type.
 *
 * While a field has focus it shows exactly what was typed, and every keystroke commits the parsed value (trimmed,
 * split into a list, converted to a number, ...). All the keystrokes of one visit to a field are a single undo step.
 * Leaving the field commits once more, which also puts the cleaned-up value back into the field.
 */
export class LiveFields {
  /** The text typed into the fields that have focus, by field. */
  private readonly drafts = new Map<string, string>();

  /** `scope` names what the fields belong to. It must survive renames: use `store.keyOf`. */
  constructor(
    private readonly host: ReactiveControllerHost,
    private readonly scope: () => string,
  ) {}

  /** What a field shows: the text being typed into it, or else the committed value. */
  value(field: string, committed: string): string {
    return this.drafts.get(field) ?? committed;
  }

  /**
   * The `@input` and `@change` handlers of a field. `apply` parses the text and commits it, passing `edit` on to
   * `store.commit`. `done` is true when the field is being left.
   */
  on(field: string, apply: (text: string, edit: string, done: boolean) => void) {
    const edit = `${this.scope()}:${field}`;
    return {
      input: (event: Event): void => {
        // A number field reports "" while its text is not a number yet (e.g. "-"): wait for more
        if ((event.target as HTMLInputElement).validity?.badInput) return;
        const text = inputValue(event);
        this.drafts.set(field, text);
        apply(text, edit, false);
      },
      change: (event: Event): void => {
        this.drafts.delete(field);
        apply(inputValue(event), edit, true);
        store.endEdit();
        // Show the committed value, even if leaving the field did not change the schema
        this.host.requestUpdate();
      },
    };
  }
}
