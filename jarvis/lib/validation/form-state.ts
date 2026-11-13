/** What a server action returns to its form: field errors, or a form-level message. */
export interface FormState {
  errors?: Record<string, string>;
  message?: string;
  /**
   * What was submitted, as typed, returned with errors so the form can show it
   * again. React resets a form after its action runs, so without this every
   * field clears on a validation error.
   */
  values?: Record<string, string>;
}

export const DEMO_STATE: FormState = {
  message: "Demo data: connect Supabase in .env.local to create and edit. Nothing was saved.",
};
