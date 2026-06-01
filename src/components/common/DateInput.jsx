import { forwardRef, useImperativeHandle, useRef } from 'react';
import { CalendarIcon } from './Icons';

const DateInput = forwardRef(function DateInput(
  {
    className = '',
    wrapperClassName = '',
    style,
    disabled = false,
    readOnly = false,
    onClick,
    onFocus,
    ...props
  },
  ref
) {
  const inputRef = useRef(null);

  useImperativeHandle(ref, () => inputRef.current);

  const openPicker = () => {
    if (disabled || readOnly) return;
    const el = inputRef.current;
    if (!el) return;
    try {
      el.showPicker?.();
    } catch {
      void 0;
    }
    el.focus();
  };

  const handleClick = (e) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    openPicker();
  };

  const handleFocus = (e) => {
    onFocus?.(e);
  };

  return (
    <div className={`date-input-shell ${wrapperClassName}`.trim()}>
      <input
        {...props}
        ref={inputRef}
        type="date"
        className={`input-field date-control-input date-input-control ${className}`.trim()}
        style={style}
        disabled={disabled}
        readOnly={readOnly}
        onClick={handleClick}
        onFocus={handleFocus}
      />
      <button
        type="button"
        className="date-input-trigger"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openPicker();
        }}
        disabled={disabled}
        tabIndex={-1}
        aria-label="Open calendar"
      >
        <CalendarIcon size={18} strokeWidth={2.1} color="currentColor" />
      </button>
    </div>
  );
});

export default DateInput;
