import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { checkDailyAttendance, fetchMonthlyAttendance, recordAttendance } from './attendanceApi';

export function useCheckDailyAttendance(employeeName) {
  return useQuery({
    queryKey: ['attendance', 'daily', employeeName],
    queryFn: () => checkDailyAttendance(employeeName),
    enabled: !!employeeName,
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useMonthlyAttendance(year, month) {
  return useQuery({
    queryKey: ['attendance', 'monthly', year, month],
    queryFn: () => fetchMonthlyAttendance(year, month),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useRecordAttendanceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: recordAttendance,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['attendance', 'daily', variables.employeeName] });
      queryClient.invalidateQueries({ queryKey: ['attendance', 'monthly'] });
    },
  });
}
