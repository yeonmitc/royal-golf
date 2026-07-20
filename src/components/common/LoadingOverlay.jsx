import { motion } from 'framer-motion';

export default function LoadingOverlay({ visible = false }) {
  if (!visible) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(5, 5, 8, 0.7)',
        backdropFilter: 'blur(4px)',
        zIndex: 'var(--z-modal, 300)',
      }}
    >
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          border: '3px solid var(--border-soft, #262637)',
          borderTopColor: 'var(--gold-soft, #f3d47a)',
        }}
      />
    </motion.div>
  );
}