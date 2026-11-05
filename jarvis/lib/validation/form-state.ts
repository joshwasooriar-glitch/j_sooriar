/** What a server action returns to its form: field errors, or a form-level message. */
export interface FormState {
  errors?: Record<string, string>;
  message?: string;
}

export const DEMO_STATE: FormState = {
  message: "Demo data: connect Supabase in .env.local to create and edit. Nothing was saved.",
};
