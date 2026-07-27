import { useEffect, useState } from "react";
import { api } from "@/services/api";
import { RadarSettingsModal } from "./RadarSettingsModal";

type PortInfo = { device: string; description: string };

export function RadarControls() {
  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [selectedPort, setSelectedPort] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const fetchPorts = async () => {
    try {
      const data = await api.radarPorts();
      setPorts(data);
    } catch (err) {
      console.error("Failed to load radar ports:", err);
    }
  };

  // Fetch available ports on mount
  useEffect(() => {
    fetchPorts();
  }, []);

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const port = e.target.value;
    setSelectedPort(port);
    if (!port) return;
    
    setLoading(true);
    try {
      await api.setRadarPort(port);
    } catch (err) {
      console.error("Failed to set radar port:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        Radar
      </span>
      <select
        value={selectedPort}
        onChange={handleChange}
        disabled={loading}
        className="h-[25px] max-w-[200px] truncate rounded bg-black/55 px-2 text-[11px] text-slate-200 shadow-[0_2px_8px_rgba(0,0,0,0.3)] outline-none ring-1 ring-white/10 transition hover:bg-black/70 focus:ring-accent"
      >
        <option value="" disabled>
          {ports.length === 0 ? "No ports found" : "Select port..."}
        </option>
        {ports.map((p) => (
          <option key={p.device} value={p.device}>
            {p.device} - {p.description}
          </option>
        ))}
      </select>
      <button 
        onClick={fetchPorts}
        className="flex h-[25px] w-[25px] items-center justify-center rounded bg-black/55 text-slate-400 shadow-[0_2px_8px_rgba(0,0,0,0.3)] ring-1 ring-white/10 transition hover:bg-black/70 hover:text-white"
        title="Refresh ports"
        aria-label="Refresh ports"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
          <path d="M3 3v5h5"/>
          <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
          <path d="M16 21v-5h5"/>
        </svg>
      </button>

      {/* Settings Button */}
      <button 
        onClick={() => setIsSettingsOpen(true)}
        className="flex h-[25px] w-[25px] items-center justify-center rounded bg-black/55 text-slate-400 shadow-[0_2px_8px_rgba(0,0,0,0.3)] ring-1 ring-white/10 transition hover:bg-black/70 hover:text-white ml-1"
        title="Radar Settings"
        aria-label="Radar Settings"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>

      <RadarSettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
      />
    </div>
  );
}
