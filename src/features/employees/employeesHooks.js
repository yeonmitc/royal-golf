import { useQuery } from '@tanstack/react-query';
import { fetchEmployees } from './employeesApi';

export function useEmployees(options = {}) {
  return useQuery({
    queryKey: ['employees'],
    queryFn: fetchEmployees,
    staleTime: 1000 * 60 * 5,
    ...options,
  });
}

