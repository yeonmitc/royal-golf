// src/components/common/Spinner.jsx

export default function Spinner({ size = 20 }) {
  return (
    <div
      className="inline-block animate-spin rounded-full border-2 border-[#303045] border-t-[var(--gold-soft)]"
      style={{ width: size, height: size }}
      aria-label="Loading"
    />
  );
}
