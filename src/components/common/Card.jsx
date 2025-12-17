export default function Card({ title, subtitle, actions, children, className = '' }) {
  return (
    <section className={`page-card ${className}`}>
      {(title || subtitle || actions) && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 12,
          }}
        >
          <div>
            {title && (
              <div
                style={{
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--gold-soft)',
                }}
              >
                {title}
              </div>
            )}
            {subtitle && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{subtitle}</div>
            )}
          </div>
          {actions && <div style={{ display: 'flex', gap: 8 }}>{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
