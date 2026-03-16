import { useMutation, useQuery } from '@tanstack/react-query';
import {
  fetchChecklistDaily,
  fetchChecklistSummary,
  upsertChecklistDaily,
  upsertChecklistSummary,
} from './checklistApi';

export function useChecklistMonth(year, month) {
  return useQuery({
    queryKey: ['checklist', 'month', year, month],
    queryFn: () => fetchChecklistSummary({ year, month }),
    staleTime: 1000 * 60 * 5,
  });
}

export function useUpsertChecklistMutation() {
  return useMutation({
    mutationFn: upsertChecklistSummary,
  });
}

export function useChecklistDaily(checkDate, options = {}) {
  return useQuery({
    queryKey: ['checklist', 'daily', checkDate],
    queryFn: () => fetchChecklistDaily(checkDate),
    staleTime: 1000 * 15,
    ...options,
  });
}

export function useUpsertChecklistDailyMutation() {
  return useMutation({
    mutationFn: upsertChecklistDaily,
  });
}
