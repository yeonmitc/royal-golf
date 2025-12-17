// src/components/common/Input.jsx
import './Input.css';

export default function Input({ label, hint, error, className = '', ...props }) {
  return (
    <div className={`input-wrapper ${className}`}>
      {label && <label className="input-label">{label}</label>}

      <input className={`input-field ${error ? 'input-field-error' : ''}`} {...props} />

      {hint && !error && <div className="input-hint">{hint}</div>}
      {error && <div className="input-error">{error}</div>}
    </div>
  );
}
