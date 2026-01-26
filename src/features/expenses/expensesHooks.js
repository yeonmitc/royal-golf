import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CASH_KEYS } from '../cash/cashHooks';
import {
  createExpense,
  createExpenseCategory,
  deleteExpense,
  getExpenseCategories,
  getExpenses,
  updateExpense,
} from './expensesApi';

export function useExpenseCategories() {
  return useQuery({
    queryKey: ['expenseCategories'],
    queryFn: getExpenseCategories,
  });
}

export function useCreateExpenseCategoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createExpenseCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenseCategories'] });
    },
  });
}

export function useExpenses(filters) {
  return useQuery({
    queryKey: ['expenses', filters],
    queryFn: () => getExpenses(filters),
  });
}

export function useCreateExpenseMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createExpense,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: CASH_KEYS.all });
    },
  });
}

export function useUpdateExpenseMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }) => updateExpense(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    },
  });
}

export function useDeleteExpenseMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteExpense,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    },
  });
}
