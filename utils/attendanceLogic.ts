
import { AttendanceLog } from '../types';

export interface AttendanceStateResult {
    state: 'LOADING' | 'READY_IN' | 'READY_OUT' | 'LOCKED' | 'COMPLETED' | 'MISSED_OUT' | 'ABSENT' | 'WAITING' | 'NEXT_SHIFT' | 'OFF' | 'UPCOMING' | 'ON_LEAVE';
    message: string;
    sub: string;
    canPunch: boolean;
    shiftIdx?: number;
    isBreak?: boolean;
    timeRemaining?: string;
    color?: string;
}

// Helper to safely extract Date object from log, handling pending serverTimestamp (null)
const getLogDate = (log: AttendanceLog): Date => {
    if (!log.timestamp) {
        if (log.clientTimestamp) {
            return log.clientTimestamp.toDate ? log.clientTimestamp.toDate() : new Date(log.clientTimestamp.seconds * 1000);
        }
        return new Date(); 
    }
    return log.timestamp.toDate ? log.timestamp.toDate() : new Date(log.timestamp.seconds * 1000);
};

// Helper to get seconds for strict chronological comparison
const getLogSeconds = (log: AttendanceLog): number => {
    if (log.timestamp) return log.timestamp.seconds;
    if (log.clientTimestamp) return log.clientTimestamp.seconds;
    return Math.floor(Date.now() / 1000);
};

// Helper to convert HH:MM to minutes from start of day (Robust Version)
export const toMins = (time: string | undefined | null): number => {
    if (!time || typeof time !== 'string' || !time.includes(':')) return 0;
    
    // Normalize 24:00 to 1440 minutes
    if (time === '24:00') return 1440;
    
    try {
        const parts = time.split(':');
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        
        if (isNaN(h) || isNaN(m)) return 0;
        
        return (h * 60) + (m || 0);
    } catch (e) {
        return 0;
    }
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
            
            const logDate = getLogDate(log); 
            const logMins = logDate.getHours() * 60 + logDate.getMinutes();
            
            // Flexible Window: 
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
                 if (logMins < 120) adjustedLogMins += 1440; 
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
        const shiftInLog = shiftLogs[index].in;
        
        const bestOut = logs.find(log => {
            if (log.type !== 'OUT' || usedLogIds.has(log.id)) return false;
            
            // CRITICAL FIX: Strict Chronological Check
            // We ensure the OUT log actually happened AFTER the IN log in absolute time.
            // This prevents an early morning OUT (from yesterday's shift) matching an evening IN (today's shift).
            if (shiftInLog) {
                const inSeconds = getLogSeconds(shiftInLog);
                const outSeconds = getLogSeconds(log);

                // Must be strictly after IN
                if (outSeconds <= inSeconds) return false;

                // Max shift duration sanity check (e.g., 18 hours max to avoid linking to next day's shift by mistake)
                if ((outSeconds - inSeconds) > 64800) return false; 

                return true;
            } else {
                // Fallback if IN is missing (Checking against shift start time)
                const logDate = getLogDate(log);
                const logMins = logDate.getHours() * 60 + logDate.getMinutes();
                const startMins = toMins(shift.start);
                
                let adjLog = logMins;
                let adjStart = startMins;
                
                // If shift starts late (e.g. 23:00) and log is early (01:00), normalize log
                if (adjLog < adjStart && adjStart > 1000) adjLog += 1440;
                
                // Must be at least 5 mins after shift start
                if (adjLog < adjStart + 5) return false;
                
                return true;
            }
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
    yesterdayShifts: { start: string, end: string }[] = [],
    activeActionType: string | null = null
): AttendanceStateResult => {
    if (!currentTime) return { state: 'LOADING', message: 'SYNCING', sub: 'Server Time', canPunch: false };

    // --- PRIORITY 0: CHECK FOR ADMIN ACTIONS (LEAVES/ABSENCE) ---
    if (activeActionType) {
        const actionMap: Record<string, string> = {
            'annual_leave': 'ON LEAVE',
            'sick_leave': 'SICK LEAVE',
            'unjustified_absence': 'ABSENT',
            'justified_absence': 'EXCUSED ABSENCE',
            'mission': 'ON MISSION'
        };
        
        const message = actionMap[activeActionType] || activeActionType.replace('_', ' ').toUpperCase();
        const sub = 'Status Update';
        const canPunch = activeActionType === 'mission' || hasOverride; 
        const color = activeActionType.includes('absence') ? 'bg-red-600 text-white' : 'bg-purple-600 text-white';

        return {
            state: 'ON_LEAVE',
            message,
            sub,
            canPunch,
            color
        };
    }

    let currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();

    // =========================================================================
    // PRIORITY 1: FINISH YESTERDAY'S OVERNIGHT SHIFT (e.g., Thu 9PM -> Fri 8AM)
    // =========================================================================
    if (currentMinutes < 720) {
        const overnightShift = yesterdayShifts.find(s => {
            const start = toMins(s.start);
            const end = toMins(s.end);
            return end < start || (start > 1000 && end < 900); 
        });

        if (overnightShift) {
            const sortedYestLogs = [...yesterdayLogs].sort((a,b) => {
                const tA = getLogSeconds(a);
                const tB = getLogSeconds(b);
                return tB - tA;
            });
            const lastInYesterday = sortedYestLogs.find(l => l.type === 'IN');

            if (lastInYesterday) {
                const shiftEndMinsToday = toMins(overnightShift.end);
                const extWindow = shiftEndMinsToday + 460; 

                // Check if we already punched out TODAY linked to this
                const hasPunchedOutToday = todayLogs.some(l => {
                    if (l.type !== 'OUT') return false;
                    // Ensure this OUT is chronologically after the IN
                    return getLogSeconds(l) > getLogSeconds(lastInYesterday);
                });

                if (!hasPunchedOutToday) {
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
    // PRIORITY 2: TODAY'S SHIFTS
    // =========================================================================

    if (todayShifts.length === 0) {
        return { state: 'OFF', message: 'OFF DUTY', sub: 'No Active Shift', canPunch: false };
    }

    // Sort logs safely by timestamp ascending
    const sortedLogs = [...todayLogs].sort((a, b) => getLogSeconds(a) - getLogSeconds(b));
    
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
             if (now > 1000) start = 1440;
        }

        // Handle Midnight Crossing for End Time
        if (end < start) {
            end += 1440; 
        }

        // *** CRITICAL FIX FOR OVERNIGHT SHIFTS ***
        let effectiveNow = now;
        if (end > 1440 && now < start) {
            effectiveNow += 1440;
        }

        const windowOpen = start - 60; // 60 mins before start allowed
        const unlockOutTime = end - 15; // 15 mins before end allowed for early out

        const logIn = matchedShifts[i].in;
        const logOut = matchedShifts[i].out;

        // 1. Shift Completed
        if (logIn && logOut) {
            // Logic to stay in "Completed" state for a while before showing "Waiting" for next shift
            const outDate = getLogDate(logOut);
            let outMins = outDate.getHours() * 60 + outDate.getMinutes();
            if (outMins < start && outMins < 300) outMins += 1440; 

            if (effectiveNow < outMins + 120 && !hasNextShift) {
                return { state: 'COMPLETED', message: 'SHIFT COMPLETE', sub: `Shift ${shiftNum} Done`, canPunch: false };
            }
            continue; 
        }

        // 2. Checked In (Active)
        if (logIn && !logOut) {
            
            // Check if forgotten (3 hours past end)
            if (effectiveNow > end + 180) {
                 if (hasNextShift) {
                     const nextS = todayShifts[i+1];
                     let nextStartMins = toMins(nextS.start);
                     if (nextStartMins === 0 && now > 1000) nextStartMins = 1440; 
                     // Only skip if the next shift has actually started
                     if (now >= nextStartMins - 30) continue; 
                 }
                 return { state: 'MISSED_OUT', message: 'MISSED OUT', sub: 'Forgot to punch out?', canPunch: false };
            }

            // ** LOCK OUT BUTTON **
            if (effectiveNow < unlockOutTime && !hasOverride) {
                const diff = unlockOutTime - effectiveNow;
                const h = Math.floor(diff / 60);
                const m = diff % 60;
                const timeMsg = h > 0 ? `${h}h ${m}m` : `${m}m`;

                return { 
                    state: 'LOCKED', 
                    message: 'ON DUTY', 
                    sub: `Unlock in ${timeMsg}`, 
                    canPunch: false, 
                    shiftIdx: shiftNum 
                };
            }

            return { state: 'READY_OUT', message: `END SHIFT ${shiftNum}`, sub: 'Record Departure', canPunch: true, shiftIdx: shiftNum };
        }

        // 3. Not Started Yet
        if (!logIn) {
            // Too Early?
            if (now < windowOpen) {
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
                
                if ((windowOpen - now) > 240) {
                     return { state: 'UPCOMING', message: 'UPCOMING', sub: `Starts today at ${shift.start}`, canPunch: false };
                }

                const h = Math.floor((windowOpen - now)/60);
                const m = (windowOpen - now)%60;
                return { state: 'LOCKED', message: 'TOO EARLY', sub: `Starts at ${shift.start} (in ${h}h ${m}m)`, canPunch: false };
            }

            // Punch In Window (Active until End + Buffer)
            if (effectiveNow <= end || hasOverride) {
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
            if (effectiveNow > end) {
                if (!isLastShift) continue; 
                return { state: 'ABSENT', message: 'ABSENT', sub: `Shift ${shiftNum} Missed`, canPunch: false };
            }
        }
    }

    return { state: 'OFF', message: 'OFF DUTY', sub: 'No Active Shift', canPunch: false };
};
