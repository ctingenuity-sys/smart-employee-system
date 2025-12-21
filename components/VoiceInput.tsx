
import React, { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  placeholder?: string;
  className?: string;
  isTextArea?: boolean;
  value?: string;
  onChange?: (val: string) => void;
  lang?: string;
}

const VoiceInput: React.FC<VoiceInputProps> = ({ 
  onTranscript, 
  placeholder, 
  className = "",
  isTextArea = false,
  value = "",
  onChange,
  lang
}) => {
  const [isListening, setIsListening] = useState(false);
  const [supportError, setSupportError] = useState(false);
  const { language, t } = useLanguage();

  const effectivePlaceholder = placeholder || t('voice.tap');

  // Check browser support
  useEffect(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setSupportError(true);
    }
  }, []);

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const startListening = () => {
    if (supportError) return;
    
    setIsListening(true);
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    // Use passed lang or default based on context
    recognition.lang = lang || (language === 'ar' ? 'ar-SA' : 'en-US');
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      onTranscript(transcript);
      setIsListening(false);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  const stopListening = () => {
    // Logic handled by onend usually, but can force stop if needed
    setIsListening(false);
  };

  const baseInputClass = `w-full bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-100 transition-all ${className}`;

  return (
    <div className="relative">
      {isTextArea ? (
        <textarea
          className={`${baseInputClass} min-h-[100px] pl-12 rtl:pl-12 rtl:pr-3`}
          placeholder={effectivePlaceholder}
          value={value}
          onChange={(e) => onChange && onChange(e.target.value)}
        />
      ) : (
        <input
          type="text"
          className={`${baseInputClass} pl-12 rtl:pl-12 rtl:pr-3`}
          placeholder={effectivePlaceholder}
          value={value}
          onChange={(e) => onChange && onChange(e.target.value)}
        />
      )}

      {!supportError && (
        <button
          type="button"
          onClick={toggleListening}
          className={`absolute bottom-3 left-3 rtl:left-3 rtl:right-auto w-8 h-8 rounded-full flex items-center justify-center transition-all ${
            isListening 
              ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-300' 
              : 'bg-slate-200 text-slate-500 hover:bg-indigo-100 hover:text-indigo-600'
          }`}
          title={t('voice.tap')}
        >
          <i className={`fas ${isListening ? 'fa-microphone-slash' : 'fa-microphone'}`}></i>
        </button>
      )}
    </div>
  );
};

export default VoiceInput;
