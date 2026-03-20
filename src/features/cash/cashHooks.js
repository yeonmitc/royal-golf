import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addCashTransaction,
  deleteCashTransaction,
  getCashBalances,
  getCashTransactions,
  updateCashTransactionAmount,
} from './cashApi';

export const CASH_KEYS = {
  all: ['cash'],
  balances: () => ['cash', 'balances'],
  transactions: () => ['cash', 'transactions'],
};

export function useCashBalances() {
  return useQuery({
    queryKey: CASH_KEYS.balances(),
    queryFn: getCashBalances,
  });
}

export function useCashTransactions(limit = 200) {
  return useQuery({
    queryKey: [...CASH_KEYS.transactions(), limit],
    queryFn: () => getCashTransactions(limit),
  });
}

export function useAddCashTransactionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: addCashTransaction,
    onSuccess: () => {
      // Invalidate both balances and transactions to refresh UI
      queryClient.invalidateQueries({ queryKey: CASH_KEYS.all });
    },
  });
}

export function useDeleteCashTransactionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCashTransaction,
    onSuccess: () => {
      // Invalidate both balances and transactions to refresh UI
      queryClient.invalidateQueries({ queryKey: CASH_KEYS.all });
    },
  });
}

export function useUpdateCashTransactionAmountMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateCashTransactionAmount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CASH_KEYS.all });
    },
  });
}
