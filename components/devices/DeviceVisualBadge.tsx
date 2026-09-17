import React from 'react';
import { DeviceItem, getModalityTheme } from './deviceTypes';

interface DeviceVisualBadgeProps {
  device: DeviceItem;
  className?: string;
  isDetailed?: boolean;
}

export const DeviceVisualBadge: React.FC<DeviceVisualBadgeProps> = ({ device, className = '', isDetailed = false }) => {
  const theme = getModalityTheme(device.category);

  if (device.image) {
    return (
      <div className={`relative overflow-hidden w-full h-full bg-slate-900 group/img ${className}`}>
        <img
          src={device.image}
          alt={device.name}
          className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover/img:scale-110"
          loading="lazy"
        />
        {/* Subtle Ambient Vignette & Scanline */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-black/20 pointer-events-none" />
        <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-black/50 backdrop-blur-md border border-white/20 text-[10px] font-mono text-white tracking-wider">
          HD ASSET
        </div>
      </div>
    );
  }

  // High-Tech Cyber-Clinical Blueprint Vector Graphic
  return (
    <div className={`relative overflow-hidden w-full h-full bg-gradient-to-br ${theme.gradient} flex flex-col items-center justify-center select-none ${className}`}>
      {/* Precision Grid Matrix */}
      <svg className="absolute inset-0 w-full h-full opacity-20 pointer-events-none" width="100%" height="100%">
        <defs>
          <pattern id={`grid-${device.id || 'x'}`} width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="white" strokeWidth="0.8" strokeDasharray="2,2" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#grid-${device.id || 'x'})`} />
      </svg>

      {/* Futuristic Concentric Radar Rings */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-30">
        <div className="w-36 h-36 rounded-full border border-white/40 border-dashed animate-spin-slow" />
        <div className="absolute w-24 h-24 rounded-full border border-white/60" />
        <div className="absolute w-12 h-12 rounded-full border-2 border-white/80" />
      </div>

      {/* Equipment Modality Icon & Holographic Typography */}
      <div className="relative z-10 flex flex-col items-center text-center p-3">
        <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-md border border-white/30 flex items-center justify-center shadow-lg shadow-black/20 mb-2 transform transition-transform duration-500 group-hover:scale-110">
          <i className={`fas ${theme.icon} text-white text-2xl drop-shadow-md`}></i>
        </div>
        <span className="text-white text-xs font-black tracking-widest uppercase bg-white/20 backdrop-blur-sm px-2.5 py-0.5 rounded-full border border-white/30">
          {device.category || 'EQUIPMENT'}
        </span>
        {isDetailed && (
          <span className="text-white/80 text-[11px] font-mono mt-1">
            SN: {device.serial || 'N/A'}
          </span>
        )}
      </div>

      {/* Digital Diagnostics Label */}
      <div className="absolute bottom-2 left-3 right-3 flex justify-between items-center text-[9px] font-mono text-white/75 pointer-events-none">
        <span>MEDICAL SYSTEM</span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          DIAGNOSTIC
        </span>
      </div>
    </div>
  );
};
