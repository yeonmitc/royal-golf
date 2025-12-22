import { useEffect, useRef } from 'react';
import Button from './Button';

export default function BarChart({ data = [], title, height = 240, onDownloadImage }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    const width = c.width;
    const h = c.height;
    ctx.clearRect(0, 0, width, h);
    const padding = 32;
    const innerW = width - padding * 2;
    const innerH = h - padding * 2;
    const labels = data.map((d) => String(d.key));
    const values = data.map((d) => Number(d.amount || d.revenue || 0) || 0);
    const maxVal = Math.max(1, ...values);
    const barW = values.length > 0 ? Math.max(6, Math.floor(innerW / values.length) - 8) : 0;
    ctx.fillStyle = '#d4af37';
    values.forEach((v, i) => {
      const x = padding + i * (barW + 8);
      const barH = Math.round((v / maxVal) * innerH);
      const y = padding + innerH - barH;
      ctx.fillRect(x, y, barW, barH);
    });
    ctx.fillStyle = '#888';
    ctx.font = '12px sans-serif';
    labels.forEach((lb, i) => {
      const x = padding + i * (barW + 8) + barW / 2;
      ctx.save();
      ctx.translate(x, h - 6);
      ctx.rotate(-Math.PI / 4);
      ctx.textAlign = 'right';
      ctx.fillText(lb, 0, 0);
      ctx.restore();
    });
  }, [data]);

  function downloadImage() {
    const c = canvasRef.current;
    if (!c) return;
    const link = document.createElement('a');
    link.download = `${title || 'chart'}.png`;
    link.href = c.toDataURL('image/png');
    link.click();
    onDownloadImage?.();
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="outline" size="sm" onClick={downloadImage} aria-label="Download image" title="Download image">
          🖼
        </Button>
      </div>
      <canvas ref={canvasRef} width={720} height={height} />
    </div>
  );
}
