// src/pages/GuidesPage.jsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import Card from '../components/common/Card';
import DataTable from '../components/common/DataTable';
import Modal from '../components/common/Modal';
import { useToast } from '../context/ToastContext';
import {
  getGuideStats,
  getSettlementHistory,
  settleAllGuideCommission,
  settleGuideCommissionToBalance,
} from '../features/guides/guideApi';

const TYPE_BADGE = {
  regular: { bg: 'rgba(59,130,246,0.18)', color: '#93c5fd', label: 'Guide' },
  local: { bg: 'rgba(34,197,94,0.18)', color: '#86efac', label: 'Local Guide' },
};

function TypeBadge({ type }) {
  const badge = TYPE_BADGE[type] || TYPE_BADGE.regular;
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: badge.bg,
        color: badge.color,
      }}
    >
      {badge.label}
    </span>
  );
}

function isMrMoon(g) {
  return String(g.name || '')
    .toLowerCase()
    .replace(/[\s.]/g, '')
    .includes('mrmoon');
}

function getRateLabel(g) {
  if (g.guide_type === 'local') return '10%';
  if (g.guide_type === 'regular') return '10%/20%';
  return '-';
}

export default function GuidesPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const { data: guideStats, isLoading } = useQuery({
    queryKey: ['guideStats'],
    queryFn: getGuideStats,
  });

  const { data: settlements, isLoading: isLoadingSettlements } = useQuery({
    queryKey: ['settlementHistory'],
    queryFn: () => getSettlementHistory(),
  });

  const guideNameMap = useMemo(() => {
    const map = {};
    (guideStats || []).forEach((g) => {
      map[g.guide_id] = g.name;
    });
    return map;
  }, [guideStats]);

  const [selectedGuide, setSelectedGuide] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const [settleMode, setSettleMode] = useState(null);
  const [partialTarget, setPartialTarget] = useState('');

  const { mutateAsync: doSettleAll, isPending: isSettlingAll } = useMutation({
    mutationFn: (guideId) => settleAllGuideCommission(guideId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guideStats'] });
      queryClient.invalidateQueries({ queryKey: ['settlementHistory'] });
      showToast('전체 정산이 완료되었습니다.');
      handleClose();
    },
    onError: (e) => {
      showToast(e.message || 'Settlement failed.');
    },
  });

  const { mutateAsync: doSettlePartial, isPending: isSettlingPartial } = useMutation({
    mutationFn: ({ guideId, targetBalance, expectedBalance }) =>
      settleGuideCommissionToBalance(guideId, targetBalance, expectedBalance),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guideStats'] });
      queryClient.invalidateQueries({ queryKey: ['settlementHistory'] });
      showToast('부분 정산이 완료되었습니다.');
      handleClose();
    },
    onError: (e) => {
      showToast(e.message || 'Settlement failed.');
    },
  });

  const handleClose = useCallback(() => {
    setSelectedGuide(null);
    setSettleMode(null);
    setPartialTarget('');
  }, []);

  const handleSettleAll = async () => {
    if (!selectedGuide) return;
    await doSettleAll(selectedGuide.guide_id);
  };

  const handleSettlePartial = async () => {
    if (!selectedGuide) return;
    const target = Number(partialTarget);
    if (isNaN(target) || target < 0) {
      showToast('Please enter a valid target balance.');
      return;
    }
    if (target >= Number(selectedGuide.balance)) {
      showToast('Target must be less than current balance.');
      return;
    }
    await doSettlePartial({
      guideId: selectedGuide.guide_id,
      targetBalance: target,
      expectedBalance: Number(selectedGuide.balance),
    });
  };

  const openSettleModal = (guide, mode) => {
    if (!guide) return;
    setSelectedGuide(guide);
    setSettleMode(mode);
    setPartialTarget('');
  };

  // Exclude Mr.Moon and employees
  const visibleGuides = useMemo(() => {
    if (!guideStats) return [];
    return guideStats.filter((g) => {
      if (isMrMoon(g)) return false;
      if (g.guide_type === 'employee') return false;
      return true;
    });
  }, [guideStats]);

  const filteredGuides = useMemo(() => {
    if (typeFilter === 'all') return visibleGuides;
    return visibleGuides.filter((g) => g.guide_type === typeFilter);
  }, [visibleGuides, typeFilter]);

  if (isLoading) {
    return <div className="p-8">Loading guides...</div>;
  }

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Guide Management</h1>
      </div>

      {/* Type Filter Tabs */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[
          { key: 'all', label: 'All' },
          { key: 'regular', label: 'Guide' },
          { key: 'local', label: 'Local Guide' },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setTypeFilter(tab.key)}
            style={{
              padding: '6px 16px',
              borderRadius: 999,
              border:
                typeFilter === tab.key
                  ? '1px solid rgba(212,175,55,0.6)'
                  : '1px solid var(--border-soft)',
              background: typeFilter === tab.key ? 'rgba(212,175,55,0.14)' : 'transparent',
              color: typeFilter === tab.key ? 'var(--gold-soft)' : 'var(--text-main)',
              fontWeight: typeFilter === tab.key ? 700 : 500,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Card>
        <DataTable
          columns={[
            { key: 'name', header: 'Name' },
            { key: 'type', header: 'Type', className: 'text-center', tdClassName: 'text-center' },
            { key: 'rate', header: 'Rate', className: 'text-center', tdClassName: 'text-center' },
            { key: 'balance', header: 'Balance', className: 'text-right', tdClassName: 'text-right font-mono font-bold' },
            { key: 'action', header: 'Action', className: 'text-center', tdClassName: 'text-center' },
          ]}
          rows={filteredGuides.map((g) => {
            const balance = Number(g.balance || 0);
            const disabled = balance <= 0;

            return {
              id: g.guide_id,
              name: g.name,
              type: <TypeBadge type={g.guide_type} />,
              rate: getRateLabel(g),
              balance: balance.toLocaleString('en-US'),
              action: (
                <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => openSettleModal(g, 'partial')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      border: '1px solid rgba(212,175,55,0.4)',
                      background: 'transparent',
                      color: disabled ? 'var(--text-muted)' : 'var(--gold-soft)',
                      opacity: disabled ? 0.5 : 1,
                    }}
                  >
                    부분 정산
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => openSettleModal(g, 'full')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      border: '1px solid rgba(239,68,68,0.5)',
                      background: 'rgba(239,68,68,0.15)',
                      color: disabled ? 'var(--text-muted)' : '#fca5a5',
                      opacity: disabled ? 0.5 : 1,
                    }}
                  >
                    전체 정산
                  </button>
                </div>
              ),
            };
          })}
        />
      </Card>

      {/* Settlement History */}
      <Card title="Settlement History">
        {isLoadingSettlements ? (
          <div className="text-sm text-[var(--text-muted)]">Loading...</div>
        ) : !settlements || settlements.length === 0 ? (
          <div className="text-sm text-[var(--text-muted)]">No settlements yet.</div>
        ) : (
          <DataTable
            columns={[
              { key: 'date', header: 'Date' },
              { key: 'guide', header: 'Guide' },
              { key: 'type', header: 'Type', className: 'text-center', tdClassName: 'text-center' },
              { key: 'amount', header: 'Amount', className: 'text-right', tdClassName: 'text-right font-mono' },
              { key: 'before', header: 'Before', className: 'text-right', tdClassName: 'text-right font-mono' },
              { key: 'after', header: 'After', className: 'text-right', tdClassName: 'text-right font-mono' },
              { key: 'method', header: 'Method' },
              { key: 'note', header: 'Note' },
            ]}
            rows={(settlements || []).map((s) => ({
              id: s.id,
              date: new Date(s.paid_at).toLocaleDateString(),
              guide: guideNameMap[s.guide_id] || `ID: ${s.guide_id}`,
              type: s.settlement_type === 'full' ? 'Full' : 'Partial',
              amount: Number(s.amount).toLocaleString('en-US'),
              before: Number(s.balance_before).toLocaleString('en-US'),
              after: Number(s.balance_after).toLocaleString('en-US'),
              method: s.payment_method || '-',
              note: s.note || '-',
            }))}
          />
        )}
      </Card>

      {/* Settlement Modal */}
      {selectedGuide && (
        <Modal
          open={true}
          title={
            settleMode === 'partial'
              ? `부분 정산: ${selectedGuide.name}`
              : `전체 정산: ${selectedGuide.name}`
          }
          onClose={handleClose}
          size="content"
          containerStyle={{
            width: 'min(420px, calc(100vw - 32px))',
            height: 'fit-content',
            minHeight: 'unset',
            maxHeight: 'calc(100vh - 48px)',
            overflow: 'auto',
          }}
          footer={null}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              padding: 20,
            }}
          >
            {/* Guide Info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <TypeBadge type={selectedGuide.guide_type} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Rate: {getRateLabel(selectedGuide)}
              </span>
            </div>

            {/* Current Balance */}
            <div
              style={{
                padding: '12px 16px',
                borderRadius: 12,
                background: 'rgba(212,175,55,0.08)',
                border: '1px solid rgba(212,175,55,0.2)',
              }}
            >
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Current Balance</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--gold-soft)' }}>
                {Number(selectedGuide.balance).toLocaleString('en-US')}
              </div>
            </div>

            {/* Partial Settlement */}
            {settleMode === 'partial' && (
              <>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 13,
                      fontWeight: 500,
                      color: 'var(--text-muted)',
                      marginBottom: 8,
                    }}
                  >
                    정산 후 남길 Balance
                  </label>
                  <input
                    type="number"
                    value={partialTarget}
                    onChange={(e) => setPartialTarget(e.target.value)}
                    placeholder="0"
                    autoFocus
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: 10,
                      border: '1px solid var(--border-soft)',
                      background: 'var(--bg-card)',
                      color: 'var(--text-main)',
                      fontSize: 14,
                      outline: 'none',
                      MozAppearance: 'textfield',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                {partialTarget !== '' &&
                  !isNaN(Number(partialTarget)) &&
                  Number(partialTarget) >= 0 && (
                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: 10,
                        background: 'rgba(212,175,55,0.06)',
                        border: '1px solid rgba(212,175,55,0.15)',
                      }}
                    >
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                        실제 지급액
                      </div>
                      <div style={{ fontWeight: 700, color: 'var(--gold-soft)', fontSize: 18 }}>
                        {Math.max(
                          0,
                          Number(selectedGuide.balance) - Number(partialTarget),
                        ).toLocaleString('en-US')}{' '}
                        PHP
                      </div>
                    </div>
                  )}

                <button
                  type="button"
                  onClick={handleSettlePartial}
                  disabled={
                    isSettlingPartial || partialTarget === '' || isNaN(Number(partialTarget))
                  }
                  style={{
                    width: '100%',
                    minHeight: 48,
                    borderRadius: 10,
                    border: '1px solid rgba(212,175,55,0.4)',
                    background: 'rgba(212,175,55,0.15)',
                    color: 'var(--gold-soft)',
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {isSettlingPartial ? 'Processing...' : '부분 정산 확인'}
                </button>
              </>
            )}

            {/* Full Settlement */}
            {settleMode === 'full' && (
              <>
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: 12,
                    background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.2)',
                    color: '#fca5a5',
                    fontSize: 14,
                  }}
                >
                  <strong>{selectedGuide.name}</strong>의 전체 잔액{' '}
                  <strong>{Number(selectedGuide.balance).toLocaleString('en-US')}</strong> PHP를
                  정산하시겠습니까?
                </div>
                <button
                  type="button"
                  onClick={handleSettleAll}
                  disabled={isSettlingAll}
                  style={{
                    width: '100%',
                    minHeight: 48,
                    borderRadius: 10,
                    border: '1px solid rgba(239,68,68,0.5)',
                    background: 'rgba(239,68,68,0.2)',
                    color: '#fca5a5',
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {isSettlingAll ? 'Processing...' : '전체 정산 확인'}
                </button>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
