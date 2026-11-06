/** Label, control and error, consistently. */
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
  return (
    <div className={`fld ${error ? "has-error" : ""}`}>
      <label htmlFor={name}>{label}</label>
      {children}
      {hint && !error && <span className="fld-hint">{hint}</span>}
      {error && (
        <span className="fld-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
