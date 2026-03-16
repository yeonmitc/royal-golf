import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  checkDailyAttendance,
  deleteAttendanceLog,
  fetchMonthlyAttendance,
  recordAttendance,
  updateAttendanceLog,
} from './attendanceApi';

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

export function useUpdateAttendanceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateAttendanceLog,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
    },
  });
}

export function useDeleteAttendanceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteAttendanceLog,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
    },
  });
}
