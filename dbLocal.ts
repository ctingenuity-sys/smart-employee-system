
import Dexie, { Table } from 'dexie';

// Define the interface for our local appointment
export interface LocalAppointment {
  id: string;
  patientName: string;
  fileNumber: string;
  patientAge?: string;
  examType: string; // MRI, CT, etc.
  examList: string[];
  doctorName?: string;
  refNo?: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  status: 'pending' | 'processing' | 'done' | 'scheduled';
  notes?: string;
  
  // Operational fields
  registrationNumber?: string;
  performedBy?: string;
  performedByName?: string;
  startedAt?: Date;
  completedAt?: Date;
  
  // Booking fields
  scheduledDate?: string;
  roomNumber?: string;
  preparation?: string;
  
  // Sync
  isSynced?: boolean;
  createdAt: Date;
}

class RadiologyDatabase extends Dexie {
  appointments!: Table<LocalAppointment>;

  constructor() {
    super('RadiologyLocalDB');
    this.version(1).stores({
      appointments: 'id, date, status, examType, fileNumber, createdAt' // Indexed fields
    });
  }
}

export const dbLocal = new RadiologyDatabase();
