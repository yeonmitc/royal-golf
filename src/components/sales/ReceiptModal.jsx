import { useEffect, useRef } from 'react';
import logo from '../../assets/logo.png';
import Button from '../common/Button';
import './ReceiptModal.css';

export default function ReceiptModal({ open, onClose, receiptData }) {
  const printRef = useRef(null);

  useEffect(() => {
    if (open && printRef.current) {
      // Focus or scroll to top if needed
    }
  }, [open]);

  if (!open || !receiptData) return null;

  const { id: _id, soldAt, items = [], guideId } = receiptData;
  const printableItems = (items || []).filter((item) => {
    const qty = Number(item?.qty || 0) || 0;
    const unit = Number(item?.price || 0) || 0;
    return qty > 0 && unit > 0;
  });
  const displayTotalAmount = printableItems.reduce(
    (sum, item) => sum + (Number(item?.price || 0) || 0) * (Number(item?.qty || 0) || 0),
    0
  );
  const displayTotalQty = printableItems.reduce((sum, item) => sum + (Number(item?.qty || 0) || 0), 0);

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    // Convert images to absolute URLs for the print window
    const contentHtml = printContent.innerHTML;
    // Basic replacement for src="/" to include origin, handling both double and single quotes
    const absoluteHtml = contentHtml
      .replace(/src="\//g, `src="${window.location.origin}/`)
      .replace(/src='\//g, `src='${window.location.origin}/`);

    const win = window.open('', '', 'width=400,height=600');
    win.document.write('<html><head><title>Receipt</title>');
    win.document.write('<style id="receipt-print-style">');
    win.document.write(`
      @media print {
        @page { size: 55mm 200mm; margin: 0; }
        html, body { margin: 0; padding: 0; }
      }
      body { margin: 0; padding: 0; font-family: monospace; font-size: 13px; color: #000; }
      .receipt-container { width: 55mm; margin: 0 auto; padding: 10px; box-sizing: border-box; }
      .receipt-logo { display: block; margin: 0 auto 5px auto; width: 80px; height: 90px; object-fit: contain; filter: grayscale(100%) brightness(0%); }
      .header { text-align: center; margin-bottom: 5px; }
      .title { font-size: 15px; font-weight: bold; margin-bottom: 0; }
      .info { font-size: 11px; margin-bottom: 0; }
      .divider { border-bottom: 1px dashed #000; margin: 4px 0; }
      .item-row { display: flex; justify-content: space-between; margin-bottom: 2px; }
      .item-name { flex: 1; overflow: hidden; padding-right: 4px; }
      .item-qty { width: 25px; text-align: right; }
      .item-price { width: 60px; text-align: right; }
      .total-row { display: flex; justify-content: space-between; font-weight: bold; margin-top: 4px; font-size: 15px; }
      .footer { text-align: center; margin-top: 8px; font-size: 11px; }
    `);
    win.document.write('</style></head><body>');
    win.document.write('<div class="receipt-container">');
    win.document.write(absoluteHtml);
    win.document.write('</div>');
    win.document.write('</body></html>');
    win.document.close();
    win.focus();

    const pxToMm = (px) => (Number(px || 0) * 25.4) / 96;
    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
    const updatePageHeight = () => {
      const styleEl = win.document.getElementById('receipt-print-style');
      const container = win.document.querySelector('.receipt-container');
      if (!styleEl || !container) return;
      const px = container.scrollHeight || container.offsetHeight || 0;
      const mmRaw = pxToMm(px) + 2;
      const mm = Math.ceil(clamp(mmRaw, 60, 2000));
      styleEl.textContent = `
        @media print {
          @page { size: 55mm ${mm}mm; margin: 0; }
          html, body { margin: 0; padding: 0; }
        }
        body { margin: 0; padding: 0; font-family: monospace; font-size: 13px; color: #000; }
        .receipt-container { width: 55mm; margin: 0 auto; padding: 10px; box-sizing: border-box; }
        .receipt-logo { display: block; margin: 0 auto 5px auto; width: 80px; height: 90px; object-fit: contain; filter: grayscale(100%) brightness(0%); }
        .header { text-align: center; margin-bottom: 5px; }
        .title { font-size: 15px; font-weight: bold; margin-bottom: 0; }
        .info { font-size: 11px; margin-bottom: 0; }
        .divider { border-bottom: 1px dashed #000; margin: 4px 0; }
        .item-row { display: flex; justify-content: space-between; margin-bottom: 2px; }
        .item-name { flex: 1; overflow: hidden; padding-right: 4px; }
        .item-qty { width: 25px; text-align: right; }
        .item-price { width: 60px; text-align: right; }
        .total-row { display: flex; justify-content: space-between; font-weight: bold; margin-top: 4px; font-size: 15px; }
        .footer { text-align: center; margin-top: 8px; font-size: 11px; }
      `;
    };

    // Allow time for images/layout to settle in the new window
    setTimeout(() => {
      try {
        updatePageHeight();
      } catch {
        void 0;
      }
      win.print();
      win.close();
    }, 650);
  };

  const formattedDate = new Date(soldAt).toLocaleString('en-PH', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="receipt-modal-overlay" onClick={onClose}>
      <div className="receipt-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="receipt-preview" ref={printRef}>
          <div className="header">
            <img
              src={logo}
              alt="Hole No.0"
              className="receipt-logo"
              style={{ filter: 'grayscale(100%) brightness(0%)' }}
            />
            <div className="title">Hole No.0 royal golf proshop</div>
            <div className="info">+63 917-129-5567 </div>
            <div className="info">Date: {formattedDate}</div>
            {guideId && <div className="info">Guide: {guideId.slice(0, 8)}</div>}
          </div>

          <div className="divider" />

          <div className="items">
            {printableItems.map((item, idx) => (
              <div key={idx} className="item-row">
                <div className="item-name">
                  <div>{String(item.code || '').trim()}</div>
                  <div style={{ fontSize: '11px', color: '#555' }}>
                    {item.color ? `${item.color} / ` : ''}
                    {item.size}
                  </div>
                </div>
                <div className="item-qty">{item.qty}</div>
                <div className="item-price">{(item.price * item.qty).toLocaleString()}</div>
              </div>
            ))}
          </div>

          <div className="divider" />

          <div className="total-row">
            <span>TOTAL</span>
            <span>{Number(displayTotalAmount || 0).toLocaleString()}</span>
          </div>
          <div className="info" style={{ textAlign: 'right', marginTop: '0' }}>
            Items: {displayTotalQty || 0}
          </div>

          <div className="footer">
            <div style={{ marginBottom: '8px' }}>Thank you for shopping!</div>
            <div
              style={{ fontSize: '10px', textAlign: 'center', lineHeight: '1.2', color: '#000' }}
            >
              <div>교환 및 환불: 구매일로부터 7일 이내 (영수증 지참 시)</div>
              <div>상품 상태: 택이 부착된 미사용 신품에 한해 가능</div>
              <div style={{ marginTop: '4px' }}>
                Exchange/Refund: Within 7 days from the date of purchase (Receipt required)
              </div>
              <div>Item Condition: Only available for unused items with original tags attached</div>
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" onClick={handlePrint}>
            Print Receipt
          </Button>
        </div>
      </div>
    </div>
  );
}
