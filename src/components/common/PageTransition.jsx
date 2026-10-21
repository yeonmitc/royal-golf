import { motion as Motion } from 'framer-motion';

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

export default function PageTransition({ children, className }) {
  return (
    <Motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      variants={pageVariants}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </Motion.div>
  );
}
