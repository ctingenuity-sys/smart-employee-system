
import { AttendanceLog } from '../types';

export interface AttendanceStateResult {
    state: 'LOADING' | 'READY_IN' | 'READY_OUT' | 'LOCKED' | 'COMPLETED' | 'MISSED_OUT' | 'ABSENT' | 'WAITING' | 'NEXT_SHIFT' | 'OFF' | 'UPCOMING';
    message: string;
    sub: string;
    canPunch: boolean;
    shiftIdx?: number;
    isBreak?: boolean;
    timeRemaining?: string;
    color?: string;
}

// Helper to convert HH:MM to minutes from start of day
export const toMins = (time: string): number => {
    if (!time) return 0;
    // Normalize 24:00 to 1440 minutes
    if (time === '24:00') return 1440;
    const [h, m] = time.split(':').map(Number);
    return (h * 60) + (m || 0);
};

// --- SMART LOG MATCHING ---
const matchLogsToShifts = (
    logs: AttendanceLog[], 
    shifts: { start: string, end: string }[]
) => {
    const shiftLogs: { in?: AttendanceLog, out?: AttendanceLog }[] = shifts.map(() => ({}));
    const usedLogIds = new Set<string>();

    // 1. Assign IN Logs
    shifts.forEach((shift, index) => {
        const startMins = toMins(shift.start);
        
        const bestIn = logs.find(log => {
            if (log.type !== 'IN' || usedLogIds.has(log.id)) return false;
            const logDate = log.timestamp.toDate ? log.timestamp.toDate() : new Date(log.timestamp.seconds * 1000);
            const logMins = logDate.getHours() * 60 + logDate.getMinutes();
            
            // Flexible Window: 
            // If shift starts at midnight (0 or 1440), we look for punches late night or very early morning
            const minStart = startMins - 120; // 2 hours before
            let maxStart = toMins(shift.end); 
            
            // Handle Midnight Crossing Logic for Matching
            let adjustedLogMins = logMins;
            
            // If shift is e.g. 23:00 to 07:00
            if (toMins(shift.end) < startMins) {
                maxStart += 1440; // End is next day
                // If log is 01:00 AM, treat as 25:00 (1500 mins) relative to start day
                if (logMins < startMins - 180) adjustedLogMins += 1440; 
            }
            // If shift is 24:00 (Midnight Start)
            else if (startMins === 1440 || startMins === 0) {
                 if (logMins < 120) adjustedLogMins += 1440; // 01:00 AM becomes 25:00
            }

            return adjustedLogMins >= minStart && adjustedLogMins <= (maxStart - 1);
        });

        if (bestIn) {
            shiftLogs[index].in = bestIn;
            usedLogIds.add(bestIn.id);
        }
    });

    // 2. Assign OUT Logs
    shifts.forEach((shift, index) => {
        const startMins = toMins(shift.start);
        const shiftInLog = shiftLogs[index].in;
        
        const bestOut = logs.find(log => {
            if (log.type !== 'OUT' || usedLogIds.has(log.id)) return false;
            
            const logDate = log.timestamp.toDate ? log.timestamp.toDate() : new Date(log.timestamp.seconds * 1000);
            const logMins = logDate.getHours() * 60 + logDate.getMinutes();

            // Must be after IN
            if (shiftInLog) {
                const inDate = shiftInLog.timestamp.toDate ? shiftInLog.timestamp.toDate() : new Date(shiftInLog.timestamp.seconds * 1000);
                let inMins = inDate.getHours() * 60 + inDate.getMinutes();
                let adjLog = logMins;

                // Normalize checks crossing midnight
                if (adjLog < inMins && (inMins > 1000)) adjLog += 1440; 

                if (adjLog <= inMins) return false;
            } else {
                // Fallback: Must be after start time
                let adjLog = logMins;
                let adjStart = startMins;
                if (adjLog < adjStart && adjStart > 1000) adjLog += 1440;
                
                if (adjLog < adjStart + 5) return false;
            }
            return true;
        });

        if (bestOut) {
            shiftLogs[index].out = bestOut;
            usedLogIds.add(bestOut.id);
        }
    });

    return shiftLogs;
};

export const calculateShiftStatus = (
    currentTime: Date | null,
    todayLogs: AttendanceLog[],
    yesterdayLogs: AttendanceLog[],
    todayShifts: { start: string, end: string }[],
    hasOverride: boolean,
    yesterdayShifts: { start: string, end: string }[] = [] 
): AttendanceStateResult => {
    if (!currentTime) return { state: 'LOADING', message: 'SYNCING', sub: 'Server Time', canPunch: false };

    let currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();

    // =========================================================================
    // PRIORITY 1: FINISH YESTERDAY'S OVERNIGHT SHIFT (e.g., Thu 9PM -> Fri 8AM)
    // =========================================================================
    // Only check this if it's currently "Morning" (before 12PM) to avoid conflict with tonight's shift
    if (currentMinutes < 720) {
        const overnightShift = yesterdayShifts.find(s => {
            const start = toMins(s.start);
            const end = toMins(s.end);
            // Standard overnight OR Ends next morning
            return end < start || (start > 1000 && end < 900); 
        });

        if (overnightShift) {
            const sortedYestLogs = [...yesterdayLogs].sort((a,b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
            const lastInYesterday = sortedYestLogs.find(l => l.type === 'IN');

            // If we punched IN yesterday, we need to punch OUT today
            if (lastInYesterday) {
                const shiftEndMinsToday = toMins(overnightShift.end);
                const extWindow = shiftEndMinsToday + 460; // 6 hours after shift end allowed

                // Check if we already punched out TODAY linked to this
                const hasPunchedOutToday = todayLogs.some(l => 
                    l.type === 'OUT' && 
                    toMins(l.timestamp.toDate().toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'})) <= 720 
                );

                if (!hasPunchedOutToday) {
                    // Still need to punch out
                    if (currentMinutes < extWindow) {
                        return { 
                            state: 'READY_OUT', 
                            message: 'END YESTERDAY SHIFT', 
                            sub: `Shift ended at ${overnightShift.end}`, 
                            canPunch: true, 
                            shiftIdx: 1,
                            color: 'bg-indigo-600'
                        };
                    }
                }
            }
        }
    }

    // =========================================================================
    // PRIORITY 2: TODAY'S SHIFTS (e.g., Fri 12MN -> Sat 8AM)
    // =========================================================================

    if (todayShifts.length === 0) {
        return { state: 'OFF', message: 'OFF DUTY', sub: 'No Active Shift', canPunch: false };
    }

    const sortedLogs = [...todayLogs].sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));
    const matchedShifts = matchLogsToShifts(sortedLogs, todayShifts);

    for (let i = 0; i < todayShifts.length; i++) {
        const shift = todayShifts[i];
        const shiftNum = i + 1;
        const isLastShift = i === todayShifts.length - 1;
        const hasNextShift = !isLastShift;
        
        let start = toMins(shift.start);
        let end = toMins(shift.end);
        let now = currentMinutes;

        // Special Case: Shift starts at 24:00/00:00 (Midnight)
        if (start === 0 && end > 0) {
             // Treat 00:00 as 24:00 for calculation if we are late in the day
             if (now > 1000) start = 1440;
        }

        // Handle Midnight Crossing
        if (end < start) {
            end += 1440; // End is next day
        }

        // Windows
        const windowOpen = start - 15; // 30 mins before
        const lockOutTime = end - 15;

        const logIn = matchedShifts[i].in;
        const logOut = matchedShifts[i].out;

        // 1. Shift Completed
        if (logIn && logOut) {
            // Show done message for 1 hour, then wait for next
            const outDate = logOut.timestamp.toDate ? logOut.timestamp.toDate() : new Date(logOut.timestamp.seconds * 1000);
            let outMins = outDate.getHours() * 60 + outDate.getMinutes();
            if (outMins < start && outMins < 300) outMins += 1440; 

            if (now < outMins + 60 && !hasNextShift) {
                return { state: 'COMPLETED', message: 'SHIFT COMPLETE', sub: `Shift ${shiftNum} Done`, canPunch: false };
            }
            continue; // Check next shift
        }

        // 2. Checked In (Active) - BUT CHECK IF STALE
        if (logIn && !logOut) {
            
            // CRITICAL: Handle "Forgot to Punch Out"
            // If current time is significantly past this shift's end, 
            // AND we are in the window for the NEXT shift, assume this one is abandoned.
            if (now > end + 60) { // 90 mins buffer past end of shift
                 if (hasNextShift) {
                     const nextS = todayShifts[i+1];
                     let nextStartMins = toMins(nextS.start);
                     if (nextStartMins === 0 && now > 1000) nextStartMins = 1440; 
                     
                     // If we are within the window of the NEXT shift, skip this one
                     if (now >= nextStartMins - 60) {
                         continue; 
                     }
                 }
                 // If no next shift or too early for it, show Missed Out
                 return { state: 'MISSED_OUT', message: 'MISSED OUT', sub: 'Forgot to punch out?', canPunch: false };
            }

            if (now < lockOutTime && !hasOverride && end < 1440) {
                return { state: 'LOCKED', message: 'ON DUTY', sub: `Wait until ${shift.end}`, canPunch: false, shiftIdx: shiftNum };
            }
            
            if (end > 1440) {
                 return { state: 'LOCKED', message: 'ON DUTY (NIGHT)', sub: `Punch Out Tomorrow at ${shift.end}`, canPunch: false, shiftIdx: shiftNum };
            }

            return { state: 'READY_OUT', message: `END SHIFT ${shiftNum}`, sub: 'Record Departure', canPunch: true, shiftIdx: shiftNum };
        }

        // 3. Not Started Yet
        if (!logIn) {
            // Too Early?
            if (now < windowOpen) {
                // If it's a future shift today
                if (i > 0) {
                    const diff = windowOpen - now;
                    const h = Math.floor(diff/60);
                    const m = diff%60;
                    return { 
                        state: 'WAITING', 
                        message: 'BREAK TIME', 
                        sub: `Next shift opens in`,
                        timeRemaining: `${h}h ${m}m`, 
                        canPunch: false, 
                        isBreak: true 
                    };
                }
                
                // First shift early - Show UPCOMING instead of LOCKED/OFF
                const h = Math.floor((windowOpen - now)/60);
                const m = (windowOpen - now)%60;
                
                // If extremely early (more than 4 hours), show upcoming but not locked
                if ((windowOpen - now) > 240) {
                     return { 
                        state: 'UPCOMING', 
                        message: 'UPCOMING', 
                        sub: `Starts today at ${shift.start}`, 
                        canPunch: false 
                    };
                }

                return { 
                    state: 'LOCKED', 
                    message: 'TOO EARLY', 
                    sub: `Starts at ${shift.start} (in ${h}h ${m}m)`, 
                    canPunch: false 
                };
            }

            // Punch In Window
            if (now <= end || end > 1440 || hasOverride) {
                let isLate = false;
                if (now > start + 30) isLate = true;

                return { 
                    state: 'READY_IN', 
                    message: isLate ? `LATE ENTRY ${shiftNum}` : `START SHIFT ${shiftNum}`, 
                    sub: isLate ? 'Better late than never' : `Shift ${shiftNum} Entry`, 
                    canPunch: true, 
                    shiftIdx: shiftNum,
                    color: isLate ? 'text-amber-500' : undefined
                };
            }

            // Absent
            if (now > end && end < 1440) {
                if (!isLastShift) continue; 
                return { state: 'ABSENT', message: 'ABSENT', sub: `Shift ${shiftNum} Missed`, canPunch: false };
            }
        }
    }

    // Default Fallback
    return { state: 'OFF', message: 'OFF DUTY', sub: 'No Active Shift', canPunch: false };
};
