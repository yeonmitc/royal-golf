import Icon from './Icons';
import './Button.css'; // 버튼 전용 CSS

export default function Button({
  children,
  className = '',
  variant = 'primary',
  size = 'md',
  icon,
  iconSize = 16,
  ...props
}) {
  const isIconOnly = icon && !children;
  const combinedClassName = `btn ${variant} ${size} ${isIconOnly ? 'icon-only' : ''} ${className}`;

  return (
    <button className={combinedClassName} {...props}>
      {icon && (typeof icon === 'string' ? <Icon name={icon} size={iconSize} /> : icon)}
      {children}
    </button>
  );
}
