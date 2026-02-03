
export enum UserRole {
  ADMIN = 'admin',
  SUPERVISOR = 'supervisor',
  USER = 'user',
  DOCTOR = 'doctor'
}

export interface User {
  id: string;
  uid: string;
  email: string;
  name: string;
  role: string;
  phone?: string;
  biometricId?: string; // ID of the bound device/credential
  biometricRegisteredAt?: any;
  createdAt?: any;
  permissions?: string[]; // Array of allowed page IDs
}

export interface Location {
  id: string;
  name: string;
}

export interface Schedule {
  id: string;
  userId: string;
  locationId: string;
  date?: string; // YYYY-MM-DD
  month?: string; // YYYY-MM
  userType: string;
  shifts: { start: string; end: string }[];
  note?: string;
  week?: string;
  validFrom?: string; // YYYY-MM-DD
  validTo?: string;   // YYYY-MM-DD
  staffName?: string; // Added for schedule builder publishing
  createdAt?: any;
  swapRequestId?: string;
}

export interface SwapRequest {
  id: string;
  from: string;
  to: string;
  type: 'day' | 'month';
  details: string;
  status: 'pending' | 'approvedByUser' | 'approvedBySupervisor' | 'rejected' | 'rejectedBySupervisor';
  startDate?: string;
  endDate?: string;
  createdAt?: any;
}

export interface SwapHistory {
  id: string;
  from: string;
  to: string;
  type: string;
  details: string;
  approvedAt: any;
  approvedBy: string;
}

export interface LeaveRequest {
  id: string;
  from: string; // User ID
  startDate: string;
  endDate: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  supervisorComment?: string;
  createdAt?: any;
}

export interface LeaveHistory {
  id: string;
  userId?: string;
  from?: string;
  startDate: any;
  endDate: any;
  reason: string;
  status: string;
  supervisorComment?: string;
  approvedAt?: any;
}

export interface ActionLog {
  id: string;
  employeeId: string;
  type: string;
  fromDate: string;
  toDate: string;
  description: string;
  createdAt?: any;
}

// --- NEW: Communication Features ---

export interface Announcement {
  id: string;
  title: string;
  content: string;
  priority: 'normal' | 'urgent' | 'critical';
  createdBy: string;
  createdAt: any;
  isActive: boolean;
  seenBy?: string[]; // Array of User IDs who saw this
}

export interface ShiftLog {
  id: string;
  userId: string;
  userName: string;
  location?: string; // مكان عمل المُسلم
  type: 'handover' | 'issue' | 'note'; // تسليم، مشكلة، ملاحظة
  content: string;
  category?: 'machine' | 'patient' | 'supply' | 'general';
  createdAt: any;
  isImportant: boolean;
  receivedBy?: string; // Name of person who received/acknowledged
  receivedAt?: any;    // Timestamp
  receiverLocation?: string; // مكان عمل المستلم
}

// --- NEW: Peer Recognition ---
export interface PeerRecognition {
  id: string;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  type: 'hero' | 'thankyou' | 'teamplayer';
  message: string;
  createdAt: any;
}

// --- NEW: Live Attendance Log ---
export interface AttendanceLog {
  id: string;
  userId: string;
  userName: string;
  type: 'IN' | 'OUT';
  timestamp: any;
  clientTimestamp?: any; // Added for improved accuracy tracking
  date: string; // YYYY-MM-DD
  locationLat?: number;
  locationLng?: number;
  distanceKm?: number;
  deviceInfo?: string;
  deviceId?: string; // For biometric binding check
  imageUrl?: string; 
  earlyMinutes?: number; // NEW: Early departure minutes
  status?: string; // Verification status (verified/pending)
  shiftIndex?: number; // Added to track shift number (1 or 2)
  isSuspicious?: boolean; // NEW: Fraud detection flag
  violationType?: string; // NEW: Description of the violation (Time/Location)
}

// --- NEW: Location Check Request (Spot Check) ---
export interface LocationCheckRequest {
  id: string;
  targetUserId: string;
  targetUserName?: string; // NEW: Added to display name to supervisor
  userName?: string; // NEW: Added to capture name of person who completed check
  supervisorId: string;
  status: 'pending' | 'completed' | 'expired' | 'rejected';
  createdAt: any; // Timestamp
  expiresAt?: any; // Timestamp (Created + 5 mins)
  locationLat?: number;
  locationLng?: number;
  accuracy?: number;
  completedAt?: any;
  reason?: string; // For rejection
  deviceMismatch?: boolean;
}

// --- NEW: Appointments ---
export interface Appointment {
  id: string;
  patientName: string;
  fileNumber?: string; // NEW: Patient File Number
  doctorName?: string; // NEW: Referring Doctor
  patientAge?: string; // NEW: Age
  examType: string;
  examList?: string[]; // NEW: List of all specific exams
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  notes?: string;
  status: 'pending' | 'done' | 'cancelled' | 'scheduled' | 'processing'; // Added 'scheduled' and 'processing'
  createdBy: string; // User ID
  createdByName: string;
  performedBy?: string; // NEW: User ID who did the exam
  performedByName?: string; // NEW: Name of user who did the exam
  createdAt: any;
  scheduledDate?: string; // For bookings
  refNo?: string; // Unique Reference for deduplication
  registrationNumber?: string; // NEW: Sequential number (MRI-101, CT-505)
  panicDetails?: string; // NEW: If panic report exists
  preparation?: string; // NEW: Instructions
  roomNumber?: string; // Added for ExtendedAppointment compatibility
  completedAt?: any; // Added for sorting/reporting
  isPanic?: boolean; // Added for panic reporting
}

// Added ExtendedAppointment here to be globally accessible
export interface ExtendedAppointment extends Appointment {
    roomNumber?: string;
    preparation?: string;
}

// --- NEW: Panic Report ---
export interface PanicReport {
    id: string;
    date: string;
    time: string;
    patientName: string;
    fileNumber: string;
    registrationNumber: string;
    doctorName: string;
    examType: string;
    findings: string;
    reportedBy: string; // Employee Name
    reportedById: string;
    createdAt: any;
}

// --- Visual Schedule Types ---

export interface VisualStaff {
    name: string;
    userId?: string; // Optional ID for smart assignment
    time?: string;
    startDate?: string;
    endDate?: string;
    note?: string; // Added: Note specific to this shift
}

export interface ModalityColumn {
  id: string;
  title: string;
  defaultTime: string;
  colorClass: string;
  staff: VisualStaff[];
}

export interface CommonDuty {
  section: string;
  time: string;
  staff: VisualStaff[]; // Changed from string[] to VisualStaff[]
}

// --- Dynamic Column Definition ---
export interface ScheduleColumn {
    id: string;
    title: string;
    subTitle?: string;
    time?: string;
}

// Flexible Rows for Dynamic Columns
export interface FridayScheduleRow {
  id: string;
  date: string;
  [key: string]: any; // Allow dynamic column keys (e.g. 'col1', 'col2')
}

export interface HolidayScheduleRow {
  id: string;
  occasion: string;
  [key: string]: any; // Allow dynamic column keys
}

// --- NEW: Doctor Schedule Row ---
export interface DoctorScheduleRow {
  id: string;
  dateRange: string;
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
  
  // Specific overrides for Night Shift dates
  nightStartDate?: string; 
  nightEndDate?: string;

  [key: string]: any; // Allow dynamic columns
}

// --- UPDATED: Doctor Friday Schedule Row to match Image ---
export interface DoctorFridayRow {
  id: string;
  date: string;
  [key: string]: any; // Allow dynamic columns
}

// --- NEW: Date Exception Type for Schedule Builder ---
export interface DateException {
  id: string;
  date: string;
  note: string; // The Occasion Name
  columns: ModalityColumn[]; // The schedule structure for this day (Staff)
  doctorData?: DoctorScheduleRow[]; // Added for Doctor support
  doctorColumns?: ScheduleColumn[]; // Structure for Doctors
}

export interface HeaderMap {
    [key: string]: string;
}

export interface SavedTemplate {
  id: string;
  name: string;
  targetMonth?: string; // YYYY-MM used for filtering
  createdAt: any;
  generalData: ModalityColumn[];
  commonDuties: CommonDuty[];
  fridayData: FridayScheduleRow[];
  holidayData: HolidayScheduleRow[];
  doctorData?: DoctorScheduleRow[]; 
  doctorFridayData?: DoctorFridayRow[]; 
  
  // Dynamic Columns Configuration
  fridayColumns?: ScheduleColumn[];
  holidayColumns?: ScheduleColumn[];
  doctorColumns?: ScheduleColumn[];
  doctorFridayColumns?: ScheduleColumn[];
  
  // Exceptions
  exceptions?: DateException[];

  // Global fields
  globalStartDate?: string;
  globalEndDate?: string;
  scheduleNote?: string;
}

// --- Attendance Analyzer Types ---

export interface RawAttendanceRecord {
  employeeName: string;
  date: string; // YYYY-MM-DD
  timestamps: string[]; // ["08:00", "16:00"]
}

export interface ShiftTemplate {
  id: string;
  name: string;
  type: 'straight' | 'split';
  times: string[]; // ["08:00", "16:00"] or ["08:00", "13:00", "16:00", "20:00"]
  duration: number;
}

export interface ShiftConfiguration {
  [employeeName: string]: string; // Maps Employee Name -> Template ID
}

export type ShiftType = 'straight' | 'split';

export interface ProcessedRecord {
  id: string;
  employeeName: string;
  date: string;
  day: string;
  timestamps: string[];
  status: string;
  totalHours: number;
  overtimeHours: number;
  shortfallHours: number;
  latenessHours: number;
  earlyDepartureHours: number;
}

export interface EmployeeSummary {
  employeeName: string;
  totalWorkDays: number;
  fridaysWorked: number;
  absentDays: number;
  totalOvertimeHours: number;
  totalShortfallHours: number;
  totalLatenessHours: number;
  totalEarlyDepartureHours: number;
  records: ProcessedRecord[];
  riskCount?: number;
}

// --- Inventory System Types ---

export interface Material {
  id: string;
  name: string;
  quantity: number;
}

export interface Invoice {
  id: string;
  material: string;
  quantityAdded: number;
  date: any; // Firestore Timestamp
  expiryDate?: string; // YYYY-MM-DD
  imageUrl?: string;
}

export interface MaterialUsage {
  id: string;
  material: string;
  amount: number;
  patientFileNumber: string;
  staffName: string;
  staffEmail: string;
  staffRole: string;
  date: any; // Firestore Timestamp
}

export interface ForecastResult {
    materialName: string;
    currentStock: number;
    avgDailyUsage: number;
    daysLeft: number;
    predictedDate: string;
    status: 'critical' | 'low' | 'good';
}

// --- NEW: Task Management Types ---

export interface DepartmentTask {
  id: string;
  title: string;
  location: string; // e.g., MRI Room 1
  assignedTo?: string; // UserId (Optional)
  assignedByName?: string; // Display Name (New)
  createdBy: string;
  createdAt: any;
  status: 'pending' | 'in_progress' | 'done';
  priority: 'low' | 'medium' | 'high';
}

// --- NEW: Open Shifts Marketplace Types ---

export interface OpenShift {
  id: string;
  date: string; // YYYY-MM-DD
  shiftTime: string; // e.g. "08:00 - 16:00"
  locationId: string;
  notes?: string;
  status: 'open' | 'claimed' | 'approved';
  claimedBy?: string; // UserId
  claimedAt?: any;
  createdBy: string;
  createdAt: any;
}

// --- Calculated Attendance Row for Supervisor ---
export interface CalculatedDailyAttendance {
    date: string;
    userId: string;
    userName: string;
    shiftsScheduled: { start: string; end: string }[];
    actualIn1: string | null;
    actualOut1: string | null;
    actualIn2: string | null;
    actualOut2: string | null;
    lateMinutes: number;
    earlyMinutes: number;
    status: 'Present' | 'Absent' | 'Incomplete' | 'Off';
}
