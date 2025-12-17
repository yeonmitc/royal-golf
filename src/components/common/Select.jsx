// src/components/common/Select.jsx
import './Input.css';

export default function Select({ label, hint, error, className = '', children, ...props }) {
  return (
    <div className="space-y-1">
      {label && <label className="input-label">{label}</label>}
      <div className="relative">
        <select
          className={`w-full rounded-full border border-[#32324a] bg-[#141420] px-3 py-1.5 text-sm text-[var(--text-main)] pr-8 focus:outline-none focus:border-[var(--gold-soft)] focus:ring-1 focus:ring-[var(--gold-soft)] ${className}`}
          style={{
            appearance: 'none',
            WebkitAppearance: 'none',
            MozAppearance: 'none',
            backgroundImage: 'none',
          }}
          {...props}
        >
          {children}
        </select>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[var(--text-muted)]">
          ▼
        </span>
      </div>
      {hint && !error && <div className="text-[10px] text-[var(--text-muted)]">{hint}</div>}
      {error && <div className="text-[10px] text-red-400">{error}</div>}
    </div>
  );
}
