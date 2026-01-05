
import React, { useEffect } from 'react';

interface ToastProps {
  message: string;
  type: 'success' | 'info' | 'error';
  duration?: number;
  onClose: () => void;
}

// Sound Synthesis Logic (Instant, Offline, No Errors)
const playSystemSound = (type: 'success' | 'error' | 'info') => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      // Success Chime (Rising)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(1174.66, ctx.currentTime + 0.1); // D6
      
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } else if (type === 'error') {
      // Error Buzz (Sawtooth)
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } else {
      // Info Ping (Simple Sine)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
      
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    }
  } catch (e) {
    // Silently ignore audio context errors (e.g. user didn't interact with page yet)
  }
};

const Toast: React.FC<ToastProps> = ({ message, type, duration = 4000, onClose }) => {
  useEffect(() => {
    playSystemSound(type);
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [type, onClose, duration]);

  const styles = {
    success: 'bg-emerald-500 shadow-emerald-200',
    info: 'bg-blue-500 shadow-blue-200',
    error: 'bg-rose-500 shadow-rose-200'
  };
  const icons = {
    success: 'fa-check-circle',
    info: 'fa-bell',
    error: 'fa-exclamation-triangle'
  };

  return (
    <div className={`fixed top-6 left-1/2 transform -translate-x-1/2 z-[100] flex items-center gap-3 px-6 py-4 rounded-full shadow-xl text-white ${styles[type]} animate-bounce-in min-w-[320px] backdrop-blur-md bg-opacity-95 cursor-pointer`} onClick={onClose}>
      <i className={`fas ${icons[type]} text-xl`}></i>
      <div className="flex-1">
        <p className="font-bold text-sm tracking-wide">{message}</p>
      </div>
      <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="text-white/80 hover:text-white hover:bg-white/20 rounded-full p-1 transition-colors">
        <i className="fas fa-times"></i>
      </button>
    </div>
  );
};

export default Toast;
