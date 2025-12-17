// src/components/common/Button.jsx

import './Button.css'; // 버튼 전용 CSS

export default function Button({
  children,
  className = '',
  variant = 'primary',
  size = 'md',
  ...props
}) {
  return (
    <button className={`btn ${variant} ${size} ${className}`} {...props}>
      {children}
    </button>
  );
}
