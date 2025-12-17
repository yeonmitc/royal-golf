export default function FormSection({ title, description, columns = 3, children, footer, className = '' }) {
  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    gap: '12px',
    alignItems: 'start',
  };
  return (
    <div className={`space-y-3 ${className}`}>
      {(title || description) && (
        <div>
          {title && <div className="font-semibold text-sm text-[var(--gold-soft)]">{title}</div>}
          {description && <div className="text-[12px] text-[var(--text-muted)]">{description}</div>}
        </div>
      )}
      <div className="form-grid" style={gridStyle}>{children}</div>
      {footer && <div className="flex justify-end gap-2 pt-2">{footer}</div>
      }
    </div>
  );
}
