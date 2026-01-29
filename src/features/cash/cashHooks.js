import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addCashTransaction,
  deleteCashTransaction,
  getCashBalances,
  getCashTransactions,
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

export function useCashTransactions() {
  return useQuery({
    queryKey: CASH_KEYS.transactions(),
    queryFn: () => getCashTransactions(10),
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
