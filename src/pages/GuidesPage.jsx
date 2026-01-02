// src/pages/GuidesPage.jsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getGuideStats, adjustGuidePoints } from '../features/guides/guideApi';
import DataTable from '../components/common/DataTable';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import Input from '../components/common/Input';
import Card from '../components/common/Card';
import { useToast } from '../context/ToastContext';

export default function GuidesPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const { data: guideStats, isLoading } = useQuery({
    queryKey: ['guideStats'],
    queryFn: getGuideStats,
  });

  const [selectedGuide, setSelectedGuide] = useState(null);
  const [newBalance, setNewBalance] = useState('');
  const [reason, setReason] = useState('');

  const { mutateAsync: adjustPoints, isPending } = useMutation({
    mutationFn: ({ guideId, amount, reason }) => adjustGuidePoints(guideId, amount, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guideStats'] });
      showToast('Points updated successfully.');
      handleClose();
    },
    onError: (e) => {
      showToast(e.message || 'Failed to update points.');
    },
  });

  const handleClose = () => {
    setSelectedGuide(null);
    setNewBalance('');
    setReason('');
  };

  const handleSubmit = async () => {
    if (!selectedGuide || newBalance === '') return;
    
    const current = Number(selectedGuide.balance || 0);
    const target = Number(newBalance);
    if (isNaN(target)) {
      showToast('Please enter a valid number.');
      return;
    }
    
    const delta = target - current;
    if (delta === 0) {
      handleClose();
      return;
    }

    await adjustPoints({
      guideId: selectedGuide.guide_id,
      amount: delta,
      reason: reason || 'Manual balance update',
    });
  };

  const openAdjustModal = (guide) => {
    console.log('Opening adjust modal for:', guide);
    if (!guide) return;
    setSelectedGuide(guide);
    // Ensure we handle both string and number types for balance
    const currentBal = guide.balance !== undefined && guide.balance !== null ? guide.balance : 0;
    setNewBalance(String(currentBal));
    setReason('');
  };

  if (isLoading) {
    return <div className="p-8">Loading guides...</div>;
  }

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Guide Management</h1>
      </div>

      <Card>
        <DataTable
          columns={[
            { key: 'name', header: 'Name' },
            { key: 'balance', header: 'Current Points', className: 'text-right', tdClassName: 'text-right font-mono font-bold' },
            { key: 'action', header: 'Action', className: 'text-center', tdClassName: 'text-center' },
          ]}
          rows={(guideStats || []).map((g) => ({
            id: g.guide_id,
            name: g.name,
            balance: Number(g.balance).toLocaleString('en-US'),
            action: (
              <Button
                size="sm"
                variant="outline"
                onClick={() => openAdjustModal(g)}
              >
                Edit Points
              </Button>
            ),
          }))}
        />
      </Card>

      {selectedGuide && (
        <Modal
          open={true}
          title={`Edit Points: ${selectedGuide.name}`}
          onClose={handleClose}
          containerStyle={{ width: '30vw', minWidth: '400px' }}
          footer={
            <>
              <Button variant="outline" onClick={handleClose} disabled={isPending}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSubmit} disabled={isPending || newBalance === ''}>
                {isPending ? 'Saving...' : 'Confirm Update'}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Set Total Points (Current: {Number(selectedGuide.balance).toLocaleString('en-US')})
              </label>
              <Input
                type="number"
                value={newBalance}
                onChange={(e) => setNewBalance(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSubmit();
                  }
                }}
                placeholder="Enter new total points"
                autoFocus
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
