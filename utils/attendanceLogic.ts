
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
    // If serverTimestamp is pending (null), use clientTimestamp or fallback to now
    if (!log.timestamp) {
        if (log.clientTimestamp) {
            return log.clientTimestamp.toDate ? log.clientTimestamp.toDate() : new Date(log.clientTimestamp.seconds * 1000);
        }
        return new Date(); // Fallback for immediate UI update
    }
    return log.timestamp.toDate ? log.timestamp.toDate() : new Date(log.timestamp.seconds * 1000);
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
            
            const logDate = getLogDate(log); // Safe date extraction
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
            
            const logDate = getLogDate(log); // Safe date extraction
            const logMins = logDate.getHours() * 60 + logDate.getMinutes();

            // Must be after IN
            if (shiftInLog) {
                const inDate = getLogDate(shiftInLog); // Safe date extraction
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
    yesterdayShifts: { start: string, end: string }[] = [],
    activeActionType: string | null = null
): AttendanceStateResult => {
    if (!currentTime) return { state: 'LOADING', message: 'SYNCING', sub: 'Server Time', canPunch: false };

    // --- PRIORITY 0: CHECK FOR ADMIN ACTIONS (LEAVES/ABSENCE) ---
    if (activeActionType) {
        // Map action types to user-friendly messages
        const actionMap: Record<string, string> = {
            'annual_leave': 'ON LEAVE',
            'sick_leave': 'SICK LEAVE',
            'unjustified_absence': 'ABSENT',
            'justified_absence': 'EXCUSED ABSENCE',
            'mission': 'ON MISSION'
        };
        
        const message = actionMap[activeActionType] || activeActionType.replace('_', ' ').toUpperCase();
        const sub = 'Status Update';
        
        // If it's "Mission", they might still need to punch, otherwise lock it
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
    // Only check this if it's currently "Morning" (before 12PM) to avoid conflict with tonight's shift
    if (currentMinutes < 720) {
        const overnightShift = yesterdayShifts.find(s => {
            const start = toMins(s.start);
            const end = toMins(s.end);
            // Standard overnight OR Ends next morning
            return end < start || (start > 1000 && end < 900); 
        });

        if (overnightShift) {
            // Sort safely using safe timestamp check
            const sortedYestLogs = [...yesterdayLogs].sort((a,b) => {
                const tA = a.timestamp?.seconds || a.clientTimestamp?.seconds || 0;
                const tB = b.timestamp?.seconds || b.clientTimestamp?.seconds || 0;
                return tB - tA;
            });
            const lastInYesterday = sortedYestLogs.find(l => l.type === 'IN');

            // If we punched IN yesterday, we need to punch OUT today
            if (lastInYesterday) {
                const shiftEndMinsToday = toMins(overnightShift.end);
                const extWindow = shiftEndMinsToday + 460; // 6 hours after shift end allowed

                // Check if we already punched out TODAY linked to this
                const hasPunchedOutToday = todayLogs.some(l => {
                    if (l.type !== 'OUT') return false;
                    const lDate = getLogDate(l);
                    const lMins = lDate.getHours() * 60 + lDate.getMinutes();
                    return lMins <= 720;
                });

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

    // Sort logs safely
    const sortedLogs = [...todayLogs].sort((a, b) => {
        const tA = a.timestamp?.seconds || a.clientTimestamp?.seconds || 0;
        const tB = b.timestamp?.seconds || b.clientTimestamp?.seconds || 0;
        return tA - tB;
    });
    
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
            end += 1440; // End is next day (e.g., 01:00 becomes 1500)
        }

        // *** CRITICAL FIX FOR OVERNIGHT SHIFTS ***
        // Calculate "Effective Now" to correctly compare post-midnight hours against shift end
        let effectiveNow = now;
        
        // If shift ends next day (end > 1440) AND current time is early morning (now < start)
        if (end > 1440 && now < start) {
            effectiveNow += 1440;
        }

        // Windows
        const windowOpen = start - 30; // 30 mins before start
        const unlockOutTime = end - 15; // 15 mins before end

        const logIn = matchedShifts[i].in;
        const logOut = matchedShifts[i].out;

        // 1. Shift Completed
        if (logIn && logOut) {
            // Show done message for 1 hour, then wait for next
            const outDate = getLogDate(logOut); // Safe date extraction
            let outMins = outDate.getHours() * 60 + outDate.getMinutes();
            if (outMins < start && outMins < 300) outMins += 1440; 

            // Use effectiveNow here as well for consistency
            if (effectiveNow < outMins + 60 && !hasNextShift) {
                return { state: 'COMPLETED', message: 'SHIFT COMPLETE', sub: `Shift ${shiftNum} Done`, canPunch: false };
            }
            continue; // Check next shift
        }

        // 2. Checked In (Active)
        if (logIn && !logOut) {
            
            // Check if forgotten (90 mins past end)
            if (effectiveNow > end + 90) {
                 if (hasNextShift) {
                     const nextS = todayShifts[i+1];
                     let nextStartMins = toMins(nextS.start);
                     if (nextStartMins === 0 && now > 1000) nextStartMins = 1440; 
                     if (now >= nextStartMins - 60) continue; 
                 }
                 return { state: 'MISSED_OUT', message: 'MISSED OUT', sub: 'Forgot to punch out?', canPunch: false };
            }

            // ** STRICT LOCK: Button only opens 15 mins before end **
            if (effectiveNow < unlockOutTime && !hasOverride) {
                // Calculate time remaining
                const diff = unlockOutTime - effectiveNow;
                const h = Math.floor(diff / 60);
                const m = diff % 60;
                const timeMsg = h > 0 ? `${h}h ${m}m` : `${m}m`;

                return { 
                    state: 'LOCKED', 
                    message: 'ON DUTY', 
                    sub: `Unlock in ${timeMsg}`, // Dynamic countdown
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
                
                // First shift early
                if ((windowOpen - now) > 240) {
                     return { state: 'UPCOMING', message: 'UPCOMING', sub: `Starts today at ${shift.start}`, canPunch: false };
                }

                const h = Math.floor((windowOpen - now)/60);
                const m = (windowOpen - now)%60;
                return { state: 'LOCKED', message: 'TOO EARLY', sub: `Starts at ${shift.start} (in ${h}h ${m}m)`, canPunch: false };
            }

            // Punch In Window (Active until End)
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

    // Default Fallback
    return { state: 'OFF', message: 'OFF DUTY', sub: 'No Active Shift', canPunch: false };
};
