import React, { useEffect, useRef } from 'react';
import { useTheme } from '../contexts/ThemeContext';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: string;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, maxWidth = 'max-w-lg' }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const { isDark } = useTheme();

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
        document.addEventListener('keydown', handleEscape);
        document.body.style.overflow = 'hidden';
    }
    return () => {
        document.removeEventListener('keydown', handleEscape);
        document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 backdrop-blur-sm transition-opacity">
      <div 
        ref={modalRef}
        className={`rounded-2xl shadow-2xl w-full ${maxWidth} mx-4 transform transition-all scale-100 overflow-hidden border ${
          isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
        }`}
      >
        <div className={`flex justify-between items-center p-5 border-b transition-colors ${
          isDark ? 'border-slate-800 bg-slate-800/80 text-white' : 'border-gray-100 bg-gray-50 text-gray-800'
        }`}>
          <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>{title}</h3>
          <button onClick={onClose} className={`transition-colors ${isDark ? 'text-slate-400 hover:text-white' : 'text-gray-400 hover:text-gray-600'}`}>
            <i className="fas fa-times text-xl"></i>
          </button>
        </div>
        <div className="p-6 max-h-[80vh] overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;