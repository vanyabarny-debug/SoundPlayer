import { useMemo } from 'react';
import { usePlayerStore } from '../store/playerStore';

interface RadoogaAudioVisualizerProps {
  trackKey: string;
  isPlaying: boolean;
}

const hashSeed = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
};

const pickPalette = (seed: number): [string, string, string] => {
  const palettes: Array<[string, string, string]> = [
    ['#8b5cf6', '#3b82f6', '#22d3ee'],
    ['#f43f5e', '#fb7185', '#f59e0b'],
    ['#06b6d4', '#10b981', '#84cc16'],
    ['#7c3aed', '#ec4899', '#60a5fa'],
    ['#14b8a6', '#6366f1', '#a855f7'],
  ];
  return palettes[seed % palettes.length] || palettes[0];
};

export function RadoogaAudioVisualizer({ trackKey, isPlaying }: RadoogaAudioVisualizerProps) {
  const audioEnergy = usePlayerStore((state) => state.audioEnergy);
  const audioBands = usePlayerStore((state) => state.audioBands);
  const seed = useMemo(() => hashSeed(trackKey), [trackKey]);
  const [primary, secondary, accent] = useMemo(() => pickPalette(seed), [seed]);
  const visualType = seed % 4;

  const tunnelRings = useMemo(
    () =>
      new Array(18).fill(0).map((_, index) => {
        const band = audioBands[index % Math.max(audioBands.length, 1)] || 0;
        const depthFactor = 1 - index / 20;
        const pulse = isPlaying ? audioEnergy * 0.8 + band * 0.6 : 0.08;
        const size = Math.max(12, (depthFactor * 100) + pulse * 24);
        const opacity = Math.max(0.08, depthFactor * 0.65);
        const delay = ((seed + index * 23) % 90) / 10;
        const duration = 2.4 + ((seed + index * 13) % 10) / 8;
        return { index, size, opacity, delay, duration };
      }),
    [audioBands, audioEnergy, isPlaying, seed]
  );

  const geometryRays = useMemo(
    () =>
      new Array(22).fill(0).map((_, index) => {
        const angle = (360 / 22) * index + (seed % 19);
        const length = 30 + (audioBands[index % Math.max(audioBands.length, 1)] || 0) * 45;
        const width = 1 + ((seed + index * 11) % 3);
        return { index, angle, length, width };
      }),
    [audioBands, seed]
  );

  const renderTunnel = () => (
    <>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative h-[78%] w-[78%] rounded-full">
          {tunnelRings.map((ring) => (
            <div
              key={`${trackKey}-ring-${ring.index}`}
              className="absolute left-1/2 top-1/2 rounded-full border transition-transform duration-200"
              style={{
                width: `${ring.size}%`,
                height: `${ring.size}%`,
                marginLeft: `-${ring.size / 2}%`,
                marginTop: `-${ring.size / 2}%`,
                borderColor: ring.index % 2 === 0 ? `${primary}aa` : `${secondary}aa`,
                opacity: ring.opacity,
                transform: `scale(${isPlaying ? 1 + audioEnergy * 0.06 : 1})`,
                animation: `radoogaTunnelPulse ${ring.duration}s ease-in-out ${ring.delay}s infinite`,
              }}
            />
          ))}
        </div>
      </div>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative h-[68%] w-[68%]">
          {geometryRays.map((ray) => (
            <div
              key={`${trackKey}-ray-${ray.index}`}
              className="absolute left-1/2 top-1/2 origin-left"
              style={{
                width: `${ray.length}%`,
                height: `${ray.width}px`,
                transform: `rotate(${ray.angle}deg)`,
                background: `linear-gradient(to right, ${accent}ee, transparent)`,
                opacity: isPlaying ? 0.5 : 0.2,
              }}
            />
          ))}
        </div>
      </div>
    </>
  );

  const renderSpiralGrid = () => (
    <div className="absolute inset-0 pointer-events-none">
      {new Array(10).fill(0).map((_, index) => {
        const band = audioBands[index % Math.max(audioBands.length, 1)] || 0;
        const size = 18 + index * 8 + band * 16;
        const rotate = (index * 24 + seed % 360) % 360;
        return (
          <div
            key={`${trackKey}-spiral-${index}`}
            className="absolute left-1/2 top-1/2 border rounded-xl"
            style={{
              width: `${size}%`,
              height: `${size}%`,
              marginLeft: `-${size / 2}%`,
              marginTop: `-${size / 2}%`,
              borderColor: index % 2 ? `${primary}88` : `${accent}88`,
              transform: `rotate(${rotate}deg)`,
              opacity: 0.15 + index * 0.06,
            }}
          />
        );
      })}
    </div>
  );

  const renderOrbital = () => (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
      <div className="relative h-[76%] w-[76%]">
        {new Array(14).fill(0).map((_, index) => {
          const angle = ((seed + index * 41) % 360) * (Math.PI / 180);
          const radius = 18 + index * 3 + audioEnergy * 8;
          const left = 50 + Math.cos(angle) * radius;
          const top = 50 + Math.sin(angle) * radius;
          const size = 4 + ((seed + index) % 5) + audioBands[index % Math.max(audioBands.length, 1)] * 3;
          return (
            <div
              key={`${trackKey}-orb-${index}`}
              className="absolute rounded-full"
              style={{
                left: `${left}%`,
                top: `${top}%`,
                width: `${size}px`,
                height: `${size}px`,
                background: index % 2 ? primary : secondary,
                opacity: isPlaying ? 0.7 : 0.3,
              }}
            />
          );
        })}
      </div>
    </div>
  );

  const renderWaveMesh = () => (
    <div className="absolute inset-0 pointer-events-none">
      <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {new Array(6).fill(0).map((_, index) => {
          const band = audioBands[index % Math.max(audioBands.length, 1)] || 0;
          const y = 18 + index * 12;
          const amplitude = 3 + band * 10;
          const d = `M 0 ${y} C 20 ${y - amplitude} 35 ${y + amplitude} 50 ${y} C 65 ${y - amplitude} 80 ${y + amplitude} 100 ${y}`;
          return (
            <path
              key={`${trackKey}-mesh-${index}`}
              d={d}
              fill="none"
              stroke={index % 2 === 0 ? primary : accent}
              strokeWidth={0.6 + band * 1.1}
              opacity={0.2 + index * 0.1}
            />
          );
        })}
      </svg>
    </div>
  );

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at 30% 30%, ${primary}66 0%, transparent 45%), radial-gradient(circle at 70% 65%, ${secondary}66 0%, transparent 50%), linear-gradient(135deg, #020617 10%, #0f172a 60%, #111827 100%)`,
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div
          className="rounded-full blur-2xl transition-all duration-300"
          style={{
            width: `${180 + audioEnergy * 240}px`,
            height: `${180 + audioEnergy * 240}px`,
            background: `${accent}66`,
            opacity: isPlaying ? 0.72 : 0.3,
          }}
        />
      </div>
      {visualType === 0 && renderTunnel()}
      {visualType === 1 && renderSpiralGrid()}
      {visualType === 2 && renderOrbital()}
      {visualType === 3 && renderWaveMesh()}
      <div className="absolute inset-x-8 bottom-10 h-14 flex items-end gap-1 pointer-events-none">
        {audioBands.slice(0, 8).map((band, index) => (
          <div
            key={`${trackKey}-floor-${index}`}
            className="flex-1 rounded-t-md transition-[height,opacity] duration-150"
            style={{
              height: `${12 + band * 68}%`,
              opacity: isPlaying ? 0.8 : 0.35,
              background: `linear-gradient(to top, ${primary}, ${secondary})`,
            }}
          />
        ))}
      </div>
      <style>{`
        @keyframes radoogaTunnelPulse {
          0% { transform: scale(0.92); opacity: 0.2; }
          50% { transform: scale(1.04); opacity: 0.72; }
          100% { transform: scale(1.15); opacity: 0.12; }
        }
      `}</style>
    </div>
  );
}
