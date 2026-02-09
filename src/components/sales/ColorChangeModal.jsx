import { useState } from 'react';
import codePartsSeed from '../../db/seed/seed-code-parts.json';
import Button from '../common/Button';
import Modal from '../common/Modal';

export default function ColorChangeModal({ isOpen, onClose, saleItem, onSave }) {
  const [selectedColor, setSelectedColor] = useState(saleItem?.color || '');

  const colors = codePartsSeed.color || [];

  const handleSave = () => {
    onSave(selectedColor);
    onClose();
  };

  return (
    <Modal open={isOpen} onClose={onClose} title="Change Color" size="lg">
      <div className="p-4 flex flex-col gap-4">
        <div className="text-sm text-gray-400">
          Select a new color for <span className="text-white font-bold">{saleItem?.code}</span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(6, 1fr)',
            gap: '8px',
            maxHeight: '400px',
            overflowY: 'auto',
            paddingRight: '8px',
          }}
        >
          {colors.map((c) => {
            const isSelected = selectedColor === c.label;
            return (
              <label
                key={c.code}
                className="cursor-pointer transition-all"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '12px',
                  borderRadius: '8px',
                  border: isSelected ? '2px solid var(--gold)' : '1px solid #333',
                  backgroundColor: isSelected ? 'var(--gold)' : '#000',
                  color: isSelected ? '#000' : '#fff',
                  fontWeight: isSelected ? 'bold' : 'normal',
                }}
              >
                <input
                  type="radio"
                  name="color"
                  value={c.label}
                  checked={isSelected}
                  onChange={() => setSelectedColor(c.label)}
                  className="hidden"
                />
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    border: '1px solid rgba(0,0,0,0.2)',
                    marginBottom: '8px',
                    backgroundColor:
                      c.label === 'Black'
                        ? '#000'
                        : c.label === 'White'
                          ? '#fff'
                          : c.label === 'Red'
                            ? '#ef4444'
                            : c.label === 'Blue'
                              ? '#3b82f6'
                              : c.label === 'Green'
                                ? '#22c55e'
                                : c.label === 'Yellow'
                                  ? '#eab308'
                                  : c.label === 'Pink'
                                    ? '#ec4899'
                                    : c.label === 'Purple'
                                      ? '#a855f7'
                                      : c.label === 'Gray'
                                        ? '#6b7280'
                                        : c.label === 'Beige'
                                          ? '#d4d4d8'
                                          : c.label === 'Brown'
                                            ? '#78350f'
                                            : c.label === 'DarkBrown'
                                              ? '#451a03'
                                              : c.label === 'Gold'
                                                ? '#ffd700'
                                                : c.label === 'Ivory'
                                                  ? '#fffff0'
                                                  : c.label === 'Navy'
                                                    ? '#1e3a8a'
                                                    : c.label === 'Orange'
                                                      ? '#f97316'
                                                      : c.label === 'Silver'
                                                        ? '#c0c0c0'
                                                        : c.label === 'SkyBlue'
                                                          ? '#0ea5e9'
                                                          : c.label === 'Wine'
                                                            ? '#881337'
                                                            : c.label === 'Khaki'
                                                              ? '#57534e'
                                                              : c.label === 'Mint'
                                                                ? '#34d399'
                                                                : c.label === 'Lavender'
                                                                  ? '#e9d5ff'
                                                                  : 'transparent',
                  }}
                />
                <span style={{ fontSize: '12px' }}>{c.label}</span>
              </label>
            );
          })}
        </div>

        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}
