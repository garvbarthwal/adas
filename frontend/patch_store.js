const fs = require('fs');
let code = fs.readFileSync('src/store/useStore.ts', 'utf8');

code = code.replace('detection: DetectionMessage | null;', 'detections: Record<string, DetectionMessage>;');
code = code.replace('metrics: CameraMetrics | null;', 'metrics: Record<string, CameraMetrics>;');

code = code.replace('setDetection: (d: DetectionMessage) => void;', 'setDetection: (cameraId: string, d: DetectionMessage) => void;');
code = code.replace('setMetrics: (m: CameraMetrics) => void;', 'setMetrics: (cameraId: string, m: CameraMetrics) => void;');

code = code.replace('detection: null,', 'detections: {},');
code = code.replace('metrics: null,', 'metrics: {},');

code = code.replace('setDetection: (d) => set({ detection: d }),', 'setDetection: (cameraId, d) => set((state) => ({ detections: { ...state.detections, [cameraId]: d } })),');
code = code.replace('setMetrics: (m) => set({ metrics: m }),', 'setMetrics: (cameraId, m) => set((state) => ({ metrics: { ...state.metrics, [cameraId]: m } })),');

fs.writeFileSync('src/store/useStore.ts', code);
