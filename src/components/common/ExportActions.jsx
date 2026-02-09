import { useToast } from '../../context/ToastContext';
import { exportToTsv } from '../../utils/csvExport';
import Button from './Button';

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

function rowsToTsvString(columns, rows) {
  const headers = columns.map((c) => c.header ?? c.key);
  const data = rows.map((r) => columns.map((c) => r[c.key]));
  const all = [headers, ...data];
  return all
    .map((row) => row.map((cell) => String(cell ?? '').replace(/[\t\r\n]/g, ' ')).join('\t'))
    .join('\n');
}

export default function ExportActions({
  columns = [],
  rows = [],
  filename = 'data.csv',
  gdriveName,
  showDrive = true,
  csvLabel = null,
  driveLabel = null,
  label = null,
}) {
  const hasRows = Array.isArray(rows) && rows.length > 0;
  const canDrive = !!(import.meta.env.VITE_GOOGLE_API_KEY && import.meta.env.VITE_GOOGLE_CLIENT_ID);
  const { showToast } = useToast();

  const finalFilename =
    typeof filename === 'string' && filename.toLowerCase().endsWith('.csv')
      ? filename.slice(0, -4) + '.tsv'
      : filename || 'data.tsv';
  const finalDriveName =
    typeof gdriveName === 'string' && gdriveName.toLowerCase().endsWith('.csv')
      ? gdriveName.slice(0, -4) + '.tsv'
      : gdriveName || finalFilename;

  const btnCsvStyle = {
    background: '#10B981', // Green
    color: '#fff',
    border: 'none',
    boxShadow: '0 3px 0 #047857',
    width: '32px',
    height: '32px',
    minWidth: '32px',
    padding: 0,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: '0 0 32px',
  };

  const btnDriveStyle = {
    background: '#3B82F6', // Blue
    color: '#fff',
    border: 'none',
    boxShadow: '0 3px 0 #1D4ED8',
    width: '32px',
    height: '32px',
    minWidth: '32px',
    padding: 0,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: '0 0 32px',
  };

  async function handleCsv() {
    if (!hasRows) return;
    const headers = columns.map((c) => c.header ?? c.key);
    const data = rows.map((r) => columns.map((c) => r[c.key]));
    exportToTsv(finalFilename, [headers, ...data]);
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
      const csvStr = rowsToTsvString(columns, rows);
      const metadata = {
        name: finalDriveName,
        mimeType: 'text/tab-separated-values',
      };
      const boundary = '-------3141592653589793';
      const delimiter = '\r\n--' + boundary + '\r\n';
      const closeDelimiter = '\r\n--' + boundary + '--';
      const multipartRequestBody =
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: text/tab-separated-values\r\n\r\n' +
        csvStr +
        closeDelimiter;
      await window.gapi.client.request({
        path: '/upload/drive/v3/files',
        method: 'POST',
        params: { uploadType: 'multipart' },
        headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
        body: multipartRequestBody,
      });
      showToast('Uploaded to Google Drive.');
    } catch {
      showToast('Google Drive upload unavailable.');
    }
  }

  return (
    <>
      <Button
        variant="custom"
        size="sm"
        onClick={handleCsv}
        aria-label={label || csvLabel || 'Download TSV'}
        title={label || csvLabel || 'Download TSV'}
        disabled={!hasRows}
        icon="download"
        style={{
          ...btnCsvStyle,
          width: '32px',
          height: '32px',
          minWidth: '32px',
          flex: '0 0 32px',
          borderRadius: '50%',
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      />
      {showDrive && (
        <Button
          variant="custom"
          size="sm"
          onClick={handleDriveUpload}
          aria-label={label || driveLabel || 'Upload to Google Drive'}
          title={label || driveLabel || 'Upload to Google Drive'}
          disabled={!hasRows || !canDrive}
          icon="cloud"
          style={{
            ...btnDriveStyle,
            width: '32px',
            height: '32px',
            minWidth: '32px',
            flex: '0 0 32px',
            borderRadius: '50%',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginLeft: '8px',
          }}
        />
      )}
    </>
  );
}
