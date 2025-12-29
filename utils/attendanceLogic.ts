
import { AttendanceLog } from '../types';

export interface AttendanceStateResult {
    state: 'LOADING' | 'READY_IN' | 'READY_OUT' | 'LOCKED' | 'COMPLETED' | 'MISSED_OUT' | 'ABSENT' | 'WAITING' | 'NEXT_SHIFT' | 'OFF';
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
            
            // Allow punching in 2 hours early
            const minStart = startMins - 120; 
            const maxStart = toMins(shift.end) - 1; // Until end of shift

            // Handle Overnight Logic for Matching
            let adjustedLogMins = logMins;
            let adjustedMinStart = minStart;
            let adjustedMaxStart = maxStart;

            // If shift wraps around midnight (e.g. 22:00 to 02:00)
            if (toMins(shift.end) < startMins) {
                adjustedMaxStart += 1440;
                if (adjustedLogMins < startMins - 180) adjustedLogMins += 1440;
            }

            return adjustedLogMins >= adjustedMinStart && adjustedLogMins <= adjustedMaxStart;
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
                const inMins = inDate.getHours() * 60 + inDate.getMinutes();
                
                // Handle Crossing Midnight for comparison
                let adjLog = logMins;
                let adjIn = inMins;
                // Heuristic: If log is "small" (AM) and in is "large" (PM), add 1440 to log
                if (adjLog < adjIn && (adjIn - adjLog) > 720) adjLog += 1440;

                if (adjLog <= adjIn) return false;
            } else {
                // If no IN, fallback logic: must be after start + 5 mins
                let adjLog = logMins;
                let adjStart = startMins;
                if (adjLog < adjStart && (adjStart - adjLog) > 720) adjLog += 1440;
                
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
    hasOverride: boolean
): AttendanceStateResult => {
    if (!currentTime) return { state: 'LOADING', message: 'SYNCING', sub: 'Server Time', canPunch: false };

    let currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();

    // --- CHECK FOR YESTERDAY'S NIGHT SHIFT COMPLETION ---
    // If the user just punched OUT this morning for a shift that started yesterday
    if (todayLogs.length === 1 && todayLogs[0].type === 'OUT') {
        const outLog = todayLogs[0];
        const outTime = outLog.timestamp.toDate ? outLog.timestamp.toDate() : new Date(outLog.timestamp.seconds * 1000);
        const outMins = outTime.getHours() * 60 + outTime.getMinutes();
        
        // Show "Shift Complete" for 1 hour after punching out
        if (currentMinutes < outMins + 60) {
             return { state: 'COMPLETED', message: 'SHIFT COMPLETE', sub: 'Good Job', canPunch: false };
        }
        // After 1 hour, proceed to show "Next Shift" or Today's shift
    }

    if (todayShifts.length === 0) {
        return { state: 'OFF', message: 'NO SHIFT', sub: 'Relax Today', canPunch: false };
    }

    // Sort logs
    const sortedLogs = [...todayLogs].sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));
    const matchedShifts = matchLogsToShifts(sortedLogs, todayShifts);

    // --- MAIN SHIFT LOOP ---
    for (let i = 0; i < todayShifts.length; i++) {
        const shift = todayShifts[i];
        const shiftNum = i + 1;
        const isLastShift = i === todayShifts.length - 1;
        const hasNextShift = !isLastShift;

        // --- NORMALIZE TIMES (Handle Midnight Crossing) ---
        let start = toMins(shift.start);
        let end = toMins(shift.end);
        let now = currentMinutes;

        // If shift crosses midnight (e.g., 22:00 to 02:00)
        // We map 22:00->1320, 02:00->1560 (24*60 + 120)
        // If current time is 01:00 (60), map to 1500
        if (end < start) {
            end += 1440; 
            // If current time is "early morning" (e.g. 1 AM), treat it as "late night" relative to start
            if (now < start - 180) now += 1440; 
        }

        // --- DEFINITIONS ---
        // 1. Pre-Shift Window: 60 mins before start
        const windowOpen = start - 60;
        // 2. Lock Out Window: 15 mins before end (Unless override)
        const lockOutTime = end - 15;
        // 3. Late Out Threshold: 60 mins after end (Wait 1 hour for OUT)
        const lateOutThreshold = end + 60;
        // 4. Missed Out / Absent Transition: 
        //    - Absent: End + 60 mins
        //    - Missed Out: End + 90 mins (Wait 1hr, then show Missed Out for 30 mins)
        const absentTransition = end + 60; 
        const missedOutTransition = end + 90;

        const logIn = matchedShifts[i].in;
        const logOut = matchedShifts[i].out;

        // =========================================================
        // SCENARIO 1: SHIFT COMPLETED (Has IN & OUT)
        // =========================================================
        if (logIn && logOut) {
            // Calculate actual OUT time in normalized minutes
            const outD = logOut.timestamp.toDate ? logOut.timestamp.toDate() : new Date(logOut.timestamp.seconds * 1000);
            let outMins = outD.getHours() * 60 + outD.getMinutes();
            // Normalize outMins to match 'now' scope
            if (outMins < start && outMins < 300) outMins += 1440; 

            // Logic: "Shift Complete" -> Wait 1 hour -> "Next Shift" or "Done"
            if (now < outMins + 60) {
                return { state: 'COMPLETED', message: 'SHIFT COMPLETE', sub: `Shift ${shiftNum} Done`, canPunch: false };
            }
            
            // 1 Hour Passed
            if (hasNextShift) {
                // If there is a next shift, continue loop to let it check 'WAITING' status
                continue; 
            } else {
                return { state: 'NEXT_SHIFT', message: 'NEXT SHIFT', sub: 'See you next time', canPunch: false };
            }
        }

        // =========================================================
        // SCENARIO 2: IN PROGRESS (Has IN, No OUT)
        // =========================================================
        if (logIn && !logOut) {
            
            // A. Normal Working Time (Before Lock Window)
            // Or Locked Window (End - 15)
            if (now < end + 60) { // "Wait 1 hour after end"
                
                // Inside Lock Window (15 mins before end) -> Locked unless override
                if (now < lockOutTime && !hasOverride) {
                    return { state: 'LOCKED', message: 'ON DUTY', sub: `Shift ends ${shift.end}`, canPunch: false, shiftIdx: shiftNum };
                }
                
                // Allow Punch Out
                return { state: 'READY_OUT', message: `END SHIFT ${shiftNum}`, sub: 'Record Departure', canPunch: true, shiftIdx: shiftNum };
            }

            // B. Missed Out Phase (End + 60 to End + 90)
            // "Wait 1 hour, if no out, show missed out for 30 mins"
            if (now >= end + 60 && now < end + 90) {
                return { state: 'MISSED_OUT', message: 'MISSED OUT', sub: 'Did not punch out', canPunch: false };
            }

            // C. After Missed Out Phase (> End + 90)
            if (now >= end + 90) {
                if (hasNextShift) {
                    // Transition to waiting for next shift
                    // We fall through to next iteration which will return 'WAITING' or 'READY_IN'
                    continue; 
                } else {
                    return { state: 'NEXT_SHIFT', message: 'NEXT SHIFT', sub: 'See you next time', canPunch: false };
                }
            }
        }

        // =========================================================
        // SCENARIO 3: NOT STARTED (No IN)
        // =========================================================
        if (!logIn) {
            
            // A. Before Shift Window
            if (now < windowOpen) {
                // If we skipped previous shifts, this handles the gap
                if (i > 0) {
                    // Logic: "Waiting for second shift" -> Break
                    const diff = windowOpen - now;
                    const h = Math.floor(diff/60);
                    const m = diff%60;
                    // Only show Break if we are truly waiting (gap between shifts)
                    return { state: 'WAITING', message: 'BREAK', sub: `Next shift in ${h}h ${m}m`, canPunch: false, isBreak: true };
                }
                // First shift early
                return { state: 'LOCKED', message: 'TOO EARLY', sub: `Starts at ${shift.start}`, canPunch: false };
            }

            // B. Punch In Window (Start - 60 to End)
            if (now <= end || hasOverride) {
                return { state: 'READY_IN', message: `START SHIFT ${shiftNum}`, sub: `Shift ${shiftNum} Entry`, canPunch: true, shiftIdx: shiftNum };
            }

            // C. Absent Phase (End to End + 60)
            // "If no IN by end time -> Absent -> (1 hr later) Next"
            if (now > end && now <= end + 60) {
                return { state: 'ABSENT', message: 'ABSENT', sub: `Shift ${shiftNum} Missed`, canPunch: false };
            }

            // D. After Absent Phase (> End + 60)
            if (now > end + 60) {
                if (hasNextShift) {
                    // Go to next shift logic (which will show BREAK or READY_IN)
                    continue;
                } else {
                    return { state: 'NEXT_SHIFT', message: 'NEXT SHIFT', sub: 'See you next time', canPunch: false };
                }
            }
        }
    }

    // Default Fallback
    return { state: 'OFF', message: 'OFF DUTY', sub: 'No Active Shift', canPunch: false };
};
