// src/components/common/ErrorModal.jsx
import Modal from './Modal';
import './ErrorModal.css';

export default function ErrorModal({ open, onClose, errorCode, rawCode, message }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Error Occurred"
      size="content"
      footer={null}
    >
      <div className="error-modal-inner">
        <div className="error-modal-icon">!</div>
        <div className="error-modal-code">
          <span>Code:</span> {errorCode || 'UNKNOWN'}
        </div>
        {rawCode && (
          <div className="error-modal-raw-code">
            <span>Raw:</span> {rawCode}
          </div>
        )}
        <div className="error-modal-message">{message}</div>
        <div className="error-modal-footer">
          <button type="button" className="error-modal-close-btn" onClick={onClose}>
            Confirm
          </button>
        </div>
      </div>
    </Modal>
  );
}