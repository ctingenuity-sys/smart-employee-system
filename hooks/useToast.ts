import { useLanguage } from '../contexts/LanguageContext';
import { useState } from 'react';

export const useToast = () => {
    const { t } = useLanguage();
    const [toast, setToast] = useState<{msg: string, type: 'success' | 'info' | 'error'} | null>(null);

    const showToast = (key: string, type: 'success' | 'info' | 'error') => {
        setToast({ msg: t(key), type });
    };

    return { toast, setToast, showToast };
};
