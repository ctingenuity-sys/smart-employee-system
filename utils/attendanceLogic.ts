
import { AttendanceLog } from '../types';

export interface AttendanceStateResult {
    state: 'LOADING' | 'READY_IN' | 'READY_OUT' | 'LOCKED' | 'COMPLETED' | 'MISSED' | 'ABSENT' | 'DISABLED' | 'ERROR' | 'WAITING';
    message: string;
    sub: string;
    canPunch: boolean;
    shiftIdx?: number;
    isBreak?: boolean;
    timeRemaining?: string;
}

export const toMins = (time: string): number => {
    if (!time) return 0;
    const [h, m] = time.split(':').map(Number);
    return (h * 60) + (m || 0);
};

const minsToTime = (totalMins: number) => {
    let h = Math.floor(totalMins / 60) % 24;
    const m = totalMins % 60;
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m.toString().padStart(2, '0')} ${ampm}`;
};

export const calculateShiftStatus = (
    currentTime: Date | null,
    todayLogs: AttendanceLog[],
    yesterdayLogs: AttendanceLog[],
    todayShifts: { start: string, end: string }[],
    hasOverride: boolean
): AttendanceStateResult => {
    if (!currentTime) return { state: 'LOADING', message: 'SYNCING', sub: 'Server Time', canPunch: false };

    const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
    
    // --- 1. Pre-process Logs (Smart Slicing) ---
    // Remove "morning out" logs that belong to yesterday's shift to reset the day for new shifts
    let effectiveLogs = [...todayLogs];
    let hasMorningOut = false;

    if (effectiveLogs.length > 0 && effectiveLogs[0].type === 'OUT') {
        const logTime = effectiveLogs[0].timestamp.toDate ? effectiveLogs[0].timestamp.toDate() : new Date(effectiveLogs[0].timestamp.seconds * 1000);
        const logH = logTime.getHours();
        
        if (logH < 10) { 
            effectiveLogs = effectiveLogs.slice(1);
            hasMorningOut = true;
        } else if (todayShifts.length > 0) {
            const s1Start = toMins(todayShifts[0].start);
            if (s1Start > 720 && toMins(`${logH}:${logTime.getMinutes()}`) < 720) {
                effectiveLogs = effectiveLogs.slice(1);
                hasMorningOut = true;
            }
        }
    }

    const logsCount = effectiveLogs.length;
    const lastLog = logsCount > 0 ? effectiveLogs[logsCount - 1] : null;

    // --- 2. Check Yesterday's Continuation (Overnight Shift) ---
    if (logsCount === 0 && yesterdayLogs.length > 0) {
        const lastYesterday = yesterdayLogs[yesterdayLogs.length - 1];
        if (lastYesterday.type === 'IN') {
            const lastInTime = lastYesterday.timestamp.toDate ? lastYesterday.timestamp.toDate().getTime() : new Date(lastYesterday.timestamp.seconds * 1000).getTime();
            const diffHours = (currentTime.getTime() - lastInTime) / (1000 * 60 * 60);
            
            if (diffHours < 18) {
                if (!hasMorningOut) {
                    return { state: 'READY_OUT', message: 'END', sub: 'Overnight Shift', canPunch: true, shiftIdx: 1 };
                }
            }
        }
    }

    // If no shifts scheduled today
    if (todayShifts.length === 0) {
        return { state: 'COMPLETED', message: 'NO SHIFT', sub: 'Relax Today', canPunch: false };
    }

    // ============================================================
    // 🛑 PHASE 0: NO LOGS (Checking Entry for Shift 1)
    // ============================================================
    if (logsCount === 0) {
        const s1 = todayShifts[0];
        const s1Start = toMins(s1.start);
        let s1End = toMins(s1.end);
        
        let adjCurrent = currentMinutes;
        if (s1End < s1Start) s1End += 1440; 
        if (s1Start > 1000 && currentMinutes < 600) {} // handle extremely early check

        const windowOpen = s1Start - 30; 
        
        // Missed Shift
        if (adjCurrent > s1End) {
            if (adjCurrent <= s1End + 60) {
                return { state: 'ABSENT', message: 'ABSENT', sub: 'Shift 1 Missed', canPunch: false };
            }
            if (todayShifts.length > 1) {
                const s2 = todayShifts[1];
                const s2Start = toMins(s2.start);
                let adjS2Start = s2Start;
                if (s2Start < s1Start) adjS2Start += 1440; 

                const s2Window = adjS2Start - 30;

                if (adjCurrent >= s2Window) {
                    return { state: 'READY_IN', message: 'START', sub: 'Shift 2', canPunch: true, shiftIdx: 2 };
                } else {
                    let waitDiff = adjS2Start - adjCurrent;
                    const h = Math.floor(waitDiff / 60);
                    const m = waitDiff % 60;
                    return { state: 'WAITING', message: 'NEXT SHIFT', sub: `Shift 2 in ${h}h ${m}m`, canPunch: false };
                }
            } else {
                return { state: 'COMPLETED', message: 'NEXT SHIFT', sub: 'See you tomorrow', canPunch: false };
            }
        }

        // Normal Entry
        if (hasOverride || adjCurrent >= windowOpen) {
            return { state: 'READY_IN', message: 'START', sub: 'Shift 1', canPunch: true, shiftIdx: 1 };
        } else {
            return { state: 'LOCKED', message: 'TOO EARLY', sub: `Starts at ${s1.start}`, canPunch: false };
        }
    }

    // ============================================================
    // 🛑 PHASE 1: LOGGED IN ONCE (Waiting for OUT S1)
    // ============================================================
    if (logsCount === 1 && lastLog?.type === 'IN') {
        const s1 = todayShifts[0];
        const s1Start = toMins(s1.start);
        let s1End = toMins(s1.end);
        
        let adjCurrent = currentMinutes;
        if (s1End < s1Start) s1End += 1440;
        if (s1Start > 1000 && currentMinutes < 900) adjCurrent += 1440;

        const unlockTime = s1End - 30; // 30 Minutes before end time

        // 1. Check if Locked (Current time < Unlock Time) - Unless Override
        if (!hasOverride && adjCurrent < unlockTime) {
            return { 
                state: 'LOCKED', 
                message: 'ON DUTY', 
                sub: `Exit opens at ${minsToTime(unlockTime)}`, 
                canPunch: false, 
                shiftIdx: 1 
            };
        }

        // 2. Before End + 60m (Grace Period for Punch Out)
        if (adjCurrent <= s1End + 60) {
            return { state: 'READY_OUT', message: 'END', sub: 'Shift 1', canPunch: true, shiftIdx: 1 };
        }
        
        // 3. Missed Out Window
        if (adjCurrent > s1End + 60 && adjCurrent <= s1End + 90) {
            return { state: 'MISSED', message: 'MISSED OUT', sub: 'Forgot Checkout', canPunch: false };
        }

        // 4. Move to Next Shift
        if (todayShifts.length > 1) {
             const s2Start = toMins(todayShifts[1].start);
             let adjS2Start = s2Start;
             if (s2Start < s1Start) adjS2Start += 1440;

             if (adjCurrent >= adjS2Start - 30) {
                 return { state: 'READY_IN', message: 'START', sub: 'Shift 2', canPunch: true, shiftIdx: 2 };
             }
             return { state: 'DISABLED', message: 'BREAK', sub: 'Waiting Shift 2', canPunch: false, isBreak: true };
        } else {
             return { state: 'COMPLETED', message: 'NEXT SHIFT', sub: 'See you tomorrow', canPunch: false };
        }
    }

    // ============================================================
    // 🛑 PHASE 2: TWO LOGS (Finished S1 -> Waiting S2)
    // ============================================================
    if (logsCount === 2) {
        if (todayShifts.length < 2) {
            const lastOutTime = lastLog!.timestamp.toDate ? lastLog!.timestamp.toDate() : new Date(lastLog!.timestamp.seconds * 1000);
            const minsSinceOut = (currentTime.getTime() - lastOutTime.getTime()) / 60000;

            if (minsSinceOut < 60) {
                return { state: 'COMPLETED', message: 'COMPLETE', sub: 'Shift Done', canPunch: false };
            } else {
                return { state: 'COMPLETED', message: 'NEXT SHIFT', sub: 'See you tomorrow', canPunch: false };
            }
        }

        // Split Shift
        const s1 = todayShifts[0];
        const s2 = todayShifts[1];
        const s1Start = toMins(s1.start);
        const s2Start = toMins(s2.start);
        
        let adjS2Start = s2Start;
        if (s2Start < s1Start) adjS2Start += 1440;

        let adjCurrent = currentMinutes;
        if (s1Start > 1000 && currentMinutes < 900) adjCurrent += 1440;

        const windowOpen = adjS2Start - 30;

        if (hasOverride || adjCurrent >= windowOpen) {
            return { state: 'READY_IN', message: 'START', sub: 'Shift 2', canPunch: true, shiftIdx: 2 };
        } else {
            let diff = adjS2Start - adjCurrent;
            const h = Math.floor(diff / 60);
            const m = diff % 60;
            return { state: 'DISABLED', message: 'BREAK', sub: `Shift 2 in ${h}h ${m}m`, canPunch: false, isBreak: true };
        }
    }

    // ============================================================
    // 🛑 PHASE 3: THREE LOGS (In S2)
    // ============================================================
    if (logsCount === 3) {
        const s2 = todayShifts[1];
        const s1Start = toMins(todayShifts[0].start);
        let s2End = toMins(s2.end);
        let s2Start = toMins(s2.start);

        if (s2Start < s1Start) s2Start += 1440;
        if (s2End < s1Start) s2End += 1440;
        if (s2End < s2Start) s2End += 1440;

        let adjCurrent = currentMinutes;
        if (s1Start > 1000 && currentMinutes < 900) adjCurrent += 1440;

        const unlockTimeS2 = s2End - 15;

        // 1. Check if Locked (Current time < Unlock Time) - Unless Override
        if (!hasOverride && adjCurrent < unlockTimeS2) {
            return { 
                state: 'LOCKED', 
                message: 'ON DUTY', 
                sub: `Exit opens at ${minsToTime(unlockTimeS2)}`, 
                canPunch: false, 
                shiftIdx: 2 
            };
        }

        if (adjCurrent <= s2End + 60) {
             return { state: 'READY_OUT', message: 'END', sub: 'Shift 2', canPunch: true, shiftIdx: 2 };
        }
        else if (adjCurrent > s2End + 60 && adjCurrent <= s2End + 90) {
             return { state: 'MISSED', message: 'MISSED OUT', sub: 'Forgot Checkout S2', canPunch: false };
        }
        else {
             return { state: 'COMPLETED', message: 'NEXT SHIFT', sub: 'See you tomorrow', canPunch: false };
        }
    }

    // ============================================================
    // 🛑 PHASE 4: FOUR LOGS (Completed)
    // ============================================================
    if (logsCount >= 4) {
        const lastOutTime = lastLog!.timestamp.toDate ? lastLog!.timestamp.toDate() : new Date(lastLog!.timestamp.seconds * 1000);
        const minsSinceOut = (currentTime.getTime() - lastOutTime.getTime()) / 60000;

        if (minsSinceOut < 60) {
            return { state: 'COMPLETED', message: 'COMPLETE', sub: 'Day Done', canPunch: false };
        } else {
            return { state: 'COMPLETED', message: 'NEXT SHIFT', sub: 'See you tomorrow', canPunch: false };
        }
    }

    return { state: 'ERROR', message: 'UNKNOWN', sub: 'Contact Admin', canPunch: false };
};
