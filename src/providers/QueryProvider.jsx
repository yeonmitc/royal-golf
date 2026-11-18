// src/providers/QueryProvider.jsx
import { QueryClientProvider } from '@tanstack/react-query';
import queryClient from './queryClient';

export function QueryProvider({ children }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

export default QueryProvider;
