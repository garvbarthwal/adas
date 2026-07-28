import { useState } from "react";
import { RadarSettingsModal } from "./RadarSettingsModal";
import { useRadarWebSerial } from "@/hooks/useRadarWebSerial";
import { useRadarBluetooth } from "@/hooks/useRadarBluetooth";

export function RadarControls() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { connect: connectUSB, disconnect: disconnectUSB, status: statusUSB } = useRadarWebSerial();
  const { connect: connectBT, disconnect: disconnectBT, status: statusBT } = useRadarBluetooth();

  const isAnyConnected = statusUSB === "connected" || statusBT === "connected";

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        Radar
      </span>
      
      {/* Bluetooth Connect Button */}
      <button 
        onClick={statusBT === "disconnected" ? connectBT : disconnectBT}
        disabled={statusUSB === "connected" || statusUSB === "connecting"}
        className={`flex items-center gap-1.5 h-[25px] px-3 text-[11px] font-medium rounded shadow-[0_2px_8px_rgba(0,0,0,0.3)] ring-1 ring-white/10 transition outline-none ${
          statusBT === "connected" 
            ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30" 
            : statusBT === "connecting"
            ? "bg-amber-500/20 text-amber-400"
            : "bg-black/55 text-slate-200 hover:bg-black/70 hover:text-white disabled:opacity-50"
        }`}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m7 7 10 10-5 5V2l5 5-10 10"/>
        </svg>
        {statusBT === "connected" ? "Disconnect BT" : statusBT === "connecting" ? "Connecting..." : "Connect BT"}
      </button>

      {/* USB Connect Button */}
      <button 
        onClick={statusUSB === "disconnected" ? connectUSB : disconnectUSB}
        disabled={statusBT === "connected" || statusBT === "connecting"}
        className={`h-[25px] px-3 text-[11px] font-medium rounded shadow-[0_2px_8px_rgba(0,0,0,0.3)] ring-1 ring-white/10 transition outline-none ${
          statusUSB === "connected" 
            ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30" 
            : statusUSB === "connecting"
            ? "bg-amber-500/20 text-amber-400"
            : "bg-black/55 text-slate-200 hover:bg-black/70 hover:text-white disabled:opacity-50"
        }`}
      >
        {statusUSB === "connected" ? "Disconnect USB" : statusUSB === "connecting" ? "Connecting..." : "Connect USB"}
      </button>

      {/* Settings Button */}
      <button 
        onClick={() => setIsSettingsOpen(true)}
        disabled={!isAnyConnected}
        className={`flex h-[25px] w-[25px] items-center justify-center rounded shadow-[0_2px_8px_rgba(0,0,0,0.3)] ring-1 ring-white/10 transition ml-1 ${
          isAnyConnected
            ? "bg-black/55 text-slate-400 hover:bg-black/70 hover:text-white"
            : "bg-black/20 text-slate-600 cursor-not-allowed"
        }`}
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
