import { useQuery } from '@tanstack/react-query';
import { fetchEmployees } from './employeesApi';

export function useEmployees(options = {}) {
  return useQuery({
    queryKey: ['employees'],
    queryFn: fetchEmployees,
    staleTime: Infinity,
    ...options,
  });
}

