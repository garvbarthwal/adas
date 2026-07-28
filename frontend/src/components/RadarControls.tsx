import { useRadarBluetooth } from "@/hooks/useRadarBluetooth";

export function RadarControls() {
  const { connect: connectBT, disconnect: disconnectBT, status: statusBT } = useRadarBluetooth();

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        Radar
      </span>
      
      {/* Bluetooth Connect Button */}
      <button 
        onClick={statusBT === "disconnected" ? connectBT : disconnectBT}
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
    </div>
  );
}
