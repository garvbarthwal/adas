import { useState } from "react";
import { api } from "@/services/api";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function RadarSettingsModal({ isOpen, onClose }: Props) {
  const [gate, setGate] = useState<number>(0);
  const [motion, setMotion] = useState<number>(50);
  const [staticSens, setStaticSens] = useState<number>(50);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  if (!isOpen) return null;

  const handleApply = async () => {
    setLoading(true);
    setSuccessMsg("");
    try {
      await api.setGateSensitivity(gate, motion, staticSens);
      setSuccessMsg(`Gate ${gate} updated successfully!`);
    } catch (err) {
      console.error(err);
      setSuccessMsg("Failed to update sensitivity");
    } finally {
      setLoading(false);
      setTimeout(() => setSuccessMsg(""), 3000);
    }
  };

  const handleApplyAll = async () => {
    setLoading(true);
    setSuccessMsg("");
    try {
      await api.setGateSensitivity(-1, motion, staticSens);
      setSuccessMsg("All gates updated successfully!");
    } catch (err) {
      console.error(err);
      setSuccessMsg("Failed to update sensitivity");
    } finally {
      setLoading(false);
      setTimeout(() => setSuccessMsg(""), 3000);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[400px] rounded-xl border border-white/10 bg-video p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-200 uppercase tracking-wider">Radar Tuning</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 flex text-xs font-semibold text-slate-400">Distance Gate (0-8)</label>
            <select 
              value={gate} 
              onChange={(e) => setGate(Number(e.target.value))}
              className="w-full rounded bg-black/55 px-3 py-2 text-sm text-slate-200 outline-none ring-1 ring-white/10 focus:ring-accent"
            >
              {[0,1,2,3,4,5,6,7,8].map(g => (
                <option key={g} value={g}>Gate {g} (approx. {g*0.75}m)</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 flex text-xs font-semibold text-slate-400">
              Motion Sensitivity (0-100): {motion}
            </label>
            <input 
              type="range" min="0" max="100" 
              value={motion} onChange={e => setMotion(Number(e.target.value))}
              className="w-full accent-accent" 
            />
          </div>

          <div>
            <label className="mb-1 flex text-xs font-semibold text-slate-400">
              Static Sensitivity (0-100): {staticSens}
            </label>
            <input 
              type="range" min="0" max="100" 
              value={staticSens} onChange={e => setStaticSens(Number(e.target.value))}
              className="w-full accent-accent" 
            />
          </div>
        </div>

        <div className="mt-8 flex justify-end gap-3">
          <button 
            onClick={handleApplyAll} 
            disabled={loading}
            className="rounded bg-black/55 px-4 py-2 text-sm font-semibold text-slate-300 ring-1 ring-white/10 hover:bg-black/70 hover:text-white"
          >
            Apply to ALL
          </button>
          <button 
            onClick={handleApply} 
            disabled={loading}
            className="rounded bg-accent/20 px-4 py-2 text-sm font-semibold text-accent ring-1 ring-accent/50 hover:bg-accent hover:text-black transition"
          >
            Apply to Gate {gate}
          </button>
        </div>

        {successMsg && (
          <div className="mt-4 text-center text-xs font-bold text-green-400">
            {successMsg}
          </div>
        )}
      </div>
    </div>
  );
}
