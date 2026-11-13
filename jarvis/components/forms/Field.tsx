import { cloneElement, isValidElement, type ReactElement } from "react";

/**
 * Label, control and error, consistently. When there is an error, the control
 * is marked aria-invalid and points at the error text with aria-describedby,
 * so the message belongs to its field and not just to the page.
 */
export function Field({
  label,
  name,
  error,
  hint,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const errorId = `${name}-error`;
  const control =
    error && isValidElement(children)
      ? cloneElement(children as ReactElement<Record<string, unknown>>, { "aria-invalid": true, "aria-describedby": errorId })
      : children;
  return (
    <div className={`fld ${error ? "has-error" : ""}`}>
      <label htmlFor={name}>{label}</label>
      {control}
      {hint && !error && <span className="fld-hint">{hint}</span>}
      {error && (
        <span className="fld-error" id={errorId} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
