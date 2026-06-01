// src/components/common/Input.jsx
import DateInput from './DateInput';
import './Input.css';

export default function Input({ label, hint, error, className = '', containerStyle, ...props }) {
  const isDateInput = props.type === 'date';

  return (
    <div className={`input-wrapper ${className}`} style={containerStyle}>
      {label && <label className="input-label">{label}</label>}

      {isDateInput ? (
        <DateInput className={error ? 'input-field-error' : ''} {...props} />
      ) : (
        <input className={`input-field ${error ? 'input-field-error' : ''}`} {...props} />
      )}

      {hint && !error && <div className="input-hint">{hint}</div>}
      {error && <div className="input-error">{error}</div>}
    </div>
  );
}
