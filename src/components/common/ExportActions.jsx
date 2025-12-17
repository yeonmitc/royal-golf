import Button from './Button';
import { exportToCsv } from '../../utils/csvExport';

async function ensureGapiLoaded() {
  if (window.gapi && window.gapi.load) return true;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://apis.google.com/js/api.js';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('SCRIPT_LOAD_ERROR'));
    document.head.appendChild(s);
  }).catch(() => {});
  return !!(window.gapi && window.gapi.load);
}

async function initGapi() {
  const apiKey = import.meta.env.VITE_GOOGLE_API_KEY;
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!apiKey || !clientId) {
    throw new Error('GOOGLE_CONFIG_MISSING');
  }
  await new Promise((resolve, reject) => {
    window.gapi.load('client:auth2', async () => {
      try {
        await window.gapi.client.init({
          apiKey,
          clientId,
          discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
          scope: 'https://www.googleapis.com/auth/drive.file',
        });
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  });
}

function rowsToCsvString(columns, rows) {
  const headers = columns.map((c) => c.header ?? c.key);
  const data = rows.map((r) => columns.map((c) => r[c.key]));
  const all = [headers, ...data];
  return all.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
}

export default function ExportActions({
  columns = [],
  rows = [],
  filename = 'data.csv',
  gdriveName,
  showDrive = true,
}) {
  const hasRows = Array.isArray(rows) && rows.length > 0;
  const canDrive = !!(import.meta.env.VITE_GOOGLE_API_KEY && import.meta.env.VITE_GOOGLE_CLIENT_ID);

  async function handleCsv() {
    if (!hasRows) return;
    const headers = columns.map((c) => c.header ?? c.key);
    const data = rows.map((r) => columns.map((c) => r[c.key]));
    exportToCsv(filename, [headers, ...data]);
  }

  async function handleDriveUpload() {
    if (!hasRows) return;
    try {
      const ok = await ensureGapiLoaded();
      if (!ok) throw new Error('GAPI_LOAD_FAILED');
      await initGapi();
      const auth = window.gapi.auth2.getAuthInstance();
      if (!auth.isSignedIn.get()) {
        await auth.signIn();
      }
      const csvStr = rowsToCsvString(columns, rows);
      const metadata = {
        name: gdriveName || filename,
        mimeType: 'text/csv',
      };
      const boundary = '-------3141592653589793';
      const delimiter = '\r\n--' + boundary + '\r\n';
      const closeDelimiter = '\r\n--' + boundary + '--';
      const multipartRequestBody =
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: text/csv\r\n\r\n' +
        csvStr +
        closeDelimiter;
      await window.gapi.client.request({
        path: '/upload/drive/v3/files',
        method: 'POST',
        params: { uploadType: 'multipart' },
        headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
        body: multipartRequestBody,
      });
      alert('Uploaded to Google Drive.');
    } catch {
      alert('Google Drive upload unavailable.');
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={handleCsv} aria-label="Download CSV" title="Download CSV" disabled={!hasRows}>
        ⤓
      </Button>
      {showDrive && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleDriveUpload}
          aria-label="Upload to Google Drive"
          title="Upload to Google Drive"
          disabled={!hasRows || !canDrive}
        >
          ⛅
        </Button>
      )}
    </>
  );
}
