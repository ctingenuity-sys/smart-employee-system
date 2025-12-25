
import React, { useEffect } from 'react';

interface ToastProps {
  message: string;
  type: 'success' | 'info' | 'error';
  duration?: number;
  onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ message, type, duration = 1000, onClose }) => {
  useEffect(() => {
    // Sound Logic - استخدام نفس المكتبة الصوتية لتوحيد التجربة
    const playSound = () => {
        let audioSrc = '';
        switch (type) {
            case 'success':
                // Success Chime
                audioSrc = 'https://assets.mixkit.co/active_storage/sfx/3005/3005-preview.mp3'; 
                break;
            case 'error':
                // Error Alert
                audioSrc = 'https://assets.mixkit.co/active_storage/sfx/2572/2572-preview.mp3'; 
                break;
            case 'info':
            default:
                // Info Notification (Crystal Bell)
                audioSrc = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'; 
                break;
        }
        
        if (audioSrc) {
            const audio = new Audio(audioSrc);
            audio.volume = 1.0; 
            audio.play().catch(e => console.warn('Toast audio blocked:', e));
        }
    };

    playSound();

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
    <div className={`fixed top-6 left-1/2 transform -translate-x-1/2 z-[100] flex items-center gap-3 px-6 py-4 rounded-full shadow-xl text-white ${styles[type]} animate-bounce-in min-w-[320px] backdrop-blur-md bg-opacity-95`}>
      <i className={`fas ${icons[type]} text-xl`}></i>
      <div className="flex-1">
        <p className="font-bold text-sm tracking-wide">{message}</p>
      </div>
      <button onClick={onClose} className="text-white/80 hover:text-white hover:bg-white/20 rounded-full p-1 transition-colors">
        <i className="fas fa-times"></i>
      </button>
    </div>
  );
};

export default Toast;
