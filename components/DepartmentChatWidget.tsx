import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { db } from '../firebase';
// @ts-ignore
import { collection, addDoc, updateDoc, deleteDoc, doc, query, where, onSnapshot, serverTimestamp, getDocs } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useDepartment } from '../contexts/DepartmentContext';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { DepartmentChatMessage, DepartmentChatGroup, User, UserRole } from '../types';
import { sendMobileNotification } from '../services/notificationService';
import { MobileNotificationModal } from './MobileNotificationModal';
import { isOperationalStaff } from '../utils/staffUtils';

// Built-in pleasant chime using Web Audio API (zero external requests, works offline)
const playChatNotificationSound = () => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // Chime tone 1
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    gain1.gain.setValueAtTime(0.08, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.16);

    // Chime tone 2
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.07); // A5
    gain2.gain.setValueAtTime(0.1, now + 0.07);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.07);
    osc2.stop(now + 0.28);
  } catch (e) {
    // Audio Context might be locked prior to user gesture
  }
};

const QUICK_EMOJIS = ['👍', '❤️', '👏', '🩺', '✅', '☕', '💡', '🙏'];

const GROUP_ICONS = [
  { id: 'users', label: 'فريق عام', icon: 'fa-users' },
  { id: 'x-ray', label: 'أشعة', icon: 'fa-x-ray' },
  { id: 'stethoscope', label: 'أطباء', icon: 'fa-stethoscope' },
  { id: 'bolt', label: 'طوارئ', icon: 'fa-bolt' },
  { id: 'calendar-check', label: 'مناوبات', icon: 'fa-calendar-check' },
  { id: 'clipboard-list', label: 'تنسيق', icon: 'fa-clipboard-list' },
  { id: 'heartbeat', label: 'عناية', icon: 'fa-heartbeat' },
  { id: 'coffee', label: 'استراحة', icon: 'fa-coffee' }
];

const GROUP_COLORS = [
  { id: 'blue', name: 'أزرق', gradient: 'from-blue-600 to-cyan-500', border: 'border-blue-500' },
  { id: 'emerald', name: 'زمردي', gradient: 'from-emerald-600 to-teal-500', border: 'border-emerald-500' },
  { id: 'purple', name: 'بنفسجي', gradient: 'from-purple-600 to-indigo-600', border: 'border-purple-500' },
  { id: 'amber', name: 'كهرماني', gradient: 'from-amber-500 to-orange-600', border: 'border-amber-500' },
  { id: 'rose', name: 'وردي', gradient: 'from-rose-600 to-pink-500', border: 'border-rose-500' },
  { id: 'slate', name: 'داكن', gradient: 'from-slate-700 to-slate-900', border: 'border-slate-600' }
];

export const DepartmentChatWidget: React.FC = () => {
  const { user, userName, role } = useAuth();
  const { selectedDepartmentId, departments, setSelectedDepartmentId } = useDepartment();
  const { isDark } = useTheme();
  const { dir } = useLanguage();

  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'group' | 'groups' | 'direct' | 'members'>('group');
  const [selectedPeer, setSelectedPeer] = useState<User | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<DepartmentChatGroup | null>(null);

  // Dock side state (Left or Right) - persisted in localStorage
  const [dockSide, setDockSide] = useState<'left' | 'right'>(() => {
    const saved = localStorage.getItem('dept_chat_dock_side');
    if (saved === 'left' || saved === 'right') return saved;
    return dir === 'rtl' ? 'left' : 'right';
  });

  const toggleDockSide = () => {
    const next = dockSide === 'left' ? 'right' : 'left';
    setDockSide(next);
    localStorage.setItem('dept_chat_dock_side', next);
  };

  const [messages, setMessages] = useState<DepartmentChatMessage[]>([]);
  const [groups, setGroups] = useState<DepartmentChatGroup[]>([]);
  const [inputText, setInputText] = useState<string>('');
  const [isUrgent, setIsUrgent] = useState<boolean>(false);
  const [replyingTo, setReplyingTo] = useState<DepartmentChatMessage | null>(null);
  const [isSending, setIsSending] = useState<boolean>(false);

  // Group Creation State
  const [isCreateGroupModalOpen, setIsCreateGroupModalOpen] = useState<boolean>(false);
  const [newGroupName, setNewGroupName] = useState<string>('');
  const [newGroupDesc, setNewGroupDesc] = useState<string>('');
  const [newGroupIcon, setNewGroupIcon] = useState<string>('users');
  const [newGroupColor, setNewGroupColor] = useState<string>('blue');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [memberSearchQuery, setMemberSearchQuery] = useState<string>('');
  const [isSubmittingGroup, setIsSubmittingGroup] = useState<boolean>(false);

  // Group Info Drawer
  const [isGroupInfoOpen, setIsGroupInfoOpen] = useState<boolean>(false);

  // Sound settings
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    return localStorage.getItem('dept_chat_sound') !== 'false';
  });

  // Department users list
  const [deptUsers, setDeptUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Unread badge count
  const [unreadCount, setUnreadCount] = useState<number>(0);

  // Mobile push notifications modal
  const [showMobileNotifModal, setShowMobileNotifModal] = useState<boolean>(false);

  // Voice recording state
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);

  // Audio playback state
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Active department identification
  const currentDept = useMemo(() => {
    return departments.find(d => d.id === selectedDepartmentId) || {
      id: selectedDepartmentId || 'general',
      name: dir === 'rtl' ? 'قسم الأشعة (العام)' : 'Radiology Department'
    };
  }, [departments, selectedDepartmentId, dir]);

  const canManageMessages = useMemo(() => {
    const norm = (role || '').toLowerCase();
    return norm === UserRole.ADMIN || norm === UserRole.SUPERVISOR || norm === UserRole.MANAGER;
  }, [role]);

  // Load department users matching Visual View logic (both hidden and visible operational staff)
  useEffect(() => {
    if (!user) return;
    const usersCol = collection(db, 'users');
    const unsubscribe = onSnapshot(usersCol, (snap) => {
      const list: User[] = snap.docs.map(d => ({ ...(d.data() as any), id: d.id, uid: d.data().uid || d.id }));
      const filtered = list.filter(u => {
        // Exclude system accounts/supervisors/managers, but include all operational staff (both hidden and visible: allowHidden = true)
        if (!isOperationalStaff(u, departments, true)) return false;

        // Department check strictly matching Visual View
        if (selectedDepartmentId && selectedDepartmentId !== 'all') {
          const inDept = u.departmentId === selectedDepartmentId || 
                         (Array.isArray(u.departments) && u.departments.includes(selectedDepartmentId)) ||
                         (selectedDepartmentId === 'legacy_radiology' && !u.departmentId);
          if (!inDept) return false;
        }

        return true;
      });
      setDeptUsers(filtered);
    }, (err) => {
      console.warn('Could not load department staff for chat:', err);
    });

    return () => unsubscribe();
  }, [user, selectedDepartmentId, departments]);

  // Real-time listener for employee groups in current department
  useEffect(() => {
    if (!user) return;
    const targetDeptId = selectedDepartmentId || 'legacy_radiology';

    const q = query(
      collection(db, 'department_chat_groups'),
      where('departmentId', '==', targetDeptId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedGroups: DepartmentChatGroup[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data() as any;
        fetchedGroups.push({
          id: docSnap.id,
          name: data.name || '',
          description: data.description || '',
          departmentId: data.departmentId || targetDeptId,
          createdBy: data.createdBy || '',
          creatorName: data.creatorName || '',
          members: Array.isArray(data.members) ? data.members : [],
          icon: data.icon || 'users',
          color: data.color || 'blue',
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          lastMessage: data.lastMessage,
          lastMessageAt: data.lastMessageAt
        });
      });

      // Sort by newest activity or creation
      fetchedGroups.sort((a, b) => {
        const timeA = a.lastMessageAt?.toMillis ? a.lastMessageAt.toMillis() : (a.createdAt?.toMillis ? a.createdAt.toMillis() : 0);
        const timeB = b.lastMessageAt?.toMillis ? b.lastMessageAt.toMillis() : (b.createdAt?.toMillis ? b.createdAt.toMillis() : 0);
        return timeB - timeA;
      });

      setGroups(fetchedGroups);

      // Keep selected group updated if it was edited
      if (selectedGroup) {
        const updated = fetchedGroups.find(g => g.id === selectedGroup.id);
        if (updated) setSelectedGroup(updated);
      }
    }, (error) => {
      console.error('Error fetching chat groups:', error);
    });

    return () => unsubscribe();
  }, [user, selectedDepartmentId, selectedGroup?.id]);

  // Listen for Service Worker Notification Click to auto-open chat window
  useEffect(() => {
    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'NOTIFICATION_CLICKED') {
        const notifData = event.data.data;
        setIsOpen(true);
        if (notifData?.groupId) {
          setActiveTab('groups');
          const grp = groups.find(g => g.id === notifData.groupId);
          if (grp) setSelectedGroup(grp);
        } else if (notifData?.senderId) {
          setActiveTab('direct');
          const peer = deptUsers.find(u => u.uid === notifData.senderId);
          if (peer) setSelectedPeer(peer);
        } else {
          setActiveTab('group');
        }
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSwMessage);
    }

    if (window.location.hash.includes('chat')) {
      setIsOpen(true);
    }

    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage);
      }
    };
  }, [groups, deptUsers]);

  // Real-time listener for department messages
  useEffect(() => {
    if (!user) return;
    const targetDeptId = selectedDepartmentId || 'legacy_radiology';

    const q = query(
      collection(db, 'department_chats'),
      where('departmentId', '==', targetDeptId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched: DepartmentChatMessage[] = [];
      let newIncomingCount = 0;
      const lastRead = Number(localStorage.getItem('dept_chat_last_read') || 0);

      snapshot.forEach(docSnap => {
        const data = docSnap.data() as any;
        const msg: DepartmentChatMessage = {
          id: docSnap.id,
          departmentId: data.departmentId,
          groupId: data.groupId,
          senderId: data.senderId,
          senderName: data.senderName,
          senderRole: data.senderRole,
          senderPhotoURL: data.senderPhotoURL,
          content: data.content,
          type: data.type || 'text',
          audioData: data.audioData,
          audioDuration: data.audioDuration,
          reactions: data.reactions || {},
          isPinned: !!data.isPinned,
          replyTo: data.replyTo,
          directRecipientId: data.directRecipientId,
          directRecipientName: data.directRecipientName,
          participants: data.participants,
          createdAt: data.createdAt
        };
        fetched.push(msg);

        // Check if unread and relevant to current user
        const msgTime = data.createdAt?.toMillis ? data.createdAt.toMillis() : Date.now();
        const isFromOthers = data.senderId !== user.uid;

        // Is message relevant to user?
        let isRelevant = false;
        if (!data.directRecipientId && !data.groupId) {
          isRelevant = true; // general department chat
        } else if (data.directRecipientId === user.uid) {
          isRelevant = true; // direct message to user
        } else if (data.groupId) {
          // If in a group, check if user is a member
          const parentGroup = groups.find(g => g.id === data.groupId);
          if (parentGroup && parentGroup.members.includes(user.uid)) {
            isRelevant = true;
          }
        }

        if (isFromOthers && isRelevant && msgTime > lastRead) {
          newIncomingCount++;
        }
      });

      // Sort by creation time
      fetched.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return timeA - timeB;
      });

      // Play chime if new incoming message arrived while window is closed
      if (fetched.length > messages.length && messages.length > 0) {
        const latest = fetched[fetched.length - 1];
        if (latest && latest.senderId !== user.uid) {
          if (soundEnabled) {
            playChatNotificationSound();
          }

          // Trigger mobile lockscreen notification if chat window is closed or document/tab is hidden
          if (!isOpen || (typeof document !== 'undefined' && document.hidden)) {
            let notifTitle = dir === 'rtl' ? 'نظام الموظفين الذكي' : 'Smart Staff System';
            if (latest.groupId) {
              const g = groups.find(item => item.id === latest.groupId);
              notifTitle = `👥 ${g ? g.name : (dir === 'rtl' ? 'مجموعة عمل' : 'Group')}: ${latest.senderName}`;
            } else if (latest.directRecipientId) {
              notifTitle = dir === 'rtl' ? `💬 رسالة خاصة من ${latest.senderName}` : `💬 Direct message from ${latest.senderName}`;
            } else {
              notifTitle = dir === 'rtl' ? `💬 ${latest.senderName} (${currentDept.name || 'دردشة القسم'})` : `💬 ${latest.senderName} (${currentDept.name || 'Department'})`;
            }

            let notifBody = latest.content || '';
            if (latest.type === 'voice') {
              notifBody = dir === 'rtl' ? `🎤 رسالة صوتية (${latest.audioDuration || 0} ثانية)` : `🎤 Voice message (${latest.audioDuration || 0}s)`;
            } else if (latest.type === 'urgent') {
              notifBody = `🚨 ${latest.content}`;
            }

            sendMobileNotification(notifTitle, {
              body: notifBody,
              icon: latest.senderPhotoURL || undefined,
              type: latest.type === 'urgent' ? 'alert' : 'chat',
              tag: `chat-${latest.groupId || latest.directRecipientId || 'general'}`,
              openChat: true,
              groupId: latest.groupId || null,
              senderId: latest.senderId
            });
          }
        }
      }

      setMessages(fetched);

      if (!isOpen) {
        setUnreadCount(newIncomingCount);
      } else {
        localStorage.setItem('dept_chat_last_read', Date.now().toString());
        setUnreadCount(0);
      }
    }, (error) => {
      console.error('Error listening to department chat:', error);
    });

    return () => unsubscribe();
  }, [user, selectedDepartmentId, soundEnabled, isOpen, messages.length, groups]);

  // Auto-scroll to latest message
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      localStorage.setItem('dept_chat_last_read', Date.now().toString());
      setUnreadCount(0);
    }
  }, [isOpen, messages, activeTab, selectedPeer, selectedGroup]);

  // Filter messages for active view
  const visibleMessages = useMemo(() => {
    if (!user) return [];
    if (activeTab === 'group') {
      // General department room: messages with no direct recipient and no groupId
      return messages.filter(m => !m.directRecipientId && !m.groupId);
    } else if (activeTab === 'groups' && selectedGroup) {
      // Group room: messages with matching groupId
      return messages.filter(m => m.groupId === selectedGroup.id);
    } else if (activeTab === 'direct' && selectedPeer) {
      // Direct room: messages between user and peer
      return messages.filter(m => {
        const isFromMeToPeer = m.senderId === user.uid && m.directRecipientId === selectedPeer.uid;
        const isFromPeerToMe = m.senderId === selectedPeer.uid && m.directRecipientId === user.uid;
        return isFromMeToPeer || isFromPeerToMe;
      });
    }
    return [];
  }, [messages, activeTab, selectedPeer, selectedGroup, user]);

  // Pinned messages in current room
  const pinnedMessages = useMemo(() => {
    if (activeTab === 'groups' && selectedGroup) {
      return messages.filter(m => m.isPinned && m.groupId === selectedGroup.id);
    }
    return messages.filter(m => m.isPinned && !m.directRecipientId && !m.groupId);
  }, [messages, activeTab, selectedGroup]);

  // Handle Send Text Message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || !user || isSending) return;

    const text = inputText.trim();
    setInputText('');
    setIsSending(true);

    const targetDeptId = selectedDepartmentId || 'legacy_radiology';

    const payload: Partial<DepartmentChatMessage> = {
      departmentId: targetDeptId,
      senderId: user.uid,
      senderName: userName || user.email?.split('@')[0] || 'عضو القسم',
      senderRole: role || 'user',
      content: text,
      type: isUrgent ? 'urgent' : 'text',
      isPinned: false,
      reactions: {},
      createdAt: serverTimestamp()
    };

    if (replyingTo) {
      payload.replyTo = {
        id: replyingTo.id,
        senderName: replyingTo.senderName,
        content: replyingTo.content.slice(0, 80)
      };
      setReplyingTo(null);
    }

    if (activeTab === 'groups' && selectedGroup) {
      payload.groupId = selectedGroup.id;
    } else if (activeTab === 'direct' && selectedPeer) {
      payload.directRecipientId = selectedPeer.uid;
      payload.directRecipientName = selectedPeer.name || selectedPeer.email;
      payload.participants = [user.uid, selectedPeer.uid];
    }

    setIsUrgent(false);

    try {
      await addDoc(collection(db, 'department_chats'), payload);

      // If in group, update group's last message
      if (activeTab === 'groups' && selectedGroup) {
        try {
          await updateDoc(doc(db, 'department_chat_groups', selectedGroup.id), {
            lastMessage: text,
            lastMessageAt: serverTimestamp()
          });
        } catch (err) {
          // non-fatal
        }
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      setInputText(text); // restore on error
    } finally {
      setIsSending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  // Toggle reactions
  const handleToggleReaction = async (msg: DepartmentChatMessage, emoji: string) => {
    if (!user) return;
    try {
      const current = msg.reactions || {};
      const usersList = current[emoji] || [];
      const hasReacted = usersList.includes(user.uid);

      const nextUsers = hasReacted
        ? usersList.filter(id => id !== user.uid)
        : [...usersList, user.uid];

      const updatedReactions = { ...current };
      if (nextUsers.length === 0) {
        delete updatedReactions[emoji];
      } else {
        updatedReactions[emoji] = nextUsers;
      }

      const docRef = doc(db, 'department_chats', msg.id);
      await updateDoc(docRef, { reactions: updatedReactions });
    } catch (err) {
      console.error('Error toggling reaction:', err);
    }
  };

  // Toggle Pin message
  const handleTogglePin = async (msg: DepartmentChatMessage) => {
    const isGroupCreator = selectedGroup && selectedGroup.createdBy === user?.uid;
    if (!canManageMessages && !isGroupCreator) return;
    try {
      const docRef = doc(db, 'department_chats', msg.id);
      await updateDoc(docRef, { isPinned: !msg.isPinned });
    } catch (err) {
      console.error('Error toggling pin:', err);
    }
  };

  // Delete message
  const handleDeleteMessage = async (msgId: string) => {
    if (!window.confirm(dir === 'rtl' ? 'هل تريد بالتأكيد حذف هذه الرسالة؟' : 'Delete this message?')) return;
    try {
      await deleteDoc(doc(db, 'department_chats', msgId));
    } catch (err) {
      console.error('Error deleting message:', err);
    }
  };

  // Voice Recording Handlers
  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());

        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = reader.result as string;
          if (base64Audio && user) {
            const targetDeptId = selectedDepartmentId || 'legacy_radiology';
            const payload: Partial<DepartmentChatMessage> = {
              departmentId: targetDeptId,
              senderId: user.uid,
              senderName: userName || 'عضو القسم',
              senderRole: role || 'user',
              content: dir === 'rtl' ? '🎤 تسجيل صوتي' : '🎤 Voice message',
              type: 'voice',
              audioData: base64Audio,
              audioDuration: recordingSeconds,
              reactions: {},
              createdAt: serverTimestamp()
            };

            if (activeTab === 'groups' && selectedGroup) {
              payload.groupId = selectedGroup.id;
            } else if (activeTab === 'direct' && selectedPeer) {
              payload.directRecipientId = selectedPeer.uid;
              payload.directRecipientName = selectedPeer.name || selectedPeer.email;
              payload.participants = [user.uid, selectedPeer.uid];
            }

            try {
              await addDoc(collection(db, 'department_chats'), payload);

              if (activeTab === 'groups' && selectedGroup) {
                await updateDoc(doc(db, 'department_chat_groups', selectedGroup.id), {
                  lastMessage: dir === 'rtl' ? '🎤 تسجيل صوتي' : '🎤 Voice message',
                  lastMessageAt: serverTimestamp()
                });
              }
            } catch (err) {
              console.error('Failed to send voice message:', err);
            }
          }
        };
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
    } catch (err) {
      alert(dir === 'rtl' ? 'يرجى السماح بالوصول إلى الميكروفون لإرسال رسالة صوتية.' : 'Please allow microphone access.');
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    }
  };

  const cancelVoiceRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      audioChunksRef.current = [];
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    }
  };

  // Play audio voice message
  const handlePlayAudio = (msgId: string, audioData?: string) => {
    if (!audioData) return;
    if (playingAudioId === msgId) {
      audioPlayerRef.current?.pause();
      setPlayingAudioId(null);
      return;
    }

    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
    }

    const audio = new Audio(audioData);
    audioPlayerRef.current = audio;
    setPlayingAudioId(msgId);

    audio.onended = () => {
      setPlayingAudioId(null);
    };

    audio.play().catch(e => {
      console.warn('Playback error', e);
      setPlayingAudioId(null);
    });
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem('dept_chat_sound', next.toString());
  };

  // Format timestamps
  const formatTime = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Handle Group Creation
  const handleOpenCreateGroup = () => {
    setNewGroupName('');
    setNewGroupDesc('');
    setNewGroupIcon('users');
    setNewGroupColor('blue');
    setSelectedMemberIds(user?.uid ? [user.uid] : []);
    setMemberSearchQuery('');
    setIsCreateGroupModalOpen(true);
  };

  const toggleMemberSelection = (uid: string) => {
    if (uid === user?.uid) return; // creator is always member
    setSelectedMemberIds(prev => 
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    );
  };

  const handleSelectAllMembers = () => {
    const allUids = deptUsers.map(u => u.uid).filter(Boolean);
    if (user?.uid && !allUids.includes(user.uid)) {
      allUids.push(user.uid);
    }
    setSelectedMemberIds(allUids);
  };

  const handleDeselectAllMembers = () => {
    setSelectedMemberIds(user?.uid ? [user.uid] : []);
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim() || !user || isSubmittingGroup) return;

    setIsSubmittingGroup(true);
    const targetDeptId = selectedDepartmentId || 'legacy_radiology';

    const finalMembers = Array.from(new Set([...selectedMemberIds, user.uid]));

    try {
      const groupData: Partial<DepartmentChatGroup> = {
        name: newGroupName.trim(),
        description: newGroupDesc.trim(),
        icon: newGroupIcon,
        color: newGroupColor,
        departmentId: targetDeptId,
        createdBy: user.uid,
        creatorName: userName || user.email?.split('@')[0] || 'عضو القسم',
        members: finalMembers,
        createdAt: serverTimestamp(),
        lastMessage: dir === 'rtl' ? 'تم إنشاء المجموعة' : 'Group created',
        lastMessageAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, 'department_chat_groups'), groupData);

      // Send initial announcement message
      await addDoc(collection(db, 'department_chats'), {
        departmentId: targetDeptId,
        groupId: docRef.id,
        senderId: user.uid,
        senderName: userName || 'النظام',
        content: dir === 'rtl'
          ? `🎉 مرحباً بكم في مجموعة "${newGroupName.trim()}"! تم إنشاء المجموعة بواسطة ${userName || 'أحد الأعضاء'}.`
          : `🎉 Welcome to "${newGroupName.trim()}"! Group created by ${userName || 'a team member'}.`,
        type: 'announcement',
        createdAt: serverTimestamp()
      });

      const newGroupObj: DepartmentChatGroup = {
        id: docRef.id,
        ...groupData
      } as DepartmentChatGroup;

      setIsCreateGroupModalOpen(false);
      setActiveTab('groups');
      setSelectedGroup(newGroupObj);
    } catch (err) {
      console.error('Failed to create group:', err);
      alert(dir === 'rtl' ? 'حدث خطأ أثناء إنشاء المجموعة.' : 'Failed to create group.');
    } finally {
      setIsSubmittingGroup(false);
    }
  };

  // Delete Group
  const handleDeleteGroup = async (group: DepartmentChatGroup) => {
    const isCreator = group.createdBy === user?.uid;
    if (!isCreator && !canManageMessages) {
      alert(dir === 'rtl' ? 'فقط منشئ المجموعة أو المشرف يمكنه حذفها.' : 'Only the group creator or supervisor can delete it.');
      return;
    }
    if (!window.confirm(dir === 'rtl' ? `هل أنت متأكد من حذف مجموعة "${group.name}"؟` : `Delete group "${group.name}"?`)) return;

    try {
      await deleteDoc(doc(db, 'department_chat_groups', group.id));
      if (selectedGroup?.id === group.id) {
        setSelectedGroup(null);
      }
    } catch (err) {
      console.error('Error deleting group:', err);
    }
  };

  // Leave Group
  const handleLeaveGroup = async (group: DepartmentChatGroup) => {
    if (!user) return;
    if (!window.confirm(dir === 'rtl' ? `هل تريد بالتأكيد مغادرة مجموعة "${group.name}"؟` : `Leave group "${group.name}"?`)) return;

    try {
      const nextMembers = group.members.filter(id => id !== user.uid);
      await updateDoc(doc(db, 'department_chat_groups', group.id), {
        members: nextMembers
      });
      if (selectedGroup?.id === group.id) {
        setSelectedGroup(null);
      }
      setIsGroupInfoOpen(false);
    } catch (err) {
      console.error('Error leaving group:', err);
    }
  };

  // Filtered members for direct message list
  const filteredStaff = useMemo(() => {
    return deptUsers.filter(u => {
      if (u.uid === user?.uid) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        (u.name && u.name.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.role && u.role.toLowerCase().includes(q))
      );
    });
  }, [deptUsers, searchQuery, user]);

  // Filtered members for group creator modal
  const filteredForGroupCreation = useMemo(() => {
    if (!memberSearchQuery.trim()) return deptUsers;
    const q = memberSearchQuery.toLowerCase();
    return deptUsers.filter(u => 
      (u.name && u.name.toLowerCase().includes(q)) ||
      (u.email && u.email.toLowerCase().includes(q)) ||
      (u.role && u.role.toLowerCase().includes(q))
    );
  }, [deptUsers, memberSearchQuery]);

  // Selected group color preset
  const activeGroupColorPreset = useMemo(() => {
    if (!selectedGroup) return GROUP_COLORS[0];
    return GROUP_COLORS.find(c => c.id === selectedGroup.color) || GROUP_COLORS[0];
  }, [selectedGroup]);

  return (
    <>
      {/* 1. Floating Trigger Button */}
      {/* Positioned vertically ABOVE "المناوبون الآن" (which sits at bottom-4) at bottom-20/22 with high z-index (10025) */}
      <div 
        className={`fixed bottom-20 sm:bottom-22 ${
          dockSide === 'left' ? 'left-4 sm:left-6' : 'right-4 sm:right-6'
        } z-[10025] flex items-center gap-2 print:hidden`}
      >
        {/* Toggle Side dock handle */}
        <button
          onClick={toggleDockSide}
          title={dir === 'rtl' ? 'نقل مكان الزر (يمين / يسار)' : 'Move widget (Left / Right)'}
          className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] transition-all duration-300 shadow-md backdrop-blur-md ${
            isDark 
              ? 'bg-slate-900/90 text-slate-400 hover:text-white border border-slate-700' 
              : 'bg-white/90 text-slate-500 hover:text-slate-800 border border-slate-200'
          }`}
        >
          <i className="fas fa-arrows-alt-h"></i>
        </button>

        {/* Main Floating Trigger */}
        <button
          id="floating-chat-trigger-btn"
          onClick={() => {
            setIsOpen(prev => !prev);
            if (!isOpen) {
              setUnreadCount(0);
              localStorage.setItem('dept_chat_last_read', Date.now().toString());
            }
          }}
          className={`group relative w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 transform active:scale-95 shadow-[0_10px_30px_rgba(37,99,235,0.4)] ${
            isOpen
              ? 'bg-slate-800 text-white rotate-90 border-2 border-slate-600'
              : 'bg-gradient-to-tr from-cyan-600 via-blue-600 to-indigo-600 text-white hover:scale-105 hover:shadow-[0_15px_35px_rgba(37,99,235,0.6)]'
          }`}
          title={dir === 'rtl' ? 'شات وقروبات القسم المباشر' : 'Department & Groups Live Chat'}
          aria-label="Department Chat"
        >
          {isOpen ? (
            <i className="fas fa-times text-xl"></i>
          ) : (
            <>
              <i className="fas fa-comments text-2xl transition-transform group-hover:scale-110"></i>
              {/* Online pulse indicator */}
              <span className="absolute bottom-1 right-1 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-slate-900 shadow-xs"></span>
            </>
          )}

          {/* Unread badge */}
          {!isOpen && unreadCount > 0 && (
            <span 
              id="chat-unread-badge"
              className="absolute -top-1.5 -right-1.5 rtl:-left-1.5 rtl:right-auto min-w-[22px] h-[22px] px-1 rounded-full bg-rose-500 text-white text-[11px] font-black flex items-center justify-center border-2 border-slate-900 shadow-lg animate-bounce"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* 2. Floating Chat Window */}
      {isOpen && (
        <div
          id="floating-department-chat-window"
          className={`fixed z-[10030] ${
            isExpanded
              ? 'inset-4 sm:inset-10'
              : `bottom-20 sm:bottom-24 ${
                  dockSide === 'left' ? 'left-4 sm:left-6' : 'right-4 sm:right-6'
                } w-[calc(100vw-32px)] sm:w-[440px] h-[620px] max-h-[calc(100vh-120px)]`
          } rounded-3xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5)] border flex flex-col overflow-hidden transition-all duration-300 backdrop-blur-xl animate-in fade-in zoom-in-95 print:hidden ${
            isDark
              ? 'bg-slate-950/95 border-slate-800 text-slate-100 shadow-[0_20px_50px_rgba(0,0,0,0.8)]'
              : 'bg-white/95 border-slate-200 text-slate-800 shadow-[0_20px_40px_rgba(0,0,0,0.15)]'
          }`}
          dir={dir}
        >
          {/* Header */}
          <div className={`px-4 py-3.5 border-b flex items-center justify-between shrink-0 ${
            isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-slate-50/90 border-slate-200'
          }`}>
            <div className="flex items-center gap-2.5 min-w-0">
              {/* Icon badge */}
              <div className={`w-10 h-10 rounded-2xl bg-gradient-to-tr ${
                activeTab === 'groups' && selectedGroup
                  ? activeGroupColorPreset.gradient
                  : 'from-cyan-500 to-blue-600'
              } text-white flex items-center justify-center shrink-0 shadow-md`}>
                <i className={`fas ${
                  activeTab === 'groups' && selectedGroup
                    ? `fa-${selectedGroup.icon || 'users'}`
                    : (activeTab === 'direct' ? 'fa-user' : 'fa-hospital-user')
                } text-base`}></i>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-black truncate">
                    {activeTab === 'direct' && selectedPeer ? (
                      <span className="flex items-center gap-1.5 text-blue-500">
                        {selectedPeer.name || selectedPeer.email}
                      </span>
                    ) : (activeTab === 'groups' && selectedGroup ? (
                      <span className="flex items-center gap-1.5">
                        {selectedGroup.name}
                      </span>
                    ) : (
                      currentDept.name
                    ))}
                  </h3>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
                </div>
                <p className="text-[10px] font-medium text-slate-400 truncate">
                  {activeTab === 'direct' && selectedPeer 
                    ? (selectedPeer.role ? `${selectedPeer.role} • محادثة خاصة` : 'محادثة خاصة')
                    : (activeTab === 'groups' && selectedGroup 
                        ? `${selectedGroup.members.length} أعضاء • مجموعة عمل`
                        : (dir === 'rtl' ? 'محادثة القسم الفورية • متصل الآن' : 'Live Room • Online'))}
                </p>
              </div>
            </div>

            {/* Department Switcher & Window Controls */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Switch side dock */}
              <button
                onClick={toggleDockSide}
                className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs transition-colors ${
                  isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200'
                }`}
                title={dir === 'rtl' ? 'تبديل مكان النافذة (يمين / يسار)' : 'Dock (Left / Right)'}
              >
                <i className="fas fa-arrows-alt-h"></i>
              </button>

              {/* Mobile Push Notification Setup */}
              <button
                onClick={() => setShowMobileNotifModal(true)}
                className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs transition-colors ${
                  isDark ? 'text-blue-400 hover:bg-slate-800' : 'text-blue-600 hover:bg-slate-200'
                }`}
                title={dir === 'rtl' ? 'إعدادات إشعارات الجوال (حتى والتطبيق مقفل) 📱' : 'Mobile Push Notifications'}
              >
                <i className="fas fa-mobile-screen"></i>
              </button>

              {/* Sound Toggle */}
              <button
                onClick={toggleSound}
                className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs transition-colors ${
                  soundEnabled
                    ? (isDark ? 'text-amber-400 hover:bg-slate-800' : 'text-amber-600 hover:bg-slate-200')
                    : (isDark ? 'text-slate-500 hover:bg-slate-800' : 'text-slate-400 hover:bg-slate-200')
                }`}
                title={soundEnabled ? (dir === 'rtl' ? 'كتم صوت الإشعارات' : 'Mute sound') : (dir === 'rtl' ? 'تفعيل صوت الإشعارات' : 'Enable sound')}
              >
                <i className={`fas ${soundEnabled ? 'fa-bell' : 'fa-bell-slash'}`}></i>
              </button>

              {/* Expand Toggle */}
              <button
                onClick={() => setIsExpanded(prev => !prev)}
                className={`hidden sm:flex w-7 h-7 rounded-lg items-center justify-center text-xs transition-colors ${
                  isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200'
                }`}
                title={isExpanded ? (dir === 'rtl' ? 'تصغير' : 'Restore') : (dir === 'rtl' ? 'تكبير' : 'Expand')}
              >
                <i className={`fas ${isExpanded ? 'fa-compress-alt' : 'fa-expand-alt'}`}></i>
              </button>

              {/* Close Button */}
              <button
                onClick={() => setIsOpen(false)}
                className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs transition-colors ${
                  isDark ? 'text-slate-400 hover:text-rose-400 hover:bg-rose-950/40' : 'text-slate-500 hover:text-rose-600 hover:bg-rose-50'
                }`}
                title={dir === 'rtl' ? 'إغلاق' : 'Close'}
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className={`flex items-center px-2 py-1.5 border-b gap-1 shrink-0 overflow-x-auto no-scrollbar ${
            isDark ? 'bg-slate-950 border-slate-800/80' : 'bg-slate-100/70 border-slate-200'
          }`}>
            {/* Tab 1: General Department Room */}
            <button
              onClick={() => {
                setActiveTab('group');
                setSelectedPeer(null);
                setSelectedGroup(null);
              }}
              className={`flex-1 py-1.5 px-2 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1 shrink-0 ${
                activeTab === 'group'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : (isDark ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-900' : 'text-slate-600 hover:text-slate-900 hover:bg-white')
              }`}
            >
              <i className="fas fa-hospital text-[10px]"></i>
              <span>{dir === 'rtl' ? 'القسم' : 'Dept'}</span>
            </button>

            {/* Tab 2: Employee Groups (الجروبات) */}
            <button
              onClick={() => {
                setActiveTab('groups');
                setSelectedPeer(null);
              }}
              className={`flex-1 py-1.5 px-2 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 shrink-0 ${
                activeTab === 'groups'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : (isDark ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-900' : 'text-slate-600 hover:text-slate-900 hover:bg-white')
              }`}
            >
              <i className="fas fa-users-cog text-[10px]"></i>
              <span>{dir === 'rtl' ? 'الجروبات' : 'Groups'}</span>
              <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-black ${
                activeTab === 'groups' ? 'bg-white/20 text-white' : 'bg-slate-700/50 text-slate-300'
              }`}>
                {groups.length}
              </span>
            </button>

            {/* Tab 3: Direct Messages (DM) */}
            <button
              onClick={() => {
                setActiveTab('direct');
                setSelectedGroup(null);
              }}
              className={`flex-1 py-1.5 px-2 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1 shrink-0 ${
                activeTab === 'direct'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : (isDark ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-900' : 'text-slate-600 hover:text-slate-900 hover:bg-white')
              }`}
            >
              <i className="fas fa-user-friends text-[10px]"></i>
              <span>{dir === 'rtl' ? 'خاص' : 'Direct'}</span>
            </button>

            {/* Tab 4: Staff Directory */}
            <button
              onClick={() => {
                setActiveTab('members');
                setSelectedPeer(null);
                setSelectedGroup(null);
              }}
              className={`py-1.5 px-2.5 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1 shrink-0 ${
                activeTab === 'members'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : (isDark ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-900' : 'text-slate-600 hover:text-slate-900 hover:bg-white')
              }`}
              title={dir === 'rtl' ? 'أعضاء القسم' : 'Members'}
            >
              <i className="fas fa-id-card-alt text-[10px]"></i>
              <span className="text-[10px] px-1 py-0.2 rounded-full bg-slate-700/50 text-slate-200">
                {deptUsers.length}
              </span>
            </button>
          </div>

          {/* Body Content */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">

            {/* View 1: Active Chat Feed (General Department, Selected Group, or Direct Peer) */}
            {(activeTab === 'group' || (activeTab === 'groups' && selectedGroup) || (activeTab === 'direct' && selectedPeer)) && (
              <>
                {/* Sub-header Bar for Selected Group */}
                {activeTab === 'groups' && selectedGroup && (
                  <div className={`px-3 py-1.5 border-b flex items-center justify-between text-xs ${
                    isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <button
                      onClick={() => setSelectedGroup(null)}
                      className="text-indigo-400 hover:underline flex items-center gap-1.5 font-bold"
                    >
                      <i className={`fas fa-chevron-${dir === 'rtl' ? 'right' : 'left'} text-[10px]`}></i>
                      <span>{dir === 'rtl' ? 'قائمة الجروبات' : 'All Groups'}</span>
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setIsGroupInfoOpen(true)}
                        className="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-colors flex items-center gap-1"
                        title={dir === 'rtl' ? 'معلومات وأعضاء المجموعة' : 'Group Info'}
                      >
                        <i className="fas fa-info-circle text-[10px]"></i>
                        <span>{selectedGroup.members.length} {dir === 'rtl' ? 'عضو' : 'members'}</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Sub-header Bar for Direct Peer */}
                {activeTab === 'direct' && selectedPeer && (
                  <div className={`px-3 py-1.5 border-b flex items-center justify-between text-xs ${
                    isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <button
                      onClick={() => setSelectedPeer(null)}
                      className="text-blue-500 hover:underline flex items-center gap-1 font-bold"
                    >
                      <i className={`fas fa-chevron-${dir === 'rtl' ? 'right' : 'left'} text-[10px]`}></i>
                      <span>{dir === 'rtl' ? 'الرجوع إلى قائمة الأعضاء' : 'Back to Direct Messages'}</span>
                    </button>
                    <span className="text-slate-400 text-[11px]">
                      {selectedPeer.email}
                    </span>
                  </div>
                )}

                {/* Pinned Messages Banner */}
                {pinnedMessages.length > 0 && (
                  <div className={`px-3.5 py-2 border-b flex items-center gap-2.5 text-xs ${
                    isDark ? 'bg-amber-950/30 border-amber-900/40 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800'
                  }`}>
                    <i className="fas fa-thumbtack text-amber-500 shrink-0"></i>
                    <div className="min-w-0 flex-1">
                      <span className="font-bold text-[11px] block">{dir === 'rtl' ? 'تنبيه مثبت:' : 'Pinned Notice:'}</span>
                      <p className="truncate text-[11px] opacity-90">{pinnedMessages[pinnedMessages.length - 1].content}</p>
                    </div>
                  </div>
                )}

                {/* Messages Scroll Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
                  {visibleMessages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                      <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500 mb-3">
                        <i className={`fas ${activeTab === 'groups' ? 'fa-users' : 'fa-comment-dots'} text-2xl`}></i>
                      </div>
                      <h4 className="font-bold text-sm text-slate-300">
                        {activeTab === 'groups' && selectedGroup
                          ? (dir === 'rtl' ? `مجموعة ${selectedGroup.name}` : `${selectedGroup.name} Group`)
                          : (activeTab === 'direct' && selectedPeer
                              ? (dir === 'rtl' ? `محادثة خاصة مع ${selectedPeer?.name}` : `Direct message with ${selectedPeer?.name}`)
                              : (dir === 'rtl' ? 'غرفة القسم العامة' : 'Department General Room'))}
                      </h4>
                      <p className="text-xs text-slate-500 max-w-[240px] mt-1">
                        {activeTab === 'groups'
                          ? (dir === 'rtl' ? 'يمكن لجميع أعضاء المجموعة تبادل الرسائل والملفات الصوتية والتنبيهات السريعة.' : 'Group members can exchange messages, voice notes and quick updates.')
                          : (dir === 'rtl' 
                              ? 'يمكنكم مشاركة الملاحظات والتنبيهات السريعة ومتابعة سير العمل لحظياً.' 
                              : 'Share quick updates, notices and coordinate workflow in real-time.')}
                      </p>
                    </div>
                  ) : (
                    visibleMessages.map((msg) => {
                      const isMe = msg.senderId === user?.uid;
                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col group ${isMe ? 'items-end' : 'items-start'}`}
                        >
                          {/* Sender Info (for incoming messages) */}
                          {!isMe && (
                            <div className="flex items-center gap-1.5 mb-1 px-1">
                              <span className="text-[11px] font-bold text-slate-300">
                                {msg.senderName}
                              </span>
                              {msg.senderRole && (
                                <span className={`text-[9px] px-1.5 py-0.2 rounded-md font-bold uppercase ${
                                  msg.senderRole === 'supervisor' || msg.senderRole === 'admin'
                                    ? 'bg-amber-500/20 text-amber-400'
                                    : 'bg-slate-700/60 text-slate-300'
                                }`}>
                                  {msg.senderRole}
                                </span>
                              )}
                              <span className="text-[9px] text-slate-500">{formatTime(msg.createdAt)}</span>
                            </div>
                          )}

                          {/* Message Bubble Box */}
                          <div className={`relative max-w-[85%] sm:max-w-[78%] rounded-2xl p-3 shadow-xs transition-all ${
                            msg.type === 'urgent'
                              ? 'border-2 border-rose-500 bg-rose-950/40 text-rose-100 shadow-[0_0_15px_rgba(244,63,94,0.3)]'
                              : msg.type === 'announcement'
                                ? 'bg-amber-500/15 border border-amber-500/30 text-amber-200 text-center mx-auto my-1'
                                : isMe
                                  ? (activeTab === 'groups' 
                                      ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-tr-xs rtl:rounded-tr-2xl rtl:rounded-tl-xs'
                                      : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-tr-xs rtl:rounded-tr-2xl rtl:rounded-tl-xs')
                                  : (isDark 
                                      ? 'bg-slate-900 border border-slate-800 text-slate-100 rounded-tl-xs rtl:rounded-tl-2xl rtl:rounded-tr-xs' 
                                      : 'bg-slate-100 border border-slate-200 text-slate-800 rounded-tl-xs rtl:rounded-tl-2xl rtl:rounded-tr-xs')
                          }`}>

                            {/* Urgent Badge Header */}
                            {msg.type === 'urgent' && (
                              <div className="flex items-center gap-1 text-[10px] font-black text-rose-400 uppercase tracking-wider mb-1">
                                <i className="fas fa-exclamation-triangle animate-pulse"></i>
                                <span>{dir === 'rtl' ? 'تنبيه عاجل' : 'URGENT NOTICE'}</span>
                              </div>
                            )}

                            {/* Announcement Header */}
                            {msg.type === 'announcement' && (
                              <div className="flex items-center justify-center gap-1 text-[10px] font-black text-amber-400 uppercase tracking-wider mb-1">
                                <i className="fas fa-bullhorn"></i>
                                <span>{dir === 'rtl' ? 'تنبيه إداري' : 'ANNOUNCEMENT'}</span>
                              </div>
                            )}

                            {/* Quoted / Replied Message */}
                            {msg.replyTo && (
                              <div className={`mb-2 p-1.5 rounded-lg text-[11px] border-l-2 rtl:border-l-0 rtl:border-r-2 ${
                                isMe 
                                  ? 'bg-black/20 border-white/60 text-white/90' 
                                  : (isDark ? 'bg-slate-800/90 border-blue-400 text-slate-300' : 'bg-slate-200 border-blue-500 text-slate-700')
                              }`}>
                                <span className="font-bold block text-[10px] opacity-80">{msg.replyTo.senderName}</span>
                                <p className="truncate opacity-90">{msg.replyTo.content}</p>
                              </div>
                            )}

                            {/* Content Body */}
                            {msg.type === 'voice' && msg.audioData ? (
                              <div className="flex items-center gap-3 py-1">
                                <button
                                  onClick={() => handlePlayAudio(msg.id, msg.audioData)}
                                  className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95 ${
                                    isMe
                                      ? 'bg-white text-indigo-600'
                                      : 'bg-indigo-600 text-white'
                                  }`}
                                >
                                  <i className={`fas ${playingAudioId === msg.id ? 'fa-pause' : 'fa-play'} text-xs ml-0.5 rtl:mr-0.5 rtl:ml-0`}></i>
                                </button>
                                <div className="flex-1 min-w-[120px]">
                                  <div className="flex items-center gap-1 mb-1">
                                    <div className="w-1.5 h-3 bg-current opacity-40 rounded-full animate-pulse"></div>
                                    <div className="w-1.5 h-4 bg-current opacity-70 rounded-full"></div>
                                    <div className="w-1.5 h-6 bg-current rounded-full"></div>
                                    <div className="w-1.5 h-3 bg-current opacity-50 rounded-full"></div>
                                    <div className="w-1.5 h-5 bg-current opacity-80 rounded-full"></div>
                                    <div className="w-1.5 h-2 bg-current opacity-30 rounded-full"></div>
                                    <div className="w-1.5 h-4 bg-current opacity-60 rounded-full"></div>
                                  </div>
                                  <span className="text-[10px] opacity-80 font-mono">
                                    {msg.audioDuration ? `${msg.audioDuration}s` : 'تسجيل صوتي'}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs leading-relaxed whitespace-pre-wrap break-words">
                                {msg.content}
                              </p>
                            )}

                            {/* Timestamp for own message */}
                            {isMe && (
                              <div className="text-[9px] text-white/70 text-left rtl:text-right mt-1 flex items-center justify-end rtl:justify-start gap-1">
                                <span>{formatTime(msg.createdAt)}</span>
                                <i className="fas fa-check-double text-[8px]"></i>
                              </div>
                            )}

                            {/* Emoji Reactions List */}
                            {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5 pt-1 border-t border-white/10">
                                {Object.entries(msg.reactions).map(([emoji, uids]) => (
                                  <button
                                    key={emoji}
                                    onClick={() => handleToggleReaction(msg, emoji)}
                                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 border transition-all ${
                                      uids.includes(user?.uid || '')
                                        ? 'bg-blue-500/20 border-blue-400 text-blue-300'
                                        : 'bg-black/10 border-transparent opacity-80 hover:opacity-100'
                                    }`}
                                  >
                                    <span>{emoji}</span>
                                    <span>{uids.length}</span>
                                  </button>
                                ))}
                              </div>
                            )}

                            {/* Hover Quick Actions Bar */}
                            <div className={`absolute top-0 ${isMe ? '-left-16 rtl:-right-16 rtl:left-auto' : '-right-16 rtl:-left-16 rtl:right-auto'} hidden group-hover:flex items-center gap-1 p-1 rounded-xl bg-slate-800/90 border border-slate-700 shadow-md backdrop-blur-md z-10`}>
                              <button
                                onClick={() => handleToggleReaction(msg, '👍')}
                                className="w-5 h-5 flex items-center justify-center text-[10px] text-slate-300 hover:text-white"
                                title="Like"
                              >
                                👍
                              </button>
                              <button
                                onClick={() => setReplyingTo(msg)}
                                className="w-5 h-5 flex items-center justify-center text-[10px] text-slate-300 hover:text-white"
                                title="Reply"
                              >
                                <i className="fas fa-reply"></i>
                              </button>
                              {(canManageMessages || (selectedGroup && selectedGroup.createdBy === user?.uid)) && (
                                <button
                                  onClick={() => handleTogglePin(msg)}
                                  className={`w-5 h-5 flex items-center justify-center text-[10px] ${
                                    msg.isPinned ? 'text-amber-400' : 'text-slate-300 hover:text-white'
                                  }`}
                                  title={msg.isPinned ? 'Unpin' : 'Pin'}
                                >
                                  <i className="fas fa-thumbtack"></i>
                                </button>
                              )}
                              {(isMe || canManageMessages || (selectedGroup && selectedGroup.createdBy === user?.uid)) && (
                                <button
                                  onClick={() => handleDeleteMessage(msg.id)}
                                  className="w-5 h-5 flex items-center justify-center text-[10px] text-rose-400 hover:text-rose-300"
                                  title="Delete"
                                >
                                  <i className="fas fa-trash-alt"></i>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Reply Indicator Box */}
                {replyingTo && (
                  <div className={`px-4 py-2 border-t flex items-center justify-between text-xs ${
                    isDark ? 'bg-slate-900 border-slate-800 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'
                  }`}>
                    <div className="flex items-center gap-2 truncate">
                      <i className="fas fa-reply text-blue-500"></i>
                      <span className="font-bold">{replyingTo.senderName}:</span>
                      <span className="truncate opacity-80">{replyingTo.content}</span>
                    </div>
                    <button
                      onClick={() => setReplyingTo(null)}
                      className="text-slate-400 hover:text-rose-400 p-1"
                    >
                      <i className="fas fa-times"></i>
                    </button>
                  </div>
                )}

                {/* Input Controls Bar */}
                <div className={`p-3 border-t shrink-0 ${
                  isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'
                }`}>
                  {/* Quick Emojis & Urgent Toggle */}
                  <div className="flex items-center justify-between gap-1 mb-2 px-1">
                    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
                      {QUICK_EMOJIS.map(emoji => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => setInputText(prev => prev + emoji)}
                          className={`w-6 h-6 rounded-lg text-xs flex items-center justify-center transition-all ${
                            isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-100'
                          }`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>

                    {/* Urgent Toggle Button */}
                    <button
                      type="button"
                      onClick={() => setIsUrgent(prev => !prev)}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all ${
                        isUrgent
                          ? 'bg-rose-500 text-white shadow-sm animate-pulse'
                          : (isDark ? 'bg-slate-800 text-slate-400 hover:text-white' : 'bg-slate-100 text-slate-600 hover:text-slate-900')
                      }`}
                      title={dir === 'rtl' ? 'تمييز الرسالة كتنبيه عاجل' : 'Mark as Urgent'}
                    >
                      <i className="fas fa-exclamation-circle"></i>
                      <span>{dir === 'rtl' ? 'عاجل' : 'Urgent'}</span>
                    </button>
                  </div>

                  {/* Input Form or Voice Recording Banner */}
                  {isRecording ? (
                    <div className="flex items-center justify-between gap-2 p-2 rounded-2xl bg-rose-950/30 border border-rose-800/40 text-rose-300">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping"></span>
                        <span className="text-xs font-bold font-mono">
                          {dir === 'rtl' ? 'جاري التسجيل...' : 'Recording...'} {recordingSeconds}s
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={cancelVoiceRecording}
                          className="px-2 py-1 rounded-xl text-xs bg-slate-800 text-slate-300 hover:bg-slate-700"
                        >
                          {dir === 'rtl' ? 'إلغاء' : 'Cancel'}
                        </button>
                        <button
                          onClick={stopVoiceRecording}
                          className="px-3 py-1 rounded-xl text-xs bg-rose-600 text-white font-bold hover:bg-rose-500 shadow-md"
                        >
                          {dir === 'rtl' ? 'إرسال التسجيل' : 'Send'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <input
                          ref={inputRef}
                          type="text"
                          value={inputText}
                          onChange={(e) => setInputText(e.target.value)}
                          placeholder={
                            activeTab === 'groups' && selectedGroup
                              ? (dir === 'rtl' ? `اكتب رسالة لمجموعة ${selectedGroup.name}...` : `Message in ${selectedGroup.name}...`)
                              : (activeTab === 'direct' && selectedPeer
                                  ? (dir === 'rtl' ? `رسالة إلى ${selectedPeer.name}...` : `Message to ${selectedPeer.name}...`)
                                  : (dir === 'rtl' ? 'اكتب رسالة لأعضاء القسم...' : 'Type message to department...'))
                          }
                          className={`w-full text-xs py-2.5 px-3.5 rounded-2xl border outline-none transition-colors ${
                            isDark
                              ? 'bg-slate-900 border-slate-700 text-white placeholder-slate-500 focus:border-indigo-500'
                              : 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400 focus:border-indigo-500'
                          }`}
                        />
                      </div>

                      {/* Voice Note Button */}
                      <button
                        type="button"
                        onClick={startVoiceRecording}
                        className={`w-9 h-9 rounded-2xl flex items-center justify-center transition-all ${
                          isDark
                            ? 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
                            : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                        }`}
                        title={dir === 'rtl' ? 'تسجيل رسالة صوتية' : 'Record voice note'}
                      >
                        <i className="fas fa-microphone text-xs"></i>
                      </button>

                      {/* Send Button */}
                      <button
                        type="submit"
                        disabled={!inputText.trim() || isSending}
                        className={`w-9 h-9 rounded-2xl text-white flex items-center justify-center transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none shadow-md ${
                          activeTab === 'groups' ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-blue-600 hover:bg-blue-500'
                        }`}
                        title={dir === 'rtl' ? 'إرسال' : 'Send'}
                      >
                        <i className={`fas fa-paper-plane text-xs ${dir === 'rtl' ? '-scale-x-100' : ''}`}></i>
                      </button>
                    </form>
                  )}
                </div>
              </>
            )}

            {/* View 2: Groups List (المجموعات / الجروبات) */}
            {activeTab === 'groups' && !selectedGroup && (
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden p-3">
                {/* Header & Create Button */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-300">
                      {dir === 'rtl' ? 'جروبات العمل بالقسم' : 'Department Work Groups'}
                    </h4>
                    <p className="text-[10px] text-slate-400">
                      {dir === 'rtl' ? 'يمكن لجميع الموظفين إنشاء قروبات للفرق والمهام' : 'Staff can create groups for teams & shifts'}
                    </p>
                  </div>
                  <button
                    onClick={handleOpenCreateGroup}
                    className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-md hover:from-indigo-500 hover:to-purple-500 active:scale-95 transition-all shrink-0"
                  >
                    <i className="fas fa-plus text-[10px]"></i>
                    <span>{dir === 'rtl' ? 'إنشاء جروب' : 'New Group'}</span>
                  </button>
                </div>

                {/* Groups List */}
                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {groups.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 text-xs flex flex-col items-center">
                      <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 mb-3">
                        <i className="fas fa-users text-2xl"></i>
                      </div>
                      <h5 className="font-bold text-slate-300 mb-1">
                        {dir === 'rtl' ? 'لا توجد جروبات حتى الآن' : 'No groups yet'}
                      </h5>
                      <p className="text-[11px] text-slate-500 max-w-[240px] mb-4">
                        {dir === 'rtl' 
                          ? 'كن أول من ينشئ جروب عمل لفريقك أو نبطشيتك لتسهيل التنسيق والتواصل.' 
                          : 'Be the first to create a group for your shift or team.'}
                      </p>
                      <button
                        onClick={handleOpenCreateGroup}
                        className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs shadow-md hover:bg-indigo-500 transition-all flex items-center gap-1.5"
                      >
                        <i className="fas fa-plus"></i>
                        <span>{dir === 'rtl' ? 'إنشاء أول جروب الآن' : 'Create First Group'}</span>
                      </button>
                    </div>
                  ) : (
                    groups.map(group => {
                      const colorPreset = GROUP_COLORS.find(c => c.id === group.color) || GROUP_COLORS[0];
                      const isMember = group.members.includes(user?.uid || '');
                      const isCreator = group.createdBy === user?.uid;

                      return (
                        <div
                          key={group.id}
                          className={`p-3 rounded-2xl border transition-all flex flex-col gap-2 ${
                            isDark
                              ? 'bg-slate-900/60 border-slate-800/80 hover:border-indigo-500/50 hover:bg-slate-900'
                              : 'bg-white border-slate-200 hover:border-indigo-300 hover:shadow-xs'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className={`w-10 h-10 rounded-2xl bg-gradient-to-tr ${colorPreset.gradient} text-white flex items-center justify-center shrink-0 shadow-sm`}>
                                <i className={`fas fa-${group.icon || 'users'} text-sm`}></i>
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <h4 className="text-xs font-black truncate">{group.name}</h4>
                                  {isMember && (
                                    <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-indigo-500/15 text-indigo-400 font-bold shrink-0">
                                      {dir === 'rtl' ? 'أنت عضو' : 'Member'}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10px] text-slate-400 truncate mt-0.5">
                                  {group.description || (dir === 'rtl' ? `أنشأه: ${group.creatorName}` : `Created by: ${group.creatorName}`)}
                                </p>
                              </div>
                            </div>

                            {/* Open Group Chat Button */}
                            <button
                              onClick={() => setSelectedGroup(group)}
                              className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs shrink-0"
                            >
                              <span>{dir === 'rtl' ? 'دخول' : 'Open'}</span>
                              <i className={`fas fa-chevron-${dir === 'rtl' ? 'left' : 'right'} text-[10px]`}></i>
                            </button>
                          </div>

                          {/* Footer Info & Actions */}
                          <div className={`pt-2 border-t flex items-center justify-between text-[10px] ${
                            isDark ? 'border-slate-800 text-slate-400' : 'border-slate-100 text-slate-500'
                          }`}>
                            <div className="flex items-center gap-2 truncate">
                              <span className="flex items-center gap-1">
                                <i className="fas fa-user-friends text-[9px]"></i>
                                <span>{group.members.length} {dir === 'rtl' ? 'أعضاء' : 'members'}</span>
                              </span>
                              {group.lastMessage && (
                                <>
                                  <span>•</span>
                                  <span className="truncate max-w-[140px] opacity-80">
                                    {group.lastMessage}
                                  </span>
                                </>
                              )}
                            </div>

                            {/* Delete Group (Creator or Supervisor only) */}
                            {(isCreator || canManageMessages) && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteGroup(group);
                                }}
                                className="text-rose-400 hover:text-rose-300 p-1 transition-colors"
                                title={dir === 'rtl' ? 'حذف الجروب' : 'Delete Group'}
                              >
                                <i className="fas fa-trash-alt"></i>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* View 3: Direct Messages User Selection List */}
            {activeTab === 'direct' && !selectedPeer && (
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden p-3">
                <div className="mb-3">
                  <div className="relative">
                    <i className="fas fa-search absolute right-3 rtl:right-3 rtl:left-auto ltr:left-3 ltr:right-auto top-3 text-xs text-slate-400"></i>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={dir === 'rtl' ? 'ابحث عن زميل لبدء محادثة خاصة...' : 'Search colleague for DM...'}
                      className={`w-full text-xs py-2 px-8 rounded-xl border outline-none transition-colors ${
                        isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'
                      }`}
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                  {filteredStaff.length === 0 ? (
                    <div className="text-center py-10 text-slate-400 text-xs">
                      <i className="fas fa-user-slash text-2xl mb-2"></i>
                      <p>{dir === 'rtl' ? 'لا يوجد أعضاء مطابقين للبحث' : 'No members found'}</p>
                    </div>
                  ) : (
                    filteredStaff.map(colleague => {
                      const lastMsg = messages
                        .filter(m => 
                          (m.senderId === user?.uid && m.directRecipientId === colleague.uid) ||
                          (m.senderId === colleague.uid && m.directRecipientId === user?.uid)
                        )
                        .slice(-1)[0];

                      return (
                        <button
                          key={colleague.id || colleague.uid}
                          onClick={() => setSelectedPeer(colleague)}
                          className={`w-full p-2.5 rounded-2xl flex items-center justify-between border text-left rtl:text-right transition-all group ${
                            isDark
                              ? 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-800 hover:border-slate-700'
                              : 'bg-white border-slate-100 hover:bg-slate-50 hover:border-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-500 to-indigo-600 text-white font-black flex items-center justify-center text-sm shadow-xs shrink-0">
                              {colleague.name ? colleague.name.charAt(0).toUpperCase() : 'U'}
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-xs font-bold truncate group-hover:text-blue-500 transition-colors flex items-center gap-1.5">
                                <span className="truncate">{colleague.name || colleague.email}</span>
                                {colleague.isHidden && (
                                  <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 font-medium shrink-0 flex items-center gap-0.5">
                                    <i className="fas fa-eye-slash text-[8px]"></i>
                                    <span>{dir === 'rtl' ? 'مخفي' : 'Hidden'}</span>
                                  </span>
                                )}
                              </h4>
                              <p className="text-[10px] text-slate-400 truncate">
                                {lastMsg ? lastMsg.content : (colleague.role || colleague.email)}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                            <i className={`fas fa-chevron-${dir === 'rtl' ? 'left' : 'right'} text-xs text-slate-400 group-hover:translate-x-1 rtl:group-hover:-translate-x-1 transition-transform`}></i>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* View 4: Members / Presence Directory */}
            {activeTab === 'members' && (
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden p-3">
                <div className="mb-3 flex items-center justify-between px-1">
                  <h4 className="text-xs font-black text-slate-300 uppercase tracking-wider">
                    {dir === 'rtl' ? `أعضاء ${currentDept.name}` : `${currentDept.name} Staff`}
                  </h4>
                  <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    {deptUsers.length} {dir === 'rtl' ? 'عضو' : 'Members'}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {deptUsers.map(member => (
                    <div
                      key={member.id || member.uid}
                      className={`p-2.5 rounded-2xl flex items-center justify-between border ${
                        isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-2xl bg-slate-800 text-slate-200 flex items-center justify-center font-bold text-xs shrink-0 border border-slate-700">
                          {member.name ? member.name.charAt(0).toUpperCase() : 'U'}
                        </div>
                        <div className="min-w-0">
                          <h5 className="text-xs font-bold truncate flex items-center gap-1.5">
                            <span className="truncate">{member.name || member.email}</span>
                            {member.uid === user?.uid && (
                              <span className="text-[10px] text-blue-400 shrink-0">({dir === 'rtl' ? 'أنت' : 'You'})</span>
                            )}
                            {member.isHidden && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 font-medium shrink-0 flex items-center gap-0.5">
                                <i className="fas fa-eye-slash text-[8px]"></i>
                                <span>{dir === 'rtl' ? 'مخفي' : 'Hidden'}</span>
                              </span>
                            )}
                          </h5>
                          <p className="text-[10px] text-slate-400 truncate">
                            {member.role || 'عضو القسم'}
                          </p>
                        </div>
                      </div>

                      {member.uid !== user?.uid && (
                        <button
                          onClick={() => {
                            setSelectedPeer(member);
                            setActiveTab('direct');
                          }}
                          className="px-2.5 py-1 rounded-xl text-xs bg-blue-600/10 text-blue-500 hover:bg-blue-600 hover:text-white font-bold transition-all flex items-center gap-1 shrink-0"
                          title={dir === 'rtl' ? 'محادثة خاصة' : 'Start DM'}
                        >
                          <i className="fas fa-comment-alt text-[10px]"></i>
                          <span>{dir === 'rtl' ? 'محادثة' : 'Chat'}</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Group Creation Modal / Drawer */}
          {isCreateGroupModalOpen && (
            <div className="absolute inset-0 z-50 bg-black/70 backdrop-blur-md flex flex-col p-4 animate-in fade-in">
              <div className={`flex-1 rounded-3xl border flex flex-col overflow-hidden shadow-2xl ${
                isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'
              }`}>
                {/* Modal Header */}
                <div className={`p-4 border-b flex items-center justify-between ${
                  isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white flex items-center justify-center text-xs">
                      <i className="fas fa-users"></i>
                    </div>
                    <div>
                      <h3 className="text-sm font-black">
                        {dir === 'rtl' ? 'إنشاء جروب عمل جديد' : 'Create New Work Group'}
                      </h3>
                      <p className="text-[10px] text-slate-400">
                        {dir === 'rtl' ? 'يمكن لجميع الموظفين إنشاء فرق ونبطشيات' : 'Any staff member can create a team group'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsCreateGroupModalOpen(false)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800"
                  >
                    <i className="fas fa-times text-xs"></i>
                  </button>
                </div>

                {/* Form Body */}
                <form onSubmit={handleCreateGroup} className="flex-1 overflow-y-auto p-4 space-y-4">
                  {/* Group Name */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">
                      {dir === 'rtl' ? 'اسم الجروب *' : 'Group Name *'}
                    </label>
                    <input
                      type="text"
                      required
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      placeholder={dir === 'rtl' ? 'مثال: فريق الرنين المغناطيسي، نبطشية الجمعة' : 'e.g., MRI Team, Friday Shift'}
                      className={`w-full text-xs py-2 px-3 rounded-xl border outline-none ${
                        isDark ? 'bg-slate-950 border-slate-700 text-white focus:border-indigo-500' : 'bg-slate-50 border-slate-200 text-slate-800 focus:border-indigo-500'
                      }`}
                    />
                  </div>

                  {/* Group Description */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">
                      {dir === 'rtl' ? 'وصف الجروب (اختياري)' : 'Description (Optional)'}
                    </label>
                    <input
                      type="text"
                      value={newGroupDesc}
                      onChange={(e) => setNewGroupDesc(e.target.value)}
                      placeholder={dir === 'rtl' ? 'ملاحظات أو هدف المجموعة...' : 'Group notes or goals...'}
                      className={`w-full text-xs py-2 px-3 rounded-xl border outline-none ${
                        isDark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'
                      }`}
                    />
                  </div>

                  {/* Group Icon Selector */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-1.5">
                      {dir === 'rtl' ? 'أيقونة الجروب' : 'Group Icon'}
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {GROUP_ICONS.map(ic => (
                        <button
                          key={ic.id}
                          type="button"
                          onClick={() => setNewGroupIcon(ic.id)}
                          className={`p-2 rounded-xl border flex flex-col items-center gap-1 transition-all ${
                            newGroupIcon === ic.id
                              ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                              : (isDark ? 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white' : 'bg-slate-50 border-slate-200 text-slate-600')
                          }`}
                        >
                          <i className={`fas ${ic.icon} text-sm`}></i>
                          <span className="text-[9px] font-bold truncate">{ic.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Group Color Preset */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-1.5">
                      {dir === 'rtl' ? 'لون التمييز' : 'Theme Color'}
                    </label>
                    <div className="flex items-center gap-2">
                      {GROUP_COLORS.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setNewGroupColor(c.id)}
                          className={`flex-1 h-8 rounded-xl bg-gradient-to-tr ${c.gradient} flex items-center justify-center text-white text-xs transition-transform ${
                            newGroupColor === c.id ? 'scale-110 ring-2 ring-white shadow-md' : 'opacity-70 hover:opacity-100'
                          }`}
                        >
                          {newGroupColor === c.id && <i className="fas fa-check text-[10px]"></i>}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Members Selection Checklist */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[11px] font-bold text-slate-400">
                        {dir === 'rtl' ? 'أعضاء الجروب' : 'Group Members'} ({selectedMemberIds.length} {dir === 'rtl' ? 'محدد' : 'selected'})
                      </label>
                      <div className="flex items-center gap-2 text-[10px]">
                        <button
                          type="button"
                          onClick={handleSelectAllMembers}
                          className="text-indigo-400 hover:underline font-bold"
                        >
                          {dir === 'rtl' ? 'تحديد الكل' : 'Select All'}
                        </button>
                        <span>•</span>
                        <button
                          type="button"
                          onClick={handleDeselectAllMembers}
                          className="text-slate-400 hover:underline font-bold"
                        >
                          {dir === 'rtl' ? 'إلغاء الكل' : 'Clear'}
                        </button>
                      </div>
                    </div>

                    <div className="relative mb-2">
                      <i className="fas fa-search absolute right-2.5 rtl:right-2.5 rtl:left-auto ltr:left-2.5 ltr:right-auto top-2.5 text-[10px] text-slate-400"></i>
                      <input
                        type="text"
                        value={memberSearchQuery}
                        onChange={(e) => setMemberSearchQuery(e.target.value)}
                        placeholder={dir === 'rtl' ? 'ابحث في الزملاء...' : 'Search staff...'}
                        className={`w-full text-[11px] py-1.5 px-7 rounded-xl border outline-none ${
                          isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'
                        }`}
                      />
                    </div>

                    <div className="max-h-36 overflow-y-auto space-y-1 pr-1 border rounded-xl p-1.5 border-slate-800">
                      {filteredForGroupCreation.map(member => {
                        const isSelected = selectedMemberIds.includes(member.uid);
                        const isCreator = member.uid === user?.uid;

                        return (
                          <div
                            key={member.uid || member.id}
                            onClick={() => toggleMemberSelection(member.uid)}
                            className={`p-1.5 rounded-lg flex items-center justify-between cursor-pointer transition-colors text-xs ${
                              isSelected
                                ? (isDark ? 'bg-indigo-950/50 text-indigo-200' : 'bg-indigo-50 text-indigo-900')
                                : (isDark ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-100 text-slate-700')
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}}
                                disabled={isCreator}
                                className="rounded text-indigo-600 focus:ring-0 cursor-pointer"
                              />
                              <span className="truncate font-medium">{member.name || member.email}</span>
                              {isCreator && (
                                <span className="text-[9px] px-1 rounded bg-indigo-500/20 text-indigo-300 font-bold">
                                  {dir === 'rtl' ? 'منشئ الجروب' : 'Creator'}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400 shrink-0">{member.role}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Submit Button */}
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={!newGroupName.trim() || isSubmittingGroup}
                      className="w-full py-2.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-black text-xs shadow-md hover:from-indigo-500 hover:to-purple-500 disabled:opacity-40 transition-all flex items-center justify-center gap-2"
                    >
                      {isSubmittingGroup ? (
                        <>
                          <i className="fas fa-spinner fa-spin"></i>
                          <span>{dir === 'rtl' ? 'جاري إنشاء الجروب...' : 'Creating Group...'}</span>
                        </>
                      ) : (
                        <>
                          <i className="fas fa-check"></i>
                          <span>{dir === 'rtl' ? 'إنشاء المجموعة وبدء المحادثة' : 'Create Group & Start Chat'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Group Info Modal / Drawer */}
          {isGroupInfoOpen && selectedGroup && (
            <div className="absolute inset-0 z-50 bg-black/70 backdrop-blur-md flex flex-col p-4 animate-in fade-in">
              <div className={`flex-1 rounded-3xl border flex flex-col overflow-hidden shadow-2xl ${
                isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'
              }`}>
                {/* Header */}
                <div className={`p-4 border-b flex items-center justify-between ${
                  isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}>
                  <div className="flex items-center gap-2">
                    <div className={`w-9 h-9 rounded-2xl bg-gradient-to-tr ${activeGroupColorPreset.gradient} text-white flex items-center justify-center`}>
                      <i className={`fas fa-${selectedGroup.icon || 'users'}`}></i>
                    </div>
                    <div>
                      <h3 className="text-sm font-black">{selectedGroup.name}</h3>
                      <p className="text-[10px] text-slate-400">
                        {dir === 'rtl' ? `أنشأها: ${selectedGroup.creatorName}` : `Created by: ${selectedGroup.creatorName}`}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsGroupInfoOpen(false)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800"
                  >
                    <i className="fas fa-times text-xs"></i>
                  </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {selectedGroup.description && (
                    <div className={`p-3 rounded-2xl border text-xs ${
                      isDark ? 'bg-slate-950/60 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
                    }`}>
                      <h5 className="font-bold text-[10px] text-slate-400 uppercase tracking-wider mb-1">
                        {dir === 'rtl' ? 'الوصف' : 'Description'}
                      </h5>
                      <p>{selectedGroup.description}</p>
                    </div>
                  )}

                  {/* Members List */}
                  <div>
                    <h5 className="font-bold text-xs text-slate-300 mb-2 flex items-center justify-between">
                      <span>{dir === 'rtl' ? 'أعضاء المجموعة' : 'Group Members'}</span>
                      <span className="text-indigo-400 font-bold font-mono">
                        {selectedGroup.members.length} {dir === 'rtl' ? 'عضو' : 'members'}
                      </span>
                    </h5>

                    <div className="space-y-1.5">
                      {selectedGroup.members.map(memberUid => {
                        const memberUser = deptUsers.find(u => u.uid === memberUid);
                        const isCreator = memberUid === selectedGroup.createdBy;
                        const isMe = memberUid === user?.uid;

                        return (
                          <div
                            key={memberUid}
                            className={`p-2 rounded-xl flex items-center justify-between border text-xs ${
                              isDark ? 'bg-slate-950/40 border-slate-800/80' : 'bg-slate-50 border-slate-100'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-7 h-7 rounded-lg bg-slate-800 text-white font-bold flex items-center justify-center text-[10px]">
                                {memberUser?.name ? memberUser.name.charAt(0).toUpperCase() : 'U'}
                              </div>
                              <div className="min-w-0">
                                <span className="font-bold truncate block">
                                  {memberUser ? memberUser.name : memberUid}
                                  {isMe && <span className="text-[9px] text-indigo-400 mx-1">({dir === 'rtl' ? 'أنت' : 'You'})</span>}
                                </span>
                                <span className="text-[9px] text-slate-400 block">{memberUser?.role || 'عضو'}</span>
                              </div>
                            </div>

                            {isCreator && (
                              <span className="text-[9px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-black">
                                {dir === 'rtl' ? 'المنشئ' : 'Admin'}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-2 border-t border-slate-800 space-y-2">
                    {/* Leave group */}
                    {selectedGroup.members.includes(user?.uid || '') && (
                      <button
                        onClick={() => handleLeaveGroup(selectedGroup)}
                        className="w-full py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-rose-950/40 hover:text-rose-400 text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                      >
                        <i className="fas fa-sign-out-alt"></i>
                        <span>{dir === 'rtl' ? 'مغادرة المجموعة' : 'Leave Group'}</span>
                      </button>
                    )}

                    {/* Delete group (creator only) */}
                    {(selectedGroup.createdBy === user?.uid || canManageMessages) && (
                      <button
                        onClick={() => handleDeleteGroup(selectedGroup)}
                        className="w-full py-2 rounded-xl bg-rose-600/15 text-rose-400 hover:bg-rose-600 hover:text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                      >
                        <i className="fas fa-trash-alt"></i>
                        <span>{dir === 'rtl' ? 'حذف المجموعة نهائياً' : 'Delete Group'}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      )}

      {/* Mobile Push Notifications Center Modal */}
      <MobileNotificationModal
        isOpen={showMobileNotifModal}
        onClose={() => setShowMobileNotifModal(false)}
      />
    </>
  );
};

export default DepartmentChatWidget;
