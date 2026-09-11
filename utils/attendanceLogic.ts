
import { AttendanceLog } from '../types';

export interface AttendanceStateResult {
    state: 'LOADING' | 'READY_IN' | 'READY_OUT' | 'LOCKED' | 'COMPLETED' | 'MISSED_OUT' | 'ABSENT' | 'WAITING' | 'NEXT_SHIFT' | 'OFF' | 'UPCOMING' | 'ON_LEAVE' | 'LATE' | 'PERMISSION' | 'MISSION' | 'SUSPENDED' | 'VIOLATION';
    message: string;
    sub: string;
    canPunch: boolean;
    shiftIdx?: number;
    isBreak?: boolean;
    timeRemaining?: string;
    color?: string;
    actionDetails?: {
        type: string;
        title?: string;
        subtitle?: string;
        hours?: number | string;
        timeFrom?: string;
        timeTo?: string;
        reason?: string;
        isViolation?: boolean;
    };
}

export interface ActiveActionRecord {
    type: string;
    title?: string;
    subtitle?: string;
    description?: string;
    reason?: string;
    hours?: number | string;
    timeFrom?: string;
    timeTo?: string;
    startDate?: string;
    endDate?: string;
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
    activeAction: string | ActiveActionRecord | null = null
): AttendanceStateResult => {
    if (!currentTime) return { state: 'LOADING', message: 'SYNCING', sub: 'Server Time', canPunch: false };

    // Active violation attachment: allows employees who returned to duty to record attendance and see their shift,
    // while their violation remains prominently displayed on their record and dashboard!
    let activeViolationAttachment: any = null;

    // --- PRIORITY 0: CHECK FOR ADMIN ACTIONS (LEAVES/ABSENCE/PERMISSIONS/DELAYS/VIOLATIONS) ---
    if (activeAction) {
        const rawType = typeof activeAction === 'string' ? activeAction : activeAction.type;
        const normalizedType = (rawType || '').toLowerCase().trim();
        const actionObj = typeof activeAction === 'object' ? activeAction : { type: rawType };

        const isSick = normalizedType.includes('sick') || normalizedType === 'مرضي' || normalizedType.includes('مرضية');
        const isAnnual = normalizedType.includes('annual') || normalizedType === 'سنوي' || normalizedType.includes('سنوية');
        const isEmergency = normalizedType.includes('emergency') || normalizedType.includes('casual') || normalizedType.includes('طارئة') || normalizedType.includes('عارضة');
        const isRegular = normalizedType.includes('regular') || normalizedType.includes('اعتيا') || normalizedType === 'leave';
        
        // True leaves MUST exclude disciplinary actions, early departures, penalties, and violations!
        const isGeneralLeave = (isSick || isAnnual || isEmergency || isRegular || 
            (normalizedType.includes('leave') && !normalizedType.includes('early_leave') && !normalizedType.includes('early')) || 
            normalizedType.includes('إجازة') || normalizedType.includes('اجازة')) && 
            !normalizedType.includes('violation') && !normalizedType.includes('مخالفة') && !normalizedType.includes('penalty') && !normalizedType.includes('جزاء');

        const isUnjustifiedAbsence = normalizedType.includes('unjustified') || normalizedType === 'absence' || (normalizedType.includes('غياب') && !normalizedType.includes('مبرر') && !normalizedType.includes('إذن') && !normalizedType.includes('اذن'));
        const isJustifiedAbsence = normalizedType.includes('justified') || normalizedType.includes('excused') || (normalizedType.includes('غياب') && (normalizedType.includes('مبرر') || normalizedType.includes('إذن') || normalizedType.includes('اذن')));

        const isLate = normalizedType.includes('delay') || normalizedType.includes('late') || normalizedType.includes('تأخير') || normalizedType.includes('تاخير');
        const isPermission = normalizedType.includes('permission') || normalizedType.includes('إذن') || normalizedType.includes('اذن') || normalizedType.includes('تصريح');
        const isMission = normalizedType.includes('mission') || normalizedType.includes('task') || normalizedType.includes('مأمورية') || normalizedType.includes('مامورية');
        const isSuspension = normalizedType.includes('suspension') || normalizedType.includes('إيقاف') || normalizedType.includes('ايقاف');

        const isViolation = normalizedType.includes('violation') || 
                            normalizedType.includes('مخالفة') || 
                            normalizedType.includes('جزاء') || 
                            normalizedType.includes('penalty') || 
                            normalizedType.includes('warning') || 
                            normalizedType.includes('تنبيه') || 
                            normalizedType.includes('إنذار') || 
                            normalizedType.includes('انذار') || 
                            normalizedType.includes('لفت نظر') || 
                            normalizedType.includes('neglect') || 
                            normalizedType.includes('إهمال') || 
                            normalizedType.includes('اهمال') || 
                            normalizedType.includes('deduction') || 
                            normalizedType.includes('خصم') || 
                            normalizedType === 'early_leave' || 
                            normalizedType.includes('early_leave') || 
                            normalizedType.includes('انصراف مبكر') || 
                            normalizedType.includes('مغادرة');

        if (isGeneralLeave) {
            let title = 'إجازة رسمية معتمدة';
            if (isSick) title = 'إجازة مرضية معتمدة';
            else if (isAnnual) title = 'إجازة سنوية معتمدة';
            else if (isEmergency) title = 'إجازة عارضة / طارئة';
            else if (isRegular) title = 'إجازة اعتيادية معتمدة';
            if (actionObj.title) title = actionObj.title;

            let sub = actionObj.subtitle || actionObj.reason || actionObj.description || 'طلب إجازة رسمي معتمد ومسجل بالسيستم';

            return {
                state: 'ON_LEAVE',
                message: title,
                sub,
                canPunch: hasOverride,
                color: 'bg-purple-600 text-white',
                actionDetails: {
                    type: rawType,
                    title,
                    subtitle: sub,
                    reason: actionObj.reason || actionObj.description,
                    hours: actionObj.hours,
                    timeFrom: actionObj.timeFrom,
                    timeTo: actionObj.timeTo
                }
            };
        }

        if (isUnjustifiedAbsence) {
            const title = actionObj.title || 'غياب غير مبرر مسجل';
            const sub = actionObj.subtitle || actionObj.description || 'تم قيد حالة غياب بدون إذن مسبق في سجل الإجراءات';

            return {
                state: 'ABSENT',
                message: title,
                sub,
                canPunch: false,
                color: 'bg-rose-600 text-white',
                actionDetails: {
                    type: rawType,
                    title,
                    subtitle: sub,
                    reason: actionObj.reason || actionObj.description
                }
            };
        }

        if (isJustifiedAbsence) {
            const title = actionObj.title || 'غياب مبرر بإذن';
            const sub = actionObj.subtitle || actionObj.description || 'غياب رسمي مبرر ومسجل في النظام';

            return {
                state: 'ON_LEAVE',
                message: title,
                sub,
                canPunch: hasOverride,
                color: 'bg-indigo-600 text-white',
                actionDetails: {
                    type: rawType,
                    title,
                    subtitle: sub,
                    reason: actionObj.reason || actionObj.description
                }
            };
        }

        if (isLate) {
            const title = actionObj.title || 'تأخير مسجل على الوردية';
            const sub = actionObj.subtitle || (actionObj.hours ? `تأخير مسجل (${actionObj.hours} دقيقة/ساعة)` : (actionObj.description || 'تم قيد تأخير رسمي في سجل الإجراءات اليومي'));

            return {
                state: 'LATE',
                message: title,
                sub,
                canPunch: true,
                color: 'bg-amber-600 text-white',
                actionDetails: {
                    type: rawType,
                    title,
                    subtitle: sub,
                    hours: actionObj.hours,
                    reason: actionObj.reason || actionObj.description
                }
            };
        }

        if (isPermission) {
            const title = actionObj.title || 'تصريح إذن ساعي نشط';
            let sub = actionObj.subtitle || actionObj.description;
            if (!sub && actionObj.timeFrom && actionObj.timeTo) {
                sub = `إذن من ${actionObj.timeFrom} إلى ${actionObj.timeTo} (${actionObj.hours || ''} س)`;
            } else if (!sub) {
                sub = 'تصريح إذن خروج ساعي موثق بالنظام';
            }

            return {
                state: 'PERMISSION',
                message: title,
                sub,
                canPunch: true,
                color: 'bg-teal-600 text-white',
                actionDetails: {
                    type: rawType,
                    title,
                    subtitle: sub,
                    hours: actionObj.hours,
                    timeFrom: actionObj.timeFrom,
                    timeTo: actionObj.timeTo,
                    reason: actionObj.reason || actionObj.description
                }
            };
        }

        if (isMission) {
            const title = actionObj.title || 'مأمورية عمل رسمية';
            const sub = actionObj.subtitle || actionObj.description || 'مكلف بمهمة عمل رسمية خارج المنشأة';

            return {
                state: 'MISSION',
                message: title,
                sub,
                canPunch: true,
                color: 'bg-blue-600 text-white',
                actionDetails: {
                    type: rawType,
                    title,
                    subtitle: sub,
                    reason: actionObj.reason || actionObj.description
                }
            };
        }

        if (isSuspension) {
            const title = actionObj.title || 'إيقاف مؤقت عن العمل';
            const sub = actionObj.subtitle || actionObj.description || 'قرار إداري بالإيقاف المؤقت';

            return {
                state: 'SUSPENDED',
                message: title,
                sub,
                canPunch: false,
                color: 'bg-red-800 text-white',
                actionDetails: {
                    type: rawType,
                    title,
                    subtitle: sub,
                    reason: actionObj.reason || actionObj.description
                }
            };
        }

        // Handle disciplinary violations:
        if (isViolation) {
            let violationTitle = 'مخالفة إدارية رسمية';
            if (normalizedType.includes('conduct') || normalizedType.includes('سلوك')) {
                violationTitle = 'مخالفة سلوكية / تعليمات';
            } else if (normalizedType.includes('early') || normalizedType.includes('مبكر') || normalizedType.includes('مغادرة')) {
                violationTitle = 'مغادرة مقر العمل بدون إذن';
            } else if (normalizedType.includes('neglect') || normalizedType.includes('إهمال') || normalizedType.includes('اهمال')) {
                violationTitle = 'إهمال وتقصير في العمل';
            } else if (normalizedType.includes('warning') || normalizedType.includes('تنبيه') || normalizedType.includes('لفت')) {
                violationTitle = 'لفت نظر / تنبيه إداري';
            } else if (normalizedType.includes('deduction') || normalizedType.includes('خصم')) {
                violationTitle = 'قرار خصم من الراتب';
            } else if (actionObj.title && actionObj.title !== 'VIOLATION' && actionObj.title !== 'action') {
                violationTitle = actionObj.title;
            }

            const violationSub = actionObj.subtitle || actionObj.description || 'تم قيد مخالفة إدارية في السجل اليومي';
            activeViolationAttachment = {
                type: rawType,
                title: violationTitle,
                subtitle: violationSub,
                isViolation: true,
                hours: actionObj.hours,
                timeFrom: actionObj.timeFrom,
                timeTo: actionObj.timeTo,
                reason: actionObj.reason || actionObj.description
            };

            // If there are NO shifts scheduled today, return the VIOLATION state immediately!
            if (todayShifts.length === 0) {
                return {
                    state: 'VIOLATION',
                    message: violationTitle,
                    sub: violationSub,
                    canPunch: true,
                    color: 'bg-rose-600 text-white',
                    actionDetails: activeViolationAttachment
                };
            }
        } else {
            // Generic fallback for any other unclassified action (NEVER default to ON_LEAVE!)
            const fallbackTitle = actionObj.title && actionObj.title !== 'action' 
                ? actionObj.title 
                : 'إجراء إداري مقيد';
            const fallbackSub = actionObj.subtitle || actionObj.description || 'إجراء إداري مسجل بالنظام';
            activeViolationAttachment = {
                type: rawType,
                title: fallbackTitle,
                subtitle: fallbackSub,
                isViolation: true,
                reason: actionObj.reason || actionObj.description
            };

            if (todayShifts.length === 0) {
                return {
                    state: 'VIOLATION',
                    message: fallbackTitle,
                    sub: fallbackSub,
                    canPunch: true,
                    color: 'bg-rose-600 text-white',
                    actionDetails: activeViolationAttachment
                };
            }
        }
    }

    const finish = (res: AttendanceStateResult): AttendanceStateResult => {
        if (!activeViolationAttachment) return res;
        if (res.state === 'OFF' || res.state === 'UPCOMING' || res.state === 'ABSENT') {
            return {
                state: 'VIOLATION',
                message: activeViolationAttachment.title || 'مخالفة إدارية رسمية',
                sub: activeViolationAttachment.subtitle || 'تم قيد مخالفة إدارية في السجل اليومي',
                canPunch: true,
                color: 'bg-rose-600 text-white',
                actionDetails: activeViolationAttachment
            };
        }
        return {
            ...res,
            actionDetails: activeViolationAttachment
        };
    };

    let currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();

    // =========================================================================
    // PRIORITY 1: FINISH YESTERDAY'S OVERNIGHT SHIFT (e.g., Thu 9PM -> Fri 8AM)
    // =========================================================================
    if (currentMinutes < 720) {
        const overnightShift = yesterdayShifts.find(s => {
            const start = toMins(s.start);
            const end = toMins(s.end);
            // Detect if shift crosses midnight (End < Start) OR (Starts late > 1000 and Ends early morning)
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
                
                // *** FIX: LOCK UNTIL 15 MINS BEFORE END ***
                // Handle case where "24:00" might come in as 1440, reset to 0 for next day calc
                const effectiveEndMins = shiftEndMinsToday >= 1440 ? 0 : shiftEndMinsToday;
                const unlockTime = effectiveEndMins - 15;
                const extWindow = shiftEndMinsToday + 460; // Allow checkout up to ~7 hours late

                // Check if we already punched out TODAY linked to this
                const hasPunchedOutToday = todayLogs.some(l => {
                    if (l.type !== 'OUT') return false;
                    // Ensure this OUT is chronologically after the IN
                    return getLogSeconds(l) > getLogSeconds(lastInYesterday);
                });

                if (!hasPunchedOutToday) {
                    if (currentMinutes < extWindow) {
                        
                        // Check for Lockout Period (e.g., it's 00:30, Shift ends 01:00, Unlock 00:45)
                        if (currentMinutes < unlockTime && !hasOverride) {
                             const diff = unlockTime - currentMinutes;
                             const h = Math.floor(diff / 60);
                             const m = diff % 60;
                             const timeMsg = h > 0 ? `${h}h ${m}m` : `${m}m`;
                             
                             return finish({
                                 state: 'LOCKED',
                                 message: 'ON DUTY',
                                 sub: `Unlock in ${timeMsg}`,
                                 canPunch: false,
                                 shiftIdx: 1
                             });
                        }

                        return finish({ 
                            state: 'READY_OUT', 
                            message: 'END YESTERDAY SHIFT', 
                            sub: `Shift ended at ${overnightShift.end}`, 
                            canPunch: true, 
                            shiftIdx: 1,
                            color: 'bg-indigo-600'
                        });
                    }
                }
            }
        }
    }

    // =========================================================================
    // PRIORITY 2: TODAY'S SHIFTS
    // =========================================================================

    if (todayShifts.length === 0) {
        return finish({ state: 'OFF', message: 'OFF DUTY', sub: 'No Active Shift', canPunch: false });
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
            // Only add 1440 if 'now' is likely part of the "next day" segment (early morning)
            // If 'now' is close to 'start' (e.g. 21:00 vs 21:30), it's the same day.
            // If 'now' is small (e.g. 01:00) and start is large (21:30), it's next day.
            
            // Threshold: If now is less than (End of Shift Day 2 + 12 hours), treat as Day 2.
            // Otherwise treat as Day 1 (Early).
            const day2Limit = (end - 1440) + 720; // 12 hours buffer
            if (now < day2Limit) {
                effectiveNow += 1440;
            }
        }

        const windowOpen = start - 60; // 60 mins before start allowed
        const unlockOutTime = end - 15; // 15 mins before end allowed for early out

        const logIn = matchedShifts[i].in;
        const logOut = matchedShifts[i].out;

        // 1. Shift Completed
        if (logIn && logOut) {
            // If it's the LAST shift, we close the day immediately and persistently.
            if (!hasNextShift) {
                return finish({ state: 'COMPLETED', message: 'SHIFT COMPLETE', sub: `Shift ${shiftNum} Done`, canPunch: false });
            }

            // For split shifts, check if the next shift's window is open
            const nextS = todayShifts[i+1];
            let nextStartMins = toMins(nextS.start);
            if (nextStartMins === 0 && now > 1000) nextStartMins = 1440;
            const nextWindowOpen = nextStartMins - 60;

            if (effectiveNow >= nextWindowOpen) {
                continue; // Move to next shift immediately if its window is open
            }

            // Otherwise, show a temporary COMPLETED state or WAITING state
            const outDate = getLogDate(logOut);
            let outMins = outDate.getHours() * 60 + outDate.getMinutes();
            if (outMins < start && outMins < 300) outMins += 1440; 

            if (effectiveNow < outMins + 30) { // Show completed for 30 mins only, then WAITING
                return finish({ state: 'COMPLETED', message: 'SHIFT COMPLETE', sub: `Shift ${shiftNum} Done`, canPunch: false });
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
                     // Only skip if the next shift has actually started or its window is open (60 mins before)
                     if (now >= nextStartMins - 60) continue; 
                 }
                 return finish({ state: 'MISSED_OUT', message: 'MISSED OUT', sub: 'Forgot to punch out?', canPunch: false });
            }

            // ** LOCK OUT BUTTON **
            if (effectiveNow < unlockOutTime && !hasOverride) {
                const diff = unlockOutTime - effectiveNow;
                const h = Math.floor(diff / 60);
                const m = diff % 60;
                const timeMsg = h > 0 ? `${h}h ${m}m` : `${m}m`;

                return finish({ 
                    state: 'LOCKED', 
                    message: 'ON DUTY', 
                    sub: `Unlock in ${timeMsg}`, 
                    canPunch: false, 
                    shiftIdx: shiftNum 
                });
            }

            return finish({ state: 'READY_OUT', message: `END SHIFT ${shiftNum}`, sub: 'Record Departure', canPunch: true, shiftIdx: shiftNum });
        }

        // 3. Not Started Yet
        if (!logIn) {
            // Too Early?
            if (now < windowOpen) {
                if (i > 0) {
                    const diff = windowOpen - now;
                    const h = Math.floor(diff/60);
                    const m = diff%60;
                    return finish({ 
                        state: 'WAITING', 
                        message: 'BREAK TIME', 
                        sub: `Next shift opens in`,
                        timeRemaining: `${h}h ${m}m`, 
                        canPunch: false, 
                        isBreak: true 
                    });
                }
                
                if ((windowOpen - now) > 240) {
                     return finish({ state: 'UPCOMING', message: 'UPCOMING', sub: `Starts today at ${shift.start}`, canPunch: false });
                }

                const h = Math.floor((windowOpen - now)/60);
                const m = (windowOpen - now)%60;
                return finish({ state: 'LOCKED', message: 'TOO EARLY', sub: `Starts at ${shift.start} (in ${h}h ${m}m)`, canPunch: false });
            }

            // Punch In Window (Active until End + Buffer)
            if (effectiveNow <= end || hasOverride) {
                let isLate = false;
                if (now > start + 30) isLate = true;

                return finish({ 
                    state: 'READY_IN', 
                    message: isLate ? `LATE ENTRY ${shiftNum}` : `START SHIFT ${shiftNum}`, 
                    sub: isLate ? 'Better late than never' : `Shift ${shiftNum} Entry`, 
                    canPunch: true, 
                    shiftIdx: shiftNum,
                    color: isLate ? 'text-amber-500' : undefined
                });
            }

          if (now >= windowOpen && now < start) {
            return finish({
                state: 'READY_IN',
                message: 'READY TO CHECK IN',
                sub: 'Early Check-in',
                canPunch: true,
                color: 'text-cyan-500'

            });
        }
            // Absent
            if (effectiveNow > end) {
                if (!isLastShift) continue; 
                return finish({ state: 'ABSENT', message: 'ABSENT', sub: `Shift ${shiftNum} Missed`, canPunch: false });
            }
        }
    }

    return finish({ state: 'OFF', message: 'OFF DUTY', sub: 'No Active Shift', canPunch: false });
};
