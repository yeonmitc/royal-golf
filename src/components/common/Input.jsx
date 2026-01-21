// src/components/common/Input.jsx
import './Input.css';

export default function Input({ label, hint, error, className = '', containerStyle, ...props }) {
  return (
    <div className={`input-wrapper ${className}`} style={containerStyle}>
      {label && <label className="input-label">{label}</label>}

      <input className={`input-field ${error ? 'input-field-error' : ''}`} {...props} />

      {hint && !error && <div className="input-hint">{hint}</div>}
      {error && <div className="input-error">{error}</div>}
    </div>
  );
}
