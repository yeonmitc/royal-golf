import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createEmployeeSchedule, deleteEmployeeSchedule, getEmployeeSchedules } from './schedulesApi';

export function useEmployeeSchedules({ from, to } = {}, options = {}) {
  return useQuery({
    queryKey: ['employeeSchedules', from || '', to || ''],
    queryFn: () => getEmployeeSchedules({ from, to }),
    staleTime: 1000 * 10,
    ...options,
  });
}

export function useCreateEmployeeScheduleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createEmployeeSchedule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employeeSchedules'] });
    },
  });
}

export function useDeleteEmployeeScheduleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteEmployeeSchedule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employeeSchedules'] });
    },
  });
}

