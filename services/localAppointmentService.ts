import { Appointment } from '../types';

const STORAGE_KEY = 'smart_staff_pending_queue';

const getLocalData = (): Appointment[] => {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        console.error("Error reading local storage", e);
        return [];
    }
};

const saveLocalData = (data: Appointment[]) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        console.error("Error saving to local storage", e);
    }
};

export const localAppointmentService = {
    getAll: async (filters?: { status?: string, date?: string, scheduledDate?: string }) => {
        let results = getLocalData();
        
        if (filters?.status) {
            results = results.filter(a => a.status === filters.status);
        }
        if (filters?.date) {
            results = results.filter(a => a.date === filters.date);
        }
        if (filters?.scheduledDate) {
            results = results.filter(a => a.scheduledDate === filters.scheduledDate);
        }
        
        return results; // Returns immediately, no network request needed
    },

    create: async (appt: Partial<Appointment>) => {
        try {
            const data = getLocalData();
            // Check for duplicates if ID is provided
            if (appt.id && data.some(a => a.id === appt.id)) {
                // Already exists, return existing or update? 
                // For now, let's just return the existing one to be safe and idempotent
                return data.find(a => a.id === appt.id) as Appointment;
            }

            const newAppt = { 
                ...appt, 
                id: appt.id || `LOCAL_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                createdAt: appt.createdAt || new Date().toISOString()
            } as Appointment;
            
            data.push(newAppt);
            saveLocalData(data);
            return newAppt;
        } catch (e) {
            console.error("Error creating local appointment", e);
            throw e;
        }
    },

    update: async (id: string, updates: Partial<Appointment>) => {
        const data = getLocalData();
        const index = data.findIndex(a => a.id === id);
        if (index > -1) {
            data[index] = { ...data[index], ...updates };
            saveLocalData(data);
            return data[index];
        }
        throw new Error('Appointment not found in local queue');
    },

    delete: async (id: string) => {
        let data = getLocalData();
        data = data.filter(a => a.id !== id);
        saveLocalData(data);
        return { success: true };
    }
};
