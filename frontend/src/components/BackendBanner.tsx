/**
 * Banner shown when the backend REST API is unreachable. Uses React Query to
 * poll `/health`; surfaces a clear, non-blocking message to the user.
 */

import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";

export function BackendBanner() {
  const { isError } = useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    refetchInterval: 5000,
    retry: false,
  });

  if (!isError) return null;

  return (
    <div className="bg-red-500/20 px-6 py-2 text-center text-sm text-red-200">
      Backend unavailable — retrying. Video and detections will resume
      automatically once the backend is reachable.
    </div>
  );
}
