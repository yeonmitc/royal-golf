import { motion as Motion } from 'framer-motion';

export default function FadeIn({ children, delay = 0, className }) {
  return (
    <Motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut', delay }}
      className={className}
    >
      {children}
    </Motion.div>
  );
}
