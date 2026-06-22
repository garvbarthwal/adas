import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Dashboard } from "@/pages/Dashboard";

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Dashboard />
    </QueryClientProvider>
  );
}
