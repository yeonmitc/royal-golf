// src/pages/GuidesPage.jsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import Card from '../components/common/Card';
import DataTable from '../components/common/DataTable';
import Modal from '../components/common/Modal';
import { useToast } from '../context/ToastContext';
import {
  getGuideStats,
  getGuideUnsettledSales,
  getSettlementHistory,
  settleGuideSales,
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

  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedGuide, setSelectedGuide] = useState(null);
  const [selectedGroupIds, setSelectedGroupIds] = useState(new Set());
  const [showConfirm, setShowConfirm] = useState(false);

  // Unsettled sale groups for selected guide
  const { data: unsettledGroups, isLoading: isLoadingSales } = useQuery({
    queryKey: ['unsettledSales', selectedGuide?.guide_id],
    queryFn: () => getGuideUnsettledSales(selectedGuide.guide_id),
    enabled: !!selectedGuide,
  });

  const { mutateAsync: doSettle, isPending: isSettling } = useMutation({
    mutationFn: ({ guideId, groupIds }) => settleGuideSales(guideId, groupIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guideStats'] });
      queryClient.invalidateQueries({ queryKey: ['settlementHistory'] });
      queryClient.invalidateQueries({ queryKey: ['unsettledSales'] });
      showToast('정산이 완료되었습니다.');
      setShowConfirm(false);
      setSelectedGuide(null);
      setSelectedGroupIds(new Set());
    },
    onError: (e) => {
      showToast(e.message || 'Settlement failed.');
    },
  });

  const groups = unsettledGroups || [];

  // 날짜별 그룹화
  const groupedDates = useMemo(() => {
    const map = {};
    groups.forEach((g) => {
      const dateKey = g.sold_at ? new Date(g.sold_at).toISOString().split('T')[0] : 'unknown';
      if (!map[dateKey]) {
        map[dateKey] = { dateKey, soldAt: g.sold_at, commission: 0, itemCount: 0, groupIds: [] };
      }
      map[dateKey].commission += Number(g.guide_commission) || 0;
      map[dateKey].itemCount += Number(g.item_count) || 0;
      map[dateKey].groupIds.push(g.sale_group_id);
    });
    return Object.values(map).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  }, [groups]);

  const selectedItems = useMemo(
    () => groupedDates.filter((d) => selectedGroupIds.has(d.dateKey)),
    [groupedDates, selectedGroupIds],
  );

  const totalCommission = useMemo(
    () => selectedItems.reduce((sum, d) => sum + d.commission, 0),
    [selectedItems],
  );

  // 선택된 날짜의 모든 sale_group_id 수집
  const selectedSaleGroupIds = useMemo(
    () => selectedItems.flatMap((d) => d.groupIds),
    [selectedItems],
  );

  const handleToggle = useCallback((dateKey) => {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(dateKey)) next.delete(dateKey);
      else next.add(dateKey);
      return next;
    });
  }, []);

  const handleToggleAll = useCallback(() => {
    setSelectedGroupIds((prev) => {
      if (prev.size === groupedDates.length) return new Set();
      return new Set(groupedDates.map((d) => d.dateKey));
    });
  }, [groupedDates]);

  const handleSelectAll = useCallback(() => {
    setSelectedGroupIds(new Set(groupedDates.map((d) => d.dateKey)));
  }, [groupedDates]);

  const handleOpenSettle = useCallback((guide) => {
    setSelectedGuide(guide);
    setSelectedGroupIds(new Set());
    setShowConfirm(false);
  }, []);

  const handleClose = useCallback(() => {
    setSelectedGuide(null);
    setSelectedGroupIds(new Set());
    setShowConfirm(false);
  }, []);

  const handleConfirmSettle = async () => {
    if (!selectedGuide || selectedSaleGroupIds.length === 0) return;
    await doSettle({
      guideId: selectedGuide.guide_id,
      groupIds: selectedSaleGroupIds,
    });
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

      {/* Guide Table */}
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
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => handleOpenSettle(g)}
                  style={{
                    padding: '4px 12px',
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
                  정산하기
                </button>
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
              { key: 'amount', header: 'Amount', className: 'text-right', tdClassName: 'text-right font-mono' },
              { key: 'note', header: 'Note' },
            ]}
            rows={(settlements || []).map((s) => ({
              id: s.id,
              date: new Date(s.paid_at).toLocaleDateString(),
              guide: guideNameMap[s.guide_id] || `ID: ${s.guide_id}`,
              amount: Number(s.amount).toLocaleString('en-US'),
              note: s.note || '-',
            }))}
          />
        )}
      </Card>

      {/* Unsettled Sales Modal */}
      {selectedGuide && (
        <Modal
          open={true}
          title={`미정산 판매내역: ${selectedGuide.name}`}
          onClose={handleClose}
          size="content"
          containerStyle={{
            width: 'min(640px, calc(100vw - 32px))',
            height: 'fit-content',
            minHeight: 'unset',
            maxHeight: 'calc(100vh - 48px)',
            overflow: 'auto',
          }}
          footer={null}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 20 }}>
            {/* Guide Info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <TypeBadge type={selectedGuide.guide_type} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Rate: {getRateLabel(selectedGuide)}
              </span>
            </div>

            {/* Sales Table */}
            {isLoadingSales ? (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>
                Loading...
              </div>
            ) : groupedDates.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>
                미정산 판매내역이 없습니다.
              </div>
            ) : (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: 13,
                    }}
                  >
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-soft)' }}>
                        <th style={{ padding: '8px 6px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={selectedGroupIds.size === groupedDates.length && groupedDates.length > 0}
                            onChange={handleToggleAll}
                          />
                        </th>
                        <th style={{ padding: '8px 6px', textAlign: 'left' }}>판매일</th>
                        <th style={{ padding: '8px 6px', textAlign: 'right' }}>커미션율</th>
                        <th style={{ padding: '8px 6px', textAlign: 'right' }}>커미션 금액</th>
                        <th style={{ padding: '8px 6px', textAlign: 'right' }}>항목수</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupedDates.map((d) => {
                        const checked = selectedGroupIds.has(d.dateKey);
                        return (
                          <tr
                            key={d.dateKey}
                            style={{
                              borderBottom: '1px solid var(--border-soft)',
                              background: checked ? 'rgba(212,175,55,0.06)' : 'transparent',
                              cursor: 'pointer',
                            }}
                            onClick={() => handleToggle(d.dateKey)}
                          >
                            <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => handleToggle(d.dateKey)}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </td>
                            <td style={{ padding: '8px 6px' }}>
                              {d.soldAt ? new Date(d.soldAt).toLocaleDateString() : '-'}
                            </td>
                            <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                              {selectedGuide.guide_type === 'local' ? '10%' : '10%/20%'}
                            </td>
                            <td
                              style={{
                                padding: '8px 6px',
                                textAlign: 'right',
                                fontFamily: 'monospace',
                                fontWeight: 600,
                              }}
                            >
                              {d.commission.toLocaleString('en-US')}
                            </td>
                            <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                              {d.itemCount}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Summary */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 14px',
                    borderRadius: 10,
                    background: 'rgba(212,175,55,0.06)',
                    border: '1px solid rgba(212,175,55,0.15)',
                    fontSize: 13,
                  }}
                >
                  <span>
                    선택된 건수: <strong>{selectedGroupIds.size}건</strong>
                  </span>
                  <span>
                    총 커미션: <strong style={{ color: 'var(--gold-soft)' }}>
                      {totalCommission.toLocaleString('en-US')}
                    </strong>
                  </span>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    style={{
                      flex: 1,
                      minHeight: 48,
                      borderRadius: 10,
                      border: '1px solid rgba(212,175,55,0.4)',
                      background: 'transparent',
                      color: 'var(--gold-soft)',
                      fontWeight: 700,
                      fontSize: 14,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    전체 정산
                  </button>
                  <button
                    type="button"
                    disabled={selectedGroupIds.size === 0 || isSettling}
                    onClick={() => setShowConfirm(true)}
                    style={{
                      flex: 1,
                      minHeight: 48,
                      borderRadius: 10,
                      border: '1px solid rgba(239,68,68,0.5)',
                      background: 'rgba(239,68,68,0.2)',
                      color: '#fca5a5',
                      fontWeight: 700,
                      fontSize: 14,
                      cursor: selectedGroupIds.size === 0 ? 'not-allowed' : 'pointer',
                      opacity: selectedGroupIds.size === 0 ? 0.5 : 1,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    선택 정산
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}

      {/* Settlement Confirmation Modal */}
      {showConfirm && selectedGuide && (
        <Modal
          open={true}
          title="정산 확인"
          onClose={() => setShowConfirm(false)}
          size="content"
          containerStyle={{
            width: 'min(400px, calc(100vw - 32px))',
            height: 'fit-content',
            minHeight: 'unset',
          }}
          footer={null}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 20 }}>
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
              <strong>{selectedGuide.name}</strong>의 선택된{' '}
              <strong>{selectedGroupIds.size}</strong>건에 대해 커미션{' '}
              <strong>{totalCommission.toLocaleString('en-US')}</strong>를 정산하시겠습니까?
            </div>
            <button
              type="button"
              onClick={handleConfirmSettle}
              disabled={isSettling}
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
              {isSettling ? 'Processing...' : '정산 확인'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
