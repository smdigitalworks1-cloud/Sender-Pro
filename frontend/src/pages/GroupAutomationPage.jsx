import React, { useEffect, useState, useRef } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { Plus, Folder, FileText, X, ArrowLeft, Users2, Play, Pause, Trash2, Clock, Upload, Image, ArrowRight, Settings, Smile, Copy, ClipboardPaste, GripVertical, MessageSquare, RotateCcw, User, LogOut, PlusCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { io } from 'socket.io-client';

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : window.location.origin);

const COMMON_EMOJIS = ['😊', '😂', '❤️', '👍', '🙏', '🔥', '✨', '🎉', '✅', '❌', '🛑', '👇', '👉', '🚀', '💰'];

export default function GroupAutomationPage() {
    const { user } = useAuth();
    const [view, setView] = useState('projects'); // 'projects', 'automations', 'builder'

    // State Collections
    const [projects, setProjects] = useState([]);
    const [automations, setAutomations] = useState([]);
    const [groups, setGroups] = useState([]);

    const [selectedProject, setSelectedProject] = useState(null);
    const [selectedAutomation, setSelectedAutomation] = useState(null);
    const [showAutoModal, setShowAutoModal] = useState(false);
    const [autoForm, setAutoForm] = useState({ name: '', triggerType: 'manual', scheduledAt: '' });
    const [previewData, setPreviewData] = useState(null);
    const [previewTab, setPreviewTab] = useState('steps'); // 'steps', 'enrollment', 'logs'

    // Dynamic Logs & Tabs States
    const [automationLogs, setAutomationLogs] = useState([]);
    const [logsLoading, setLogsLoading] = useState(false);
    const [filterDateStart, setFilterDateStart] = useState('');
    const [filterDateEnd, setFilterDateEnd] = useState('');
    const [filterAction, setFilterAction] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterGroup, setFilterGroup] = useState('all');
    const [builderTab, setBuilderTab] = useState('builder'); // 'builder', 'settings', 'enrollment', 'logs'
    
    // Pagination States for GHL-style logs
    const [logsPage, setLogsPage] = useState(1);
    const [logsPerPage, setLogsPerPage] = useState(10);
    const [previewLogsPage, setPreviewLogsPage] = useState(1);
    const [previewLogsPerPage, setPreviewLogsPerPage] = useState(10);
    const [selectedLogForDetails, setSelectedLogForDetails] = useState(null);

    const [loading, setLoading] = useState(false);

    // Automation Builder states relocated to the top to prevent lexical ReferenceErrors during render
    const [builderState, setBuilderState] = useState({ targetGroups: [], steps: [] });
    const [groupSearch, setGroupSearch] = useState('');
    const [clipboardStep, setClipboardStep] = useState(null);
    const dragItem = useRef(null);
    const dragOverItem = useRef(null);
    const [activeInserterIndex, setActiveInserterIndex] = useState(null);

    // Fetch execution logs & steps from backend
    const loadLogs = async (automationId) => {
        setLogsLoading(true);
        try {
            const { data } = await api.get(`/automations/${automationId}/logs`);
            setAutomationLogs(data.logs || []);
        } catch (err) {
            toast.error('Failed to load execution logs');
        }
        setLogsLoading(false);
    };

    // Set default date range on builder load
    useEffect(() => {
        if (view === 'builder') {
            const today = new Date();
            const past30Days = new Date();
            past30Days.setDate(today.getDate() - 30);
            setFilterDateStart(past30Days.toISOString().split('T')[0]);
            setFilterDateEnd(today.toISOString().split('T')[0]);
        }
    }, [view]);

    // Auto-refresh logs when viewing enrollment or logs and the automation is active
    useEffect(() => {
        if (view !== 'builder' || !selectedAutomation?.id) return;
        if (builderTab !== 'enrollment' && builderTab !== 'logs') return;
        if (selectedAutomation.status !== 'active') return;

        const interval = setInterval(() => {
            api.get(`/automations/${selectedAutomation.id}/logs`)
                .then(({ data }) => {
                    setAutomationLogs(data.logs || []);
                    if (data.automation) {
                        setSelectedAutomation(prev => ({
                            ...prev,
                            status: data.automation.status,
                            lastRunAt: data.automation.lastRunAt,
                            updatedAt: data.automation.updatedAt
                        }));
                    }
                })
                .catch(() => {});
        }, 5000); // Poll every 5 seconds

        return () => clearInterval(interval);
    }, [view, builderTab, selectedAutomation?.id, selectedAutomation?.status]);

    // Listen for real-time Socket.io execution log updates
    useEffect(() => {
        if (!selectedAutomation?.id || !user?.id) return;

        const socket = io(SOCKET_URL);

        socket.on('connect', () => {
            // Join our private room to receive OUR automation and WhatsApp updates
            socket.emit('whatsapp:identify', { userId: user.id, role: user.role });
        });

        socket.on('automation:log_update', (data) => {
            if (data.automationId === selectedAutomation.id) {
                console.log('🔄 Real-time log update received via socket for:', data.automationId);
                // Instantly fetch logs
                api.get(`/automations/${selectedAutomation.id}/logs`)
                    .then(({ data }) => {
                        setAutomationLogs(data.logs || []);
                        if (data.automation) {
                            setSelectedAutomation(prev => ({
                                ...prev,
                                status: data.automation.status,
                                lastRunAt: data.automation.lastRunAt,
                                updatedAt: data.automation.updatedAt
                            }));
                        }
                    })
                    .catch(() => {});
            }
        });

        return () => {
            socket.disconnect();
        };
    }, [selectedAutomation?.id, user?.id, user?.role]);

    // Avatar and Initial Helpers for Contact Column matching GHL styling
    const getInitials = (name) => {
        if (!name) return 'GP';
        const parts = name.trim().split(/\s+/);
        if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    };

    const getAvatarColor = (name) => {
        const colors = [
            { bg: 'rgba(59, 130, 246, 0.1)', text: 'rgb(59, 130, 246)' }, // Blue
            { bg: 'rgba(16, 185, 129, 0.1)', text: 'rgb(16, 185, 129)' }, // Green
            { bg: 'rgba(139, 92, 246, 0.1)', text: 'rgb(139, 92, 246)' }, // Purple
            { bg: 'rgba(239, 68, 68, 0.1)', text: 'rgb(239, 68, 68)' },   // Red
            { bg: 'rgba(245, 158, 11, 0.1)', text: 'rgb(245, 158, 11)' }   // Amber
        ];
        let hash = 0;
        for (let i = 0; i < (name || '').length; i++) {
            hash = (name || '').charCodeAt(i) + ((hash << 5) - hash);
        }
        return colors[Math.abs(hash) % colors.length];
    };

    const formatExecutedOn = (dateStr) => {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return '-';
        
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const month = months[date.getMonth()];
        
        const day = date.getDate();
        let suffix = 'th';
        if (day === 1 || day === 21 || day === 31) suffix = 'st';
        else if (day === 2 || day === 22) suffix = 'nd';
        else if (day === 3 || day === 23) suffix = 'rd';
        
        let hours = date.getHours();
        const ampm = hours >= 12 ? 'pm' : 'am';
        hours = hours % 12;
        hours = hours ? hours : 12; // the hour '0' should be '12'
        
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        
        return `${month} ${day}${suffix}, ${hours}:${minutes}:${seconds} ${ampm}`;
    };

    const getFormattedLogsWithMilestones = (rawLogs, stepsList, targetGroupsList) => {
        if (!rawLogs) return [];
        
        // Group raw logs by groupId
        const logsByGroup = {};
        rawLogs.forEach(log => {
            if (!logsByGroup[log.groupId]) {
                logsByGroup[log.groupId] = [];
            }
            logsByGroup[log.groupId].push(log);
        });
        
        let processedLogs = [];
        const allGroupIds = new Set([
            ...targetGroupsList,
            ...Object.keys(logsByGroup)
        ]);
        
        allGroupIds.forEach(gid => {
            const groupLogs = logsByGroup[gid] || [];
            // Sort group logs chronologically (oldest first)
            groupLogs.sort((a, b) => new Date(a.executedAt) - new Date(b.executedAt));
            
            // 1. Add "Add to workflow" step
            if (groupLogs.length > 0 || targetGroupsList.includes(gid)) {
                const firstLogTime = groupLogs.length > 0 ? new Date(groupLogs[0].executedAt) : new Date();
                const addedTime = new Date(firstLogTime.getTime() - 5000);
                
                processedLogs.push({
                    _id: `start_${gid}`,
                    groupId: gid,
                    stepId: 'start',
                    status: 'added_to_workflow',
                    executedAt: addedTime.toISOString(),
                    error: null
                });
            }
            
            // 2. Add the actual logs
            groupLogs.forEach(log => {
                processedLogs.push(log);
            });
            
            // 3. Add "Removed by - End Of Workflow" step if completed
            if (groupLogs.length > 0 && stepsList.length > 0) {
                const successLogs = groupLogs.filter(l => l.status === 'success');
                if (successLogs.length >= stepsList.length) {
                    const lastLog = groupLogs[groupLogs.length - 1];
                    const endTime = new Date(new Date(lastLog.executedAt).getTime() + 1000);
                    
                    processedLogs.push({
                        _id: `end_${gid}`,
                        groupId: gid,
                        stepId: 'end',
                        status: 'finished',
                        executedAt: endTime.toISOString(),
                        error: null
                    });
                }
            }
        });
        
        // Sort descending (newest first)
        processedLogs.sort((a, b) => new Date(b.executedAt) - new Date(a.executedAt));
        return processedLogs;
    };

    const getLogUIMapping = (log, stepsList) => {
        let actionLabel = 'Add to workflow';
        let actionIcon = <PlusCircle size={14} style={{ color: '#6366f1' }} />;
        let statusLabel = 'Added To Workflow';
        let statusColor = '#10b981';
        let statusBg = 'rgba(16, 185, 129, 0.08)';
        
        if (log.stepId === 'start') {
            actionLabel = 'Add to workflow';
            actionIcon = <PlusCircle size={14} style={{ color: '#6366f1' }} />;
            statusLabel = 'Added To Workflow';
            statusColor = '#10b981';
            statusBg = 'rgba(16, 185, 129, 0.08)';
            return { actionLabel, actionIcon, statusLabel, statusColor, statusBg };
        }
        
        if (log.stepId === 'end') {
            actionLabel = 'Removed by - End Of Workflow';
            actionIcon = <LogOut size={14} style={{ color: '#ef4444' }} />;
            statusLabel = 'Finished';
            statusColor = '#10b981';
            statusBg = 'rgba(16, 185, 129, 0.08)';
            return { actionLabel, actionIcon, statusLabel, statusColor, statusBg };
        }
        
        const stepIndex = (stepsList || []).findIndex(s => s._id === log.stepId || s.id === log.stepId);
        const step = stepIndex !== -1 ? stepsList[stepIndex] : null;
        
        if (step) {
            if (step.actionType === 'send_message') {
                actionLabel = 'SMS';
                actionIcon = <MessageSquare size={14} style={{ color: '#3b82f6' }} />;
                
                if (log.status === 'success') {
                    statusLabel = 'Executed';
                    statusColor = '#10b981';
                    statusBg = 'rgba(16, 185, 129, 0.08)';
                } else if (log.status === 'failed') {
                    statusLabel = 'Failed';
                    statusColor = '#ef4444';
                    statusBg = 'rgba(239, 68, 68, 0.08)';
                } else {
                    statusLabel = 'Pending';
                    statusColor = '#f59e0b';
                    statusBg = 'rgba(245, 158, 11, 0.08)';
                }
            } else if (step.actionType === 'delay') {
                actionLabel = 'Wait';
                actionIcon = <Clock size={14} style={{ color: '#f59e0b' }} />;
                
                if (log.status === 'success') {
                    statusLabel = 'Wait Finished';
                    statusColor = '#10b981';
                    statusBg = 'rgba(16, 185, 129, 0.08)';
                } else if (log.status === 'pending' || log.status === 'running') {
                    statusLabel = 'Waiting';
                    statusColor = '#8b5cf6';
                    statusBg = 'rgba(139, 92, 246, 0.08)';
                } else if (log.status === 'failed') {
                    statusLabel = 'Failed';
                    statusColor = '#ef4444';
                    statusBg = 'rgba(239, 68, 68, 0.08)';
                } else {
                    statusLabel = log.status || 'Waiting';
                    statusColor = '#8b5cf6';
                    statusBg = 'rgba(139, 92, 246, 0.08)';
                }
            }
        } else {
            if (log.status === 'success') {
                statusLabel = 'Executed';
                statusColor = '#10b981';
                statusBg = 'rgba(16, 185, 129, 0.08)';
            }
        }
        
        return { actionLabel, actionIcon, statusLabel, statusColor, statusBg };
    };

    // Step description helper for logs
    const getStepDescription = (stepId) => {
        const step = builderState.steps.find(s => s._id === stepId || s.id === stepId);
        if (!step) return 'System Wait Action';
        if (step.actionType === 'send_message') {
            return `📩 Send Message: "${step.message.substring(0, 35)}${step.message.length > 35 ? '...' : ''}"`;
        }
        if (step.actionType === 'delay') {
            if (step.delayOption === 'exact_time') {
                return `⏱️ Wait until ${new Date(step.delayUntilDate).toLocaleString()}`;
            }
            if (step.delayOption === 'event_time') {
                return `⏱️ Wait: ${step.eventWhen?.toUpperCase()} Event Offset (${step.eventOffsetDays}d ${step.eventOffsetHours}h ${step.eventOffsetMinutes}m)`;
            }
            return `⏱️ Wait for ${step.delayValue} ${step.delayUnit}`;
        }
        return 'Unknown Action';
    };

    // Filter logs based on date, action, status, and group
    const getFilteredLogs = () => {
        const processed = getFormattedLogsWithMilestones(automationLogs, builderState.steps, builderState.targetGroups);
        return processed.filter(log => {
            if (filterDateStart) {
                const start = new Date(filterDateStart);
                start.setHours(0, 0, 0, 0);
                if (new Date(log.executedAt) < start) return false;
            }
            if (filterDateEnd) {
                const end = new Date(filterDateEnd);
                end.setHours(23, 59, 59, 999);
                if (new Date(log.executedAt) > end) return false;
            }
            if (filterAction !== 'all') {
                if (log.stepId !== filterAction) return false;
            }
            if (filterStatus !== 'all') {
                if (filterStatus === 'success') {
                    if (log.status !== 'success' && log.status !== 'added_to_workflow' && log.status !== 'finished') return false;
                } else if (filterStatus === 'pending') {
                    if (log.status !== 'pending' && log.status !== 'running') return false;
                } else {
                    if (log.status !== filterStatus) return false;
                }
            }
            if (filterGroup !== 'all') {
                if (log.groupId !== filterGroup) return false;
            }
            return true;
        });
    };

    // Compute paginated logs for main Execution Logs tab
    const filteredLogs = getFilteredLogs();
    const totalFilteredLogs = filteredLogs.length;
    const indexOfLastLog = logsPage * logsPerPage;
    const indexOfFirstLog = indexOfLastLog - logsPerPage;
    const currentLogs = filteredLogs.slice(indexOfFirstLog, indexOfLastLog);

    // Reset pagination when filters change
    useEffect(() => {
        setLogsPage(1);
    }, [filterDateStart, filterDateEnd, filterAction, filterStatus, filterGroup]);

    useEffect(() => {
        setPreviewLogsPage(1);
    }, [previewData, previewTab]);

    // Dynamic Enrollment History mapping
    const getEnrollments = () => {
        const enrollmentsMap = {};

        // 1. Initialize with targetGroups of current builderState
        builderState.targetGroups.forEach(gid => {
            const g = groups.find(x => x.id === gid) || { name: gid, id: gid };
            enrollmentsMap[gid] = {
                groupId: gid,
                groupName: g.name || gid,
                status: selectedAutomation?.status === 'paused' ? 'paused' : 'active',
                enrolledOn: selectedAutomation?.createdAt ? new Date(selectedAutomation.createdAt) : new Date(),
                lastActive: selectedAutomation?.updatedAt ? new Date(selectedAutomation.updatedAt) : new Date(),
                progressCount: 0,
                totalSteps: builderState.steps.length,
                logs: []
            };
        });

        // 2. Map existing logs
        automationLogs.forEach(log => {
            const gid = log.groupId;
            if (!enrollmentsMap[gid]) {
                const g = groups.find(x => x.id === gid) || { name: gid, id: gid };
                enrollmentsMap[gid] = {
                    groupId: gid,
                    groupName: g.name || gid,
                    status: 'active',
                    enrolledOn: log.executedAt ? new Date(log.executedAt) : new Date(),
                    lastActive: log.executedAt ? new Date(log.executedAt) : new Date(),
                    progressCount: 0,
                    totalSteps: builderState.steps.length,
                    logs: []
                };
            }

            enrollmentsMap[gid].logs.push(log);
            const logTime = new Date(log.executedAt);
            if (logTime > enrollmentsMap[gid].lastActive) enrollmentsMap[gid].lastActive = logTime;
            if (logTime < enrollmentsMap[gid].enrolledOn) enrollmentsMap[gid].enrolledOn = logTime;

            if (log.status === 'success') {
                enrollmentsMap[gid].progressCount += 1;
            }
        });

        // 3. Evaluate statuses
        return Object.values(enrollmentsMap).map(e => {
            let status = e.status;
            const hasFailed = e.logs.some(l => l.status === 'failed');
            const totalSteps = e.totalSteps || 1;

            if (hasFailed) {
                status = 'failed';
            } else if (e.progressCount >= totalSteps) {
                status = 'completed';
            } else if (selectedAutomation?.status === 'paused') {
                status = 'paused';
            } else if (e.progressCount > 0) {
                status = 'active';
            }

            return {
                ...e,
                status
            };
        });
    };

    // Helper to calculate enrollment history in preview modal
    const getPreviewEnrollments = (pData) => {
        if (!pData) return [];
        const enrollmentsMap = {};

        // 1. Initialize with targetGroups
        const targetGroups = pData.targetGroups || [];
        targetGroups.forEach(gid => {
            const g = groups.find(x => x.id === gid) || { name: gid, id: gid };
            enrollmentsMap[gid] = {
                groupId: gid,
                groupName: g.name || gid,
                status: pData.status === 'paused' ? 'paused' : 'active',
                enrolledOn: pData.createdAt ? new Date(pData.createdAt) : new Date(),
                lastActive: pData.updatedAt ? new Date(pData.updatedAt) : new Date(),
                progressCount: 0,
                totalSteps: (pData.steps || []).length,
                logs: []
            };
        });

        // 2. Map existing logs
        const pLogs = pData.logs || [];
        pLogs.forEach(log => {
            const gid = log.groupId;
            if (!enrollmentsMap[gid]) {
                const g = groups.find(x => x.id === gid) || { name: gid, id: gid };
                enrollmentsMap[gid] = {
                    groupId: gid,
                    groupName: g.name || gid,
                    status: 'active',
                    enrolledOn: log.executedAt ? new Date(log.executedAt) : new Date(),
                    lastActive: log.executedAt ? new Date(log.executedAt) : new Date(),
                    progressCount: 0,
                    totalSteps: (pData.steps || []).length,
                    logs: []
                };
            }

            enrollmentsMap[gid].logs.push(log);
            const logTime = new Date(log.executedAt);
            if (logTime > enrollmentsMap[gid].lastActive) enrollmentsMap[gid].lastActive = logTime;
            if (logTime < enrollmentsMap[gid].enrolledOn) enrollmentsMap[gid].enrolledOn = logTime;

            if (log.status === 'success') {
                enrollmentsMap[gid].progressCount += 1;
            }
        });

        // 3. Evaluate statuses
        return Object.values(enrollmentsMap).map(e => {
            let status = e.status;
            const hasFailed = e.logs.some(l => l.status === 'failed');
            const totalSteps = e.totalSteps || 1;

            if (hasFailed) {
                status = 'failed';
            } else if (e.progressCount >= totalSteps) {
                status = 'completed';
            } else if (pData.status === 'paused') {
                status = 'paused';
            } else if (e.progressCount > 0) {
                status = 'active';
            }

            return {
                ...e,
                status
            };
        });
    };

    // Helper to get step descriptions in preview modal logs
    const getPreviewStepDescription = (stepId, pData) => {
        const step = (pData.steps || []).find(s => s._id === stepId || s.id === stepId);
        if (!step) return 'System Wait Action';
        if (step.actionType === 'send_message') {
            return `📩 Send Message: "${step.message.substring(0, 35)}${step.message.length > 35 ? '...' : ''}"`;
        }
        if (step.actionType === 'delay') {
            if (step.delayOption === 'exact_time') {
                return `⏱️ Wait until ${new Date(step.delayUntilDate).toLocaleString()}`;
            }
            if (step.delayOption === 'event_time') {
                return `⏱️ Wait: ${step.eventWhen?.toUpperCase()} Event Offset (${step.eventOffsetDays}d ${step.eventOffsetHours}h ${step.eventOffsetMinutes}m)`;
            }
            return `⏱️ Wait for ${step.delayValue} ${step.delayUnit}`;
        }
        return 'Unknown Action';
    };

    // ==================
    // 1. Projects View
    // ==================
    const loadProjects = async () => {
        setLoading(true);
        try {
            const { data } = await api.get('/automations/projects');
            setProjects(data);
        } catch (err) { toast.error('Failed to load projects'); }
        setLoading(false);
    }

    const createProject = async (e) => {
        e.preventDefault();
        const name = prompt("Enter Project Name:");
        if (!name) return;
        try {
            const { data } = await api.post('/automations/projects', { name });
            setProjects([data, ...projects]);
            toast.success("Project Created");
        } catch (err) { toast.error("Error creating project"); }
    }

    const openProject = (p) => {
        setSelectedProject(p);
        loadAutomations(p.id);
        setView('automations');
    }

    // ==================
    // 2. Automations View
    // ==================
    const formatDateTimeLocal = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '';
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        return d.toISOString().slice(0, 16);
    };

    const loadAutomations = async (projectId) => {
        setLoading(true);
        try {
            const { data } = await api.get(`/automations/projects/${projectId}/automations`);
            setAutomations(data);
        } catch (err) { toast.error('Failed to load automations'); }
        setLoading(false);
    }

    const createAutomation = async (e) => {
        e.preventDefault();
        const { name, triggerType, scheduledAt } = autoForm;
        if (!name) return toast.error("Enter Automation Name");
        if (triggerType === 'schedule' && !scheduledAt) return toast.error("Enter a date and time for schedule");

        try {
            const { data } = await api.post(`/automations/projects/${selectedProject.id}/automations`, { name, triggerType, scheduledAt });
            setAutomations([data, ...automations]);
            setShowAutoModal(false);
            setAutoForm({ name: '', triggerType: 'manual', scheduledAt: '' });
            toast.success("Automation Created");
        } catch (err) { toast.error("Error creating automation"); }
    }

    const openAutomation = async (a) => {
        setSelectedAutomation(a);
        setBuilderTab('builder');
        try {
            const [grpRes, autoRes] = await Promise.all([
                api.get('/groups').catch(() => ({ data: [] })), // Gracefully handle no WhatsApp connection
                api.get(`/automations/${a.id}`)
            ]);
            if (grpRes.data && grpRes.data.length > 0) {
                setGroups(grpRes.data);
            }
            setSelectedAutomation(autoRes.data);
            setBuilderState({
                targetGroups: autoRes.data.targetGroups || [],
                steps: autoRes.data.steps || []
            });
            setView('builder');
            loadLogs(a.id);
        } catch (err) { toast.error('Error loading builder'); }
    }

    const handlePreview = async (a) => {
        try {
            const toastId = toast.loading('Loading preview...');
            const [autoRes, grpRes, logsRes] = await Promise.all([
                api.get(`/automations/${a.id}`),
                groups.length === 0 ? api.get('/groups').catch(() => ({ data: [] })) : Promise.resolve({ data: groups }),
                api.get(`/automations/${a.id}/logs`).catch(() => ({ data: { logs: [] } }))
            ]);
            toast.dismiss(toastId);

            if (groups.length === 0) setGroups(grpRes.data);

            const groupNames = autoRes.data.targetGroups.map(gid => {
                const g = grpRes.data.find(x => x.id === gid);
                return g ? g.name : gid;
            });

            setPreviewData({ 
                ...autoRes.data, 
                groupNames, 
                logs: logsRes.data.logs || [],
                steps: autoRes.data.steps || []
            });
            setPreviewTab('steps');
        } catch (err) { toast.error("Error loading preview"); }
    }

    const toggleAutomationStatusList = async (a, action) => {
        try {
            if (action === 'start') {
                const { data } = await api.post(`/automations/${a.id}/run`);
                toast.success(data.message);
            } else {
                await api.patch(`/automations/${a.id}/status`, { status: "paused" });
                toast.success("Paused");
            }
            loadAutomations(selectedProject.id);
        } catch (err) { toast.error("Execution error"); }
    }

    const deleteAutomation = async (a) => {
        if (!window.confirm(`Are you sure you want to delete the automation "${a.name}"?`)) return;
        try {
            await api.delete(`/automations/${a.id}`);
            toast.success("Automation deleted successfully");
            loadAutomations(selectedProject.id);
        } catch (err) {
            toast.error(err.response?.data?.error || "Error deleting automation");
        }
    }

    // ==================
    // 3. Automation Builder View
    // ==================

    const insertStepAt = (index, type) => {
        setBuilderState(prev => {
            const newSteps = [...prev.steps];
            const newStep = {
                actionType: type,
                message: '',
                mediaUrl: '',
                delayValue: 0,
                delayUnit: 'minutes',
                delayOption: 'duration',
                delayUntilDate: '',
                eventWhen: 'exact',
                eventOffsetDays: 0,
                eventOffsetHours: 0,
                eventOffsetMinutes: 0,
                pastAction: 'proceed'
            };
            newSteps.splice(index, 0, newStep);
            return { ...prev, steps: newSteps };
        });
        setActiveInserterIndex(null);
        toast.success(`${type === 'send_message' ? 'Message Action' : 'Wait Step'} inserted!`);
    };

    const renderPlusConnector = (targetIndex) => {
        return (
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 50, height: 40 }}>
                {/* Vertical line segment */}
                <div style={{ width: '2px', height: '100%', background: 'var(--border)' }}></div>

                {/* Circular Plus Button */}
                <button
                    type="button"
                    onClick={() => setActiveInserterIndex(activeInserterIndex === targetIndex ? null : targetIndex)}
                    style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        background: 'var(--accent)',
                        color: '#fff',
                        border: '3px solid var(--bg2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        boxShadow: '0 2px 8px rgba(124, 58, 237, 0.4)',
                        transition: 'all 0.2s',
                    }}
                    className="plus-connector-btn"
                >
                    <Plus size={12} style={{ strokeWidth: 3 }} />
                </button>

                {/* Floating Popover Menu */}
                {activeInserterIndex === targetIndex && (
                    <div
                        style={{
                            position: 'absolute',
                            top: '32px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            background: 'var(--bg2)',
                            border: '1px solid var(--border)',
                            borderRadius: '12px',
                            boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
                            padding: '8px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                            width: '180px',
                            zIndex: 100,
                        }}
                        className="fade-in"
                    >
                        <div style={{ fontSize: '10px', color: 'var(--text3)', padding: '4px 8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Add Step Here</div>
                        <button
                            type="button"
                            onClick={() => insertStepAt(targetIndex, 'send_message')}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                width: '100%',
                                padding: '8px 12px',
                                background: 'transparent',
                                border: 'none',
                                borderRadius: '8px',
                                color: 'var(--text)',
                                textAlign: 'left',
                                cursor: 'pointer',
                                fontSize: '13px',
                                transition: 'background 0.2s',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg3)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                            <span style={{ fontSize: '16px' }}>✉️</span> Send Message
                        </button>
                        <button
                            type="button"
                            onClick={() => insertStepAt(targetIndex, 'delay')}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                width: '100%',
                                padding: '8px 12px',
                                background: 'transparent',
                                border: 'none',
                                borderRadius: '8px',
                                color: 'var(--text)',
                                textAlign: 'left',
                                cursor: 'pointer',
                                fontSize: '13px',
                                transition: 'background 0.2s',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg3)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                            <span style={{ fontSize: '16px' }}>⏱️</span> Wait
                        </button>
                        {clipboardStep && (
                            <button
                                type="button"
                                onClick={() => {
                                    setBuilderState(prev => {
                                        const newSteps = [...prev.steps];
                                        newSteps.splice(targetIndex, 0, { ...clipboardStep });
                                        return { ...prev, steps: newSteps };
                                    });
                                    setActiveInserterIndex(null);
                                    toast.success("Copied Step Pasted!");
                                }}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    width: '100%',
                                    padding: '8px 12px',
                                    background: 'transparent',
                                    border: 'none',
                                    borderRadius: '8px',
                                    color: 'var(--text)',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                    transition: 'background 0.2s',
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg3)'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                            >
                                <span style={{ fontSize: '16px' }}>📋</span> Paste Step
                            </button>
                        )}
                    </div>
                )}
            </div>
        );
    };

    const handleDragStart = (e, position) => {
        dragItem.current = position;
    };

    const handleDragEnter = (e, position) => {
        dragOverItem.current = position;
    };

    const handleDragEnd = () => {
        if (
            Number.isInteger(dragItem.current) &&
            Number.isInteger(dragOverItem.current) &&
            dragItem.current !== dragOverItem.current &&
            dragItem.current >= 0 &&
            dragOverItem.current >= 0
        ) {
            setBuilderState(prev => {
                if (dragItem.current >= prev.steps.length || dragOverItem.current > prev.steps.length) return prev;

                const newSteps = [...prev.steps];
                const draggedItemContent = newSteps[dragItem.current];
                if (!draggedItemContent) return prev; // Safety check

                newSteps.splice(dragItem.current, 1);
                newSteps.splice(dragOverItem.current, 0, draggedItemContent);
                return { ...prev, steps: newSteps };
            });
        }
        dragItem.current = null;
        dragOverItem.current = null;
    };

    const copyStep = (step) => {
        setClipboardStep({ ...step });
        toast.success("Step Copied");
    };

    const pasteStep = (idx) => {
        if (!clipboardStep) return;
        setBuilderState(prev => {
            const newSteps = [...prev.steps];
            newSteps.splice(idx + 1, 0, { ...clipboardStep });
            return { ...prev, steps: newSteps };
        });
        toast.success("Step Pasted");
    };

    const toggleGroup = (id) => {
        setBuilderState(prev => {
            const tg = prev.targetGroups;
            return { ...prev, targetGroups: tg.includes(id) ? tg.filter(x => x !== id) : [...tg, id] };
        });
    }

    const addStep = (type) => {
        setBuilderState(prev => ({
            ...prev,
            steps: [...prev.steps, { actionType: type, message: '', delayValue: 0, delayUnit: 'minutes', delayOption: 'duration', delayUntilDate: '' }]
        }));
    }

    const handleStepFileUpload = async (e, idx) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async () => {
            const toastId = toast.loading('Uploading file...');
            try {
                const base64 = reader.result;
                const { data } = await api.post('/upload', {
                    base64,
                    filename: file.name,
                    fileType: file.type
                });
                updateStep(idx, 'mediaUrl', data.url);
                toast.success('File uploaded successfully!', { id: toastId });
            } catch (err) {
                toast.error('File upload failed', { id: toastId });
            }
        };
    };

    const updateStep = (idx, field, val) => {
        setBuilderState(prev => {
            const newSteps = [...prev.steps];
            newSteps[idx] = { ...newSteps[idx], [field]: val };
            return { ...prev, steps: newSteps };
        })
    }

    const removeStep = (idx) => {
        setBuilderState(prev => ({
            ...prev, steps: prev.steps.filter((_, i) => i !== idx)
        }));
    }

    const saveWorkflow = async () => {
        try {
            try {
                await api.patch(`/automations/${selectedAutomation.id}/trigger`, {
                    triggerType: selectedAutomation.triggerType,
                    scheduledAt: selectedAutomation.scheduledAt,
                    eventTime: selectedAutomation.eventTime
                });
            } catch (triggerErr) {
                console.error("Trigger save failed:", triggerErr);
                throw new Error(`Trigger update failed: ${triggerErr.response?.data?.error || triggerErr.message}`);
            }

            try {
                await api.post(`/automations/${selectedAutomation.id}/steps`, { steps: builderState.steps });
            } catch (stepsErr) {
                console.error("Steps save failed:", stepsErr);
                throw new Error(`Steps update failed: ${stepsErr.response?.data?.error || stepsErr.message}`);
            }

            try {
                await api.patch(`/automations/${selectedAutomation.id}/groups`, { targetGroups: builderState.targetGroups });
            } catch (groupsErr) {
                console.error("Groups save failed:", groupsErr);
                throw new Error(`Groups update failed: ${groupsErr.response?.data?.error || groupsErr.message}`);
            }

            toast.success("Workflow Saved Successfully");
        } catch (err) {
            console.error("Error saving workflow:", err);
            toast.error(err.message || "Error saving workflow");
        }
    }

    const startExecution = async () => {
        try {
            await saveWorkflow(); // Save UI settings first (like start time & date)
            const { data } = await api.post(`/automations/${selectedAutomation.id}/run`);
            toast.success(data.message);
            setSelectedAutomation(prev => ({ ...prev, status: 'active' }));
            setBuilderTab('enrollment');
            loadLogs(selectedAutomation.id);
        } catch (err) { toast.error("Execution error"); }
    }

    const pauseExecution = async () => {
        try {
            const { data } = await api.patch(`/automations/${selectedAutomation.id}/status`, { status: "paused" });
            toast.success("Paused");
            setSelectedAutomation(prev => ({ ...prev, status: 'paused' }));
        } catch (err) { }
    }

    useEffect(() => { loadProjects(); }, []);

    return (
        <div className="fade-in">
            {/* Header */}
            <div className="page-header" style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
                    {view !== 'projects' && (
                        <button className="btn btn-ghost" style={{ padding: 8 }} onClick={() => {
                            if (view === 'builder') {
                                loadAutomations(selectedProject.id);
                                setView('automations');
                            } else {
                                setView('projects');
                            }
                        }}>
                            <ArrowLeft size={18} />
                        </button>
                    )}
                    <div>
                        <div className="page-title">
                            {view === 'projects' && 'Automations'}
                            {view === 'automations' && `Project: ${selectedProject?.name}`}
                            {view === 'builder' && `Workflow: ${selectedAutomation?.name}`}
                        </div>
                    </div>
                </div>

                {view === 'projects' && <button className="btn btn-primary" onClick={createProject}><Plus size={14} /> New Project</button>}
                {view === 'automations' && <button className="btn btn-primary" onClick={() => setShowAutoModal(true)}><Plus size={14} /> New Automation</button>}
                {view === 'builder' && (
                    <div style={{ display: 'flex', gap: 10 }}>
                        {selectedAutomation?.status === 'active' ? (
                            <button className="btn btn-ghost" style={{ color: 'var(--red)', borderColor: 'var(--red)' }} onClick={pauseExecution}><Pause size={14} /> Pause</button>
                        ) : (
                            <button className="btn btn-success" style={{ background: 'var(--green)', color: 'white' }} onClick={startExecution}><Play size={14} /> Run Now</button>
                        )}
                        <button className="btn btn-primary" onClick={saveWorkflow}>Save Workflow</button>
                    </div>
                )}
            </div>

            {view === 'builder' && (
                <div style={{
                    display: 'flex',
                    borderBottom: '1px solid var(--border)',
                    marginBottom: '20px',
                    gap: '10px',
                    justifyContent: 'center',
                    background: 'var(--bg2)',
                    padding: '0 20px',
                    borderRadius: '12px'
                }}>
                    {[
                        { id: 'builder', label: 'Builder', icon: '🎨' },
                        { id: 'settings', label: 'Settings', icon: '⚙️' },
                        { id: 'enrollment', label: 'Enrollment History', icon: '👥' },
                        { id: 'logs', label: 'Execution Logs', icon: '📋' }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => {
                                setBuilderTab(tab.id);
                                if (tab.id === 'enrollment' || tab.id === 'logs') {
                                    loadLogs(selectedAutomation.id);
                                }
                            }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                background: 'none',
                                border: 'none',
                                borderBottom: builderTab === tab.id ? '3px solid var(--accent)' : '3px solid transparent',
                                color: builderTab === tab.id ? 'var(--accent)' : 'var(--text3)',
                                padding: '12px 18px',
                                fontSize: '13px',
                                fontWeight: '600',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                outline: 'none'
                            }}
                            onMouseEnter={(e) => { if (builderTab !== tab.id) e.currentTarget.style.color = 'var(--text)'; }}
                            onMouseLeave={(e) => { if (builderTab !== tab.id) e.currentTarget.style.color = 'var(--text3)'; }}
                        >
                            <span>{tab.icon}</span> {tab.label}
                        </button>
                    ))}
                </div>
            )}

            {loading && <div style={{ textAlign: 'center', padding: 40 }}>Loading...</div>}

            {/* View 1: Projects */}
            {!loading && view === 'projects' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 15 }}>
                    {projects.map(p => (
                        <div key={p.id} className="card" style={{ cursor: 'pointer', transition: '0.2s', border: '1px solid var(--border)' }} onClick={() => openProject(p)}>
                            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                                <div style={{ width: 45, height: 45, borderRadius: 12, background: 'rgba(124,58,237,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Folder size={20} color="var(--accent)" />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, fontSize: 15 }}>{p.name}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text3)' }}>Created: {new Date(p.createdAt).toLocaleDateString()}</div>
                                </div>
                                <ArrowRight size={16} color="var(--text3)" />
                            </div>
                        </div>
                    ))}
                    {projects.length === 0 && <div className="empty-state">No projects yet. Create one!</div>}
                </div>
            )}

            {/* View 2: Automations List */}
            {!loading && view === 'automations' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {automations.map(a => (
                        <div key={a.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
                            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <FileText size={18} color="var(--accent3)" />
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600 }}>{a.name}</div>
                                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, display: 'flex', gap: 15 }}>
                                    <span><b>Status:</b> <span style={{ color: a.status === 'active' ? 'var(--green)' : a.status === 'completed' ? 'var(--accent)' : 'var(--red)' }}>{a.status.toUpperCase()}</span></span>
                                    <span><b>Type:</b> {a.triggerType.toUpperCase()}</span>
                                    {a.triggerType === 'schedule' && a.scheduledAt && (
                                        <span><b>Scheduled For:</b> {new Date(a.scheduledAt).toLocaleString()}</span>
                                    )}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                {a.status === 'active' ? (
                                    <button className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: 12, border: '1px solid var(--red)', color: 'var(--red)' }} onClick={() => toggleAutomationStatusList(a, 'pause')}><Pause size={14} /> Pause</button>
                                ) : (
                                    <button className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: 12, border: '1px solid var(--green)', color: 'var(--green)' }} onClick={() => toggleAutomationStatusList(a, 'start')}><Play size={14} /> Run Now</button>
                                )}
                                <button className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: 12, border: '1px solid var(--border)' }} onClick={() => handlePreview(a)}><FileText size={14} /> Preview</button>
                                <button className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: 12, border: '1px solid var(--border)' }} onClick={() => openAutomation(a)}><Settings size={14} /> Builder</button>
                                <button className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: 12, border: '1px solid var(--red)', color: 'var(--red)' }} onClick={() => deleteAutomation(a)}><Trash2 size={14} /> Delete</button>
                            </div>
                        </div>
                    ))}
                    {automations.length === 0 && <div className="empty-state">No automations found. Create one.</div>}
                </div>
            )}

            {/* View 3: Visual Workflow Builder / Tabbed Workspaces */}
            {!loading && view === 'builder' && (
                <div style={{ width: '100%' }}>
                    {builderTab === 'builder' && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', minHeight: 'calc(100vh - 150px)', padding: '20px 0' }}>
                            <div style={{ width: '100%', maxWidth: 650, display: 'flex', flexDirection: 'column', gap: 0, position: 'relative' }}>
                                {/* Workflow Trigger / Start Block */}
                                <div className="card fade-in" style={{ border: '1px solid var(--accent)', background: 'var(--bg2)', boxShadow: '0 4px 15px rgba(124,58,237,0.1)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent)', marginBottom: 15 }}>
                                        <Play size={16} /> <b>Flow Start Setting</b>
                                    </div>
                                    <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                                        <button type="button" className={`btn ${selectedAutomation?.triggerType === 'manual' ? 'btn-primary' : 'btn-ghost'}`} style={{ flex: 1 }} onClick={() => setSelectedAutomation({ ...selectedAutomation, triggerType: 'manual' })}>Manual Run</button>
                                        <button type="button" className={`btn ${selectedAutomation?.triggerType === 'schedule' ? 'btn-primary' : 'btn-ghost'}`} style={{ flex: 1 }} onClick={() => setSelectedAutomation({ ...selectedAutomation, triggerType: 'schedule' })}>Specific Date</button>
                                    </div>
                                    {selectedAutomation?.triggerType === 'schedule' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                                            <label style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600 }}>Event / Appointment Time:</label>
                                            <input type="datetime-local" className="input" value={selectedAutomation?.eventTime ? formatDateTimeLocal(selectedAutomation.eventTime) : ''} onChange={e => setSelectedAutomation({ ...selectedAutomation, eventTime: e.target.value, scheduledAt: e.target.value })} />
                                            <span style={{ fontSize: 10, color: 'var(--text3)' }}>Used as the start time and the base for "Event / Appointment time" waits.</span>
                                        </div>
                                    )}

                                    {/* Direct helper to select groups in settings */}
                                    <div style={{ 
                                        marginTop: 15, 
                                        paddingTop: 15, 
                                        borderTop: '1px dashed var(--border)', 
                                        display: 'flex', 
                                        justifyContent: 'space-between', 
                                        alignItems: 'center' 
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)' }}>
                                            <Users2 size={14} style={{ color: 'var(--accent)' }} />
                                            <span>
                                                Target Groups: <b>{builderState.targetGroups.length} selected</b>
                                            </span>
                                        </div>
                                        <button 
                                            type="button" 
                                            className="btn btn-ghost" 
                                            onClick={() => setBuilderTab('settings')}
                                            style={{ 
                                                fontSize: 11, 
                                                padding: '4px 10px', 
                                                borderRadius: 6, 
                                                height: 'auto',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 4
                                            }}
                                        >
                                            <Settings size={12} /> Select Groups
                                        </button>
                                    </div>
                                </div>

                                {/* Render connector from Start to first step */}
                                {renderPlusConnector(0)}

                                {builderState.steps.map((step, idx) => (
                                    <React.Fragment key={idx}>
                                        <div
                                            className="card fade-in"
                                            style={{ position: 'relative', border: '1px solid var(--border)', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', opacity: dragItem.current === idx ? 0.5 : 1, width: '100%' }}
                                            draggable
                                            onDragStart={(e) => handleDragStart(e, idx)}
                                            onDragEnter={(e) => handleDragEnter(e, idx)}
                                            onDragEnd={handleDragEnd}
                                            onDragOver={(e) => e.preventDefault()}
                                        >
                                            <div style={{ position: 'absolute', top: -10, left: 15, background: 'var(--bg2)', padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 'bold', color: 'var(--accent)', zIndex: 2 }}>
                                                Step {idx + 1}
                                            </div>

                                            <div style={{ position: 'absolute', top: 10, left: -25, color: 'var(--text3)', cursor: 'grab' }}>
                                                <GripVertical size={18} />
                                            </div>

                                            <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 8 }}>
                                                <button onClick={() => copyStep(step)} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }} title="Copy Step"><Copy size={13} /></button>
                                                {clipboardStep && <button onClick={() => pasteStep(idx)} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer' }} title="Paste Below"><ClipboardPaste size={15} /></button>}
                                                <button onClick={() => removeStep(idx)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer' }}><X size={14} /></button>
                                            </div>

                                            {step.actionType === 'send_message' && (
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: 'var(--accent)' }}><FileText size={16} /> <b>Send Message</b></div>

                                                    <textarea className="textarea" placeholder="Enter message here..." value={step.message} onChange={e => updateStep(idx, 'message', e.target.value)} style={{ minHeight: 80, resize: 'vertical' }} />

                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, padding: 8, background: 'var(--bg2)', borderRadius: 8 }}>
                                                        <Smile size={14} color="var(--text3)" style={{ marginTop: 4, marginRight: 4 }} />
                                                        {COMMON_EMOJIS.map(emoji => (
                                                            <button key={emoji} type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}
                                                                onClick={() => updateStep(idx, 'message', step.message + emoji)}
                                                            >{emoji}</button>
                                                        ))}
                                                    </div>

                                                    <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', background: 'var(--bg2)', padding: '10px', borderRadius: 8 }}>
                                                        <label className="btn btn-ghost" style={{ border: '1px dashed var(--border)', cursor: 'pointer', padding: '6px 12px', fontSize: 12 }}>
                                                            <Upload size={14} /> Upload Media
                                                            <input type="file" onChange={(e) => handleStepFileUpload(e, idx)} hidden />
                                                        </label>
                                                        {step.mediaUrl ? (
                                                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', overflow: 'hidden' }}>
                                                                <span style={{ fontSize: 11, color: 'var(--accent)', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>{step.mediaUrl.split('/').pop()}</span>
                                                                <button type="button" onClick={() => updateStep(idx, 'mediaUrl', '')} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 11 }}><Trash2 size={13} /></button>
                                                            </div>
                                                        ) : (
                                                            <span style={{ fontSize: 11, color: 'var(--text3)' }}>No file attached.</span>
                                                        )}
                                                    </div>

                                                </div>
                                            )}

                                            {step.actionType === 'delay' && (
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--yellow)', marginBottom: 12 }}>
                                                        <Clock size={16} /> <b>Wait / Delay Step</b>
                                                    </div>

                                                    <div style={{ marginBottom: 12 }}>
                                                        <label style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, display: 'block', marginBottom: 4 }}>WAIT FOR:</label>
                                                        <select
                                                            className="input"
                                                            value={step.delayOption || 'duration'}
                                                            onChange={e => updateStep(idx, 'delayOption', e.target.value)}
                                                            style={{ width: '100%', background: 'var(--bg3)' }}
                                                        >
                                                            <option value="duration">⏱️ Time Delay</option>
                                                            <option value="event_time">📅 Event / Appointment time</option>
                                                            <option value="exact_time">📍 Exact Specific Date</option>
                                                        </select>
                                                    </div>

                                                    {step.delayOption === 'exact_time' && (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                            <label style={{ fontSize: 11, color: 'var(--text3)' }}>Wait until specific date & time:</label>
                                                            <input type="datetime-local" className="input" value={step.delayUntilDate ? formatDateTimeLocal(step.delayUntilDate) : ''} onChange={e => updateStep(idx, 'delayUntilDate', e.target.value)} />
                                                        </div>
                                                    )}

                                                    {(step.delayOption === 'duration' || !step.delayOption) && (
                                                        <div style={{ display: 'flex', gap: 10 }}>
                                                            <div style={{ flex: 1 }}>
                                                                <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Value</label>
                                                                <input type="number" className="input" value={step.delayValue || step.delayMinutes || 0} onChange={e => updateStep(idx, 'delayValue', Number(e.target.value))} min="0" />
                                                            </div>
                                                            <div style={{ flex: 1 }}>
                                                                <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Unit</label>
                                                                <select className="input" value={step.delayUnit || 'minutes'} onChange={e => updateStep(idx, 'delayUnit', e.target.value)}>
                                                                    <option value="minutes">Minutes</option>
                                                                    <option value="hours">Hours</option>
                                                                    <option value="days">Days</option>
                                                                </select>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {step.delayOption === 'event_time' && (
                                                        <div>
                                                            <div style={{ marginBottom: 12 }}>
                                                                <label style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Timing relative to Event:</label>
                                                                <select
                                                                    className="input"
                                                                    value={step.eventWhen || 'exact'}
                                                                    onChange={e => updateStep(idx, 'eventWhen', e.target.value)}
                                                                    style={{ width: '100%' }}
                                                                >
                                                                    <option value="exact">Exact Event Time</option>
                                                                    <option value="before">Before Event</option>
                                                                    <option value="after">After Event</option>
                                                                </select>
                                                            </div>

                                                            {(step.eventWhen === 'before' || step.eventWhen === 'after') && (
                                                                <div style={{ display: 'flex', gap: 8, marginBottom: 15 }}>
                                                                    <div style={{ flex: 1 }}>
                                                                        <label style={{ fontSize: 10, color: 'var(--text3)', display: 'block', marginBottom: 2 }}>Days</label>
                                                                        <input
                                                                            type="number"
                                                                            className="input"
                                                                            value={step.eventOffsetDays || 0}
                                                                            onChange={e => updateStep(idx, 'eventOffsetDays', Math.max(0, parseInt(e.target.value) || 0))}
                                                                            min="0"
                                                                            style={{ padding: '6px' }}
                                                                        />
                                                                    </div>
                                                                    <div style={{ flex: 1 }}>
                                                                        <label style={{ fontSize: 10, color: 'var(--text3)', display: 'block', marginBottom: 2 }}>Hours</label>
                                                                        <input
                                                                            type="number"
                                                                            className="input"
                                                                            value={step.eventOffsetHours || 0}
                                                                            onChange={e => updateStep(idx, 'eventOffsetHours', Math.min(23, Math.max(0, parseInt(e.target.value) || 0)))}
                                                                            min="0"
                                                                            max="23"
                                                                            style={{ padding: '6px' }}
                                                                        />
                                                                    </div>
                                                                    <div style={{ flex: 1 }}>
                                                                        <label style={{ fontSize: 10, color: 'var(--text3)', display: 'block', marginBottom: 2 }}>Minutes</label>
                                                                        <input
                                                                            type="number"
                                                                            className="input"
                                                                            value={step.eventOffsetMinutes || 0}
                                                                            onChange={e => updateStep(idx, 'eventOffsetMinutes', Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                                                                            min="0"
                                                                            max="59"
                                                                            style={{ padding: '6px' }}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            )}

                                                            <div style={{ background: 'var(--bg3)', padding: 10, borderRadius: 8, marginTop: 10 }}>
                                                                <label style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, display: 'block', marginBottom: 6 }}>
                                                                    If wait time is already in the past, how should contact proceed?
                                                                </label>
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12 }}>
                                                                        <input
                                                                            type="radio"
                                                                            name={`pastAction-${idx}`}
                                                                            checked={(step.pastAction || 'proceed') === 'proceed'}
                                                                            onChange={() => updateStep(idx, 'pastAction', 'proceed')}
                                                                        />
                                                                        Move to next step (proceed immediately)
                                                                    </label>
                                                                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12 }}>
                                                                        <input
                                                                            type="radio"
                                                                            name={`pastAction-${idx}`}
                                                                            checked={step.pastAction === 'skip'}
                                                                            onChange={() => updateStep(idx, 'pastAction', 'skip')}
                                                                        />
                                                                        Skip next action step
                                                                    </label>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Render connector after this step */}
                                        {renderPlusConnector(idx + 1)}
                                    </React.Fragment>
                                ))}
                            </div>
                        </div>
                    )}

                    {builderTab === 'settings' && (
                        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', width: '100%', padding: '20px 0' }} className="fade-in">
                            {/* General Settings */}
                            <div className="card" style={{ flex: 1, minHeight: '400px' }}>
                                <h4 style={{ marginBottom: 20, fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>⚙️ General Configurations</h4>
                                
                                <div className="form-group" style={{ marginBottom: 20 }}>
                                    <label className="label" style={{ fontWeight: 600 }}>Automation Name</label>
                                    <input 
                                        className="input" 
                                        value={selectedAutomation?.name || ''} 
                                        onChange={e => setSelectedAutomation({ ...selectedAutomation, name: e.target.value })} 
                                        placeholder="Enter Automation Name"
                                    />
                                </div>

                                <div className="form-group" style={{ marginBottom: 20 }}>
                                    <label className="label" style={{ fontWeight: 600 }}>Trigger / Flow Start Type</label>
                                    <div style={{ display: 'flex', gap: 10, marginTop: 5 }}>
                                        <button 
                                            type="button" 
                                            className={`btn ${selectedAutomation?.triggerType === 'manual' ? 'btn-primary' : 'btn-ghost'}`} 
                                            style={{ flex: 1 }} 
                                            onClick={() => setSelectedAutomation({ ...selectedAutomation, triggerType: 'manual' })}
                                        >
                                            Manual (Run Now)
                                        </button>
                                        <button 
                                            type="button" 
                                            className={`btn ${selectedAutomation?.triggerType === 'schedule' ? 'btn-primary' : 'btn-ghost'}`} 
                                            style={{ flex: 1 }} 
                                            onClick={() => setSelectedAutomation({ ...selectedAutomation, triggerType: 'schedule' })}
                                        >
                                            Scheduled Specific Date
                                        </button>
                                    </div>
                                </div>

                                {selectedAutomation?.triggerType === 'schedule' && (
                                    <div className="form-group fade-in" style={{ marginBottom: 20 }}>
                                        <label className="label" style={{ fontWeight: 600 }}>Event / Appointment Time</label>
                                        <input 
                                            type="datetime-local" 
                                            className="input" 
                                            value={selectedAutomation?.eventTime ? formatDateTimeLocal(selectedAutomation.eventTime) : ''} 
                                            onChange={e => setSelectedAutomation({ ...selectedAutomation, eventTime: e.target.value, scheduledAt: e.target.value })} 
                                        />
                                        <span style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginTop: 4 }}>
                                            The scheduled datetime used for running the flow and calculating "Event / Appointment time" delay steps.
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Groups List Selection */}
                            <div className="card" style={{ width: 350, flexShrink: 0, maxHeight: 'calc(100vh - 150px)', overflowY: 'auto' }}>
                                <h4 style={{ marginBottom: 10, fontSize: 13, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>
                                    👥 Target Groups ({builderState.targetGroups.length} selected)
                                </h4>
                                <input 
                                    className="input" 
                                    placeholder="Search Groups..." 
                                    value={groupSearch} 
                                    onChange={e => setGroupSearch(e.target.value)} 
                                    style={{ marginBottom: 10 }} 
                                />

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {groups.filter(g => (g.name || '').toLowerCase().includes(groupSearch.toLowerCase())).map(g => (
                                        <label key={g.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', borderRadius: 8, background: 'var(--bg3)', cursor: 'pointer', gap: 10 }}>
                                            <input 
                                                type="checkbox" 
                                                checked={builderState.targetGroups.includes(g.id)} 
                                                onChange={() => toggleGroup(g.id)} 
                                            />
                                            <div style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 13 }}>
                                                {g.name}
                                            </div>
                                        </label>
                                    ))}
                                    {groups.length === 0 && (
                                        <div style={{ textAlign: 'center', padding: 20, color: 'var(--text3)', fontSize: 12 }}>
                                            No WhatsApp groups connected or found.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {builderTab === 'enrollment' && (
                        <div className="card fade-in" style={{ width: '100%', minHeight: '400px', padding: 20 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                <div>
                                    <h4 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>👥 Enrollment History</h4>
                                    <span style={{ fontSize: 12, color: 'var(--text3)' }}>View list of all enrolled target groups and their flow progress.</span>
                                </div>
                                <button className="btn btn-ghost" onClick={() => loadLogs(selectedAutomation.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                                    🔄 Refresh History
                                </button>
                            </div>

                            {logsLoading ? (
                                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>Loading history...</div>
                            ) : getEnrollments().length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text3)' }}>
                                    <div style={{ fontSize: 40, marginBottom: 10 }}>👥</div>
                                    <h5 style={{ fontWeight: 600, fontSize: 14, margin: 0, color: 'var(--text)' }}>No enrollments found</h5>
                                    <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>Select target groups in the Settings or Builder tab and run the workflow.</p>
                                </div>
                            ) : (
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text3)' }}>
                                                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Group / Contact</th>
                                                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Enrolled On</th>
                                                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Last Active</th>
                                                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Progress</th>
                                                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {getEnrollments().map((e, index) => {
                                                const progressPercent = Math.min(100, Math.round(((e.progressCount || 0) / (e.totalSteps || 1)) * 100));
                                                let badgeColor = 'var(--text3)';
                                                let badgeBg = 'var(--bg3)';
                                                if (e.status === 'active') {
                                                    badgeColor = 'var(--accent)';
                                                    badgeBg = 'rgba(124, 58, 237, 0.1)';
                                                } else if (e.status === 'completed') {
                                                    badgeColor = 'var(--green)';
                                                    badgeBg = 'rgba(16, 185, 129, 0.1)';
                                                } else if (e.status === 'paused') {
                                                    badgeColor = 'var(--yellow)';
                                                    badgeBg = 'rgba(245, 158, 11, 0.1)';
                                                } else if (e.status === 'failed') {
                                                    badgeColor = 'var(--red)';
                                                    badgeBg = 'rgba(239, 68, 68, 0.1)';
                                                }

                                                return (
                                                    <tr key={index} style={{ borderBottom: '1px solid var(--border)' }} className="table-row-hover">
                                                        <td style={{ padding: '16px', fontWeight: 600 }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
                                                                    👥
                                                                </div>
                                                                <div>
                                                                    <div style={{ fontSize: 13, fontWeight: 600 }}>{e.groupName}</div>
                                                                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{e.groupId}</div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: '16px', color: 'var(--text3)' }}>
                                                            {new Date(e.enrolledOn).toLocaleString()}
                                                        </td>
                                                        <td style={{ padding: '16px', color: 'var(--text3)' }}>
                                                            {new Date(e.lastActive).toLocaleString()}
                                                        </td>
                                                        <td style={{ padding: '16px', width: '220px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                                <div style={{ flex: 1, height: 6, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
                                                                    <div style={{ width: `${progressPercent}%`, height: '100%', background: e.status === 'failed' ? 'var(--red)' : 'var(--accent)', borderRadius: 3, transition: 'width 0.3s' }}></div>
                                                                </div>
                                                                <span style={{ fontSize: 12, fontWeight: 600 }}>
                                                                    {e.progressCount} / {e.totalSteps}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: '16px' }}>
                                                            <span style={{ 
                                                                padding: '4px 10px', 
                                                                borderRadius: 12, 
                                                                fontSize: 11, 
                                                                fontWeight: 600,
                                                                color: badgeColor, 
                                                                background: badgeBg, 
                                                                textTransform: 'uppercase',
                                                                letterSpacing: 0.5
                                                            }}>
                                                                {e.status}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {builderTab === 'logs' && (
                        <div className="card fade-in" style={{ width: '100%', minHeight: '400px', padding: 20 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                <div>
                                    <h4 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>📋 Execution Logs</h4>
                                    <span style={{ fontSize: 12, color: 'var(--text3)' }}>View a history and details of all executions performed by this Workflow.</span>
                                </div>
                                <button className="btn btn-ghost" onClick={() => loadLogs(selectedAutomation.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                                    🔄 Refresh Logs
                                </button>
                            </div>

                            {/* Filters Row */}
                            <div style={{ 
                                display: 'flex', 
                                flexWrap: 'wrap', 
                                gap: 10, 
                                marginBottom: 20, 
                                padding: 15, 
                                background: 'var(--bg3)', 
                                borderRadius: 12, 
                                alignItems: 'center' 
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <input 
                                        type="date" 
                                        className="input" 
                                        value={filterDateStart} 
                                        onChange={e => setFilterDateStart(e.target.value)} 
                                        style={{ width: '140px', padding: '6px 10px', fontSize: 12 }} 
                                    />
                                    <span style={{ color: 'var(--text3)', fontSize: 12 }}>➔</span>
                                    <input 
                                        type="date" 
                                        className="input" 
                                        value={filterDateEnd} 
                                        onChange={e => setFilterDateEnd(e.target.value)} 
                                        style={{ width: '140px', padding: '6px 10px', fontSize: 12 }} 
                                    />
                                </div>

                                <select 
                                    className="input" 
                                    value={filterAction} 
                                    onChange={e => setFilterAction(e.target.value)} 
                                    style={{ flex: 1, minWidth: '130px', padding: '6px 10px', fontSize: 12 }}
                                >
                                    <option value="all">All Actions</option>
                                    {builderState.steps.map((step, idx) => (
                                        <option key={step._id || step.id || idx} value={step._id || step.id || idx}>
                                            Step {idx + 1}: {step.actionType === 'send_message' ? '📩 Message' : '⏱️ Delay'}
                                        </option>
                                    ))}
                                </select>

                                <select 
                                    className="input" 
                                    value={filterStatus} 
                                    onChange={e => setFilterStatus(e.target.value)} 
                                    style={{ flex: 1, minWidth: '120px', padding: '6px 10px', fontSize: 12 }}
                                >
                                    <option value="all">All Status</option>
                                    <option value="success">Success</option>
                                    <option value="failed">Failed</option>
                                    <option value="pending">Pending</option>
                                </select>

                                <select 
                                    className="input" 
                                    value={filterGroup} 
                                    onChange={e => setFilterGroup(e.target.value)} 
                                    style={{ flex: 1, minWidth: '150px', padding: '6px 10px', fontSize: 12 }}
                                >
                                    <option value="all">Select Group</option>
                                    {builderState.targetGroups.map(gid => {
                                        const g = groups.find(x => x.id === gid);
                                        return <option key={gid} value={gid}>{g ? g.name : gid}</option>;
                                    })}
                                </select>

                                <button 
                                    className="btn btn-ghost" 
                                    onClick={() => {
                                        const today = new Date();
                                        const past30Days = new Date();
                                        past30Days.setDate(today.getDate() - 30);
                                        setFilterDateStart(past30Days.toISOString().split('T')[0]);
                                        setFilterDateEnd(today.toISOString().split('T')[0]);
                                        setFilterAction('all');
                                        setFilterStatus('all');
                                        setFilterGroup('all');
                                    }}
                                    style={{ padding: '6px 12px', fontSize: 12 }}
                                >
                                    Reset Filters
                                </button>
                            </div>

                            {/* Logs Table */}
                            {logsLoading ? (
                                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>Loading execution logs...</div>
                            ) : totalFilteredLogs === 0 ? (
                                <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text3)' }}>
                                    <div style={{ fontSize: 40, marginBottom: 10 }}>🔍</div>
                                    <h5 style={{ fontWeight: 600, fontSize: 14, margin: 0, color: 'var(--text)' }}>No logs found</h5>
                                    <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>Execution Logs are available up to last 30 days.</p>
                                </div>
                            ) : (
                                <>
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                                            <thead>
                                                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text3)' }}>
                                                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Contact</th>
                                                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Action</th>
                                                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Status</th>
                                                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Executed On (IST +05:30)</th>
                                                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {currentLogs.map((log, index) => {
                                                    const group = groups.find(g => g.id === log.groupId) || { name: log.groupId };
                                                    const ui = getLogUIMapping(log, builderState.steps);
                                                    
                                                    return (
                                                        <tr key={log._id || index} style={{ borderBottom: '1px solid var(--border)' }} className="table-row-hover">
                                                            <td style={{ padding: '14px 16px', fontWeight: 600 }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                                    <div style={{
                                                                        width: '32px',
                                                                        height: '32px',
                                                                        borderRadius: '50%',
                                                                        backgroundColor: getAvatarColor(group.name).bg,
                                                                        color: getAvatarColor(group.name).text,
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        fontSize: '12px',
                                                                        fontWeight: '700'
                                                                    }}>
                                                                        {getInitials(group.name)}
                                                                    </div>
                                                                    <div>
                                                                        <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)' }}>
                                                                            {group.name}
                                                                        </div>
                                                                        <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 'normal' }}>
                                                                            {log.groupId}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td style={{ padding: '14px 16px' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text)' }}>
                                                                    <div style={{ 
                                                                        display: 'flex', 
                                                                        alignItems: 'center', 
                                                                        justifyContent: 'center', 
                                                                        width: '24px', 
                                                                        height: '24px', 
                                                                        borderRadius: '6px', 
                                                                        background: 'var(--bg3)' 
                                                                    }}>
                                                                        {ui.actionIcon}
                                                                    </div>
                                                                    <span style={{ fontSize: '13px', fontWeight: '500' }}>
                                                                        {ui.actionLabel}
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td style={{ padding: '14px 16px' }}>
                                                                <span style={{
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    padding: '4px 12px',
                                                                    borderRadius: '9999px',
                                                                    fontSize: '11px',
                                                                    fontWeight: '600',
                                                                    color: ui.statusColor,
                                                                    backgroundColor: ui.statusBg,
                                                                    border: `1px solid ${ui.statusColor}`,
                                                                    letterSpacing: '0.2px'
                                                                }}>
                                                                    {ui.statusLabel}
                                                                </span>
                                                            </td>
                                                            <td style={{ padding: '14px 16px', color: 'var(--text2)' }}>
                                                                {log.status === 'pending' && log.scheduledNextAt ? (
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                                        <span style={{ fontSize: '12px', color: '#8b5cf6', fontWeight: 'bold' }}>
                                                                            ⏰ Next at: {formatExecutedOn(log.scheduledNextAt)}
                                                                        </span>
                                                                        <span style={{ fontSize: '10px', color: 'var(--text3)' }}>
                                                                            Started: {formatExecutedOn(log.executedAt)}
                                                                        </span>
                                                                    </div>
                                                                ) : (
                                                                    formatExecutedOn(log.executedAt)
                                                                )}
                                                            </td>
                                                            <td style={{ padding: '14px 16px' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                                    <button 
                                                                        onClick={() => {
                                                                            setSelectedLogForDetails({
                                                                                log,
                                                                                groupName: group.name || log.groupId,
                                                                                actionLabel: ui.actionLabel,
                                                                                statusLabel: ui.statusLabel,
                                                                                statusColor: ui.statusColor,
                                                                                statusBg: ui.statusBg
                                                                            });
                                                                        }}
                                                                        style={{ 
                                                                            background: 'none', 
                                                                            border: 'none', 
                                                                            color: '#3b82f6', 
                                                                            cursor: 'pointer', 
                                                                            fontSize: '13px', 
                                                                            fontWeight: '600',
                                                                            padding: 0 
                                                                        }}
                                                                    >
                                                                        View Details
                                                                    </button>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text3)' }}>
                                                                        <button style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }} title="History">
                                                                            <RotateCcw size={14} />
                                                                        </button>
                                                                        <button style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }} title="Contact Profile">
                                                                            <User size={14} />
                                                                        </button>
                                                                        <button style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }} title="Redirect">
                                                                            <LogOut size={14} />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Pagination Controls */}
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        marginTop: '20px',
                                        paddingTop: '15px',
                                        borderTop: '1px solid var(--border)',
                                        fontSize: '13px',
                                        color: 'var(--text3)'
                                    }}>
                                        <div>Showing Page {logsPage}</div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                <select
                                                    value={logsPerPage}
                                                    onChange={(e) => {
                                                        setLogsPerPage(Number(e.target.value));
                                                        setLogsPage(1);
                                                    }}
                                                    style={{
                                                        background: 'var(--bg2)',
                                                        border: '1px solid var(--border)',
                                                        borderRadius: '6px',
                                                        padding: '4px 8px',
                                                        color: 'var(--text)',
                                                        fontSize: '12px',
                                                        outline: 'none',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    <option value={10}>10</option>
                                                    <option value={20}>20</option>
                                                    <option value={50}>50</option>
                                                    <option value={100}>100</option>
                                                </select>
                                            </div>
                                            <div style={{ display: 'flex', gap: '5px' }}>
                                                <button
                                                    disabled={logsPage === 1}
                                                    onClick={() => setLogsPage(prev => Math.max(1, prev - 1))}
                                                    style={{
                                                        background: 'var(--bg2)',
                                                        border: '1px solid var(--border)',
                                                        borderRadius: '6px',
                                                        padding: '6px 12px',
                                                        color: logsPage === 1 ? 'var(--text3)' : 'var(--text)',
                                                        cursor: logsPage === 1 ? 'not-allowed' : 'pointer',
                                                        fontSize: '12px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}
                                                >
                                                    ← Previous
                                                </button>
                                                <button
                                                    disabled={indexOfLastLog >= totalFilteredLogs}
                                                    onClick={() => setLogsPage(prev => prev + 1)}
                                                    style={{
                                                        background: 'var(--bg2)',
                                                        border: '1px solid var(--border)',
                                                        borderRadius: '6px',
                                                        padding: '6px 12px',
                                                        color: indexOfLastLog >= totalFilteredLogs ? 'var(--text3)' : 'var(--text)',
                                                        cursor: indexOfLastLog >= totalFilteredLogs ? 'not-allowed' : 'pointer',
                                                        fontSize: '12px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}
                                                >
                                                    Next →
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Modal for creating a new Automation */}
            {showAutoModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
                    <div className="card fade-in" style={{ width: '100%', maxWidth: 450, margin: 'auto' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                            <h3 style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 17 }}>Create New Automation</h3>
                            <button onClick={() => setShowAutoModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)' }}><X size={18} /></button>
                        </div>
                        <form onSubmit={createAutomation}>
                            <div className="form-group">
                                <label className="label">Automation Name</label>
                                <input className="input" placeholder="e.g. Daily Offer" value={autoForm.name} onChange={e => setAutoForm({ ...autoForm, name: e.target.value })} required />
                            </div>
                            <div className="form-group">
                                <label className="label">Trigger Type</label>
                                <div style={{ display: 'flex', gap: 10, marginTop: 5 }}>
                                    <button type="button" className={`btn ${autoForm.triggerType === 'manual' ? 'btn-primary' : 'btn-ghost'}`} style={{ flex: 1 }} onClick={() => setAutoForm({ ...autoForm, triggerType: 'manual' })}>Manual (Run Now)</button>
                                    <button type="button" className={`btn ${autoForm.triggerType === 'schedule' ? 'btn-primary' : 'btn-ghost'}`} style={{ flex: 1 }} onClick={() => setAutoForm({ ...autoForm, triggerType: 'schedule' })}>Scheduled Time</button>
                                </div>
                            </div>
                            {autoForm.triggerType === 'schedule' && (
                                <div className="form-group">
                                    <label className="label">Select Date & Time</label>
                                    <input type="datetime-local" className="input" value={autoForm.scheduledAt ? formatDateTimeLocal(autoForm.scheduledAt) : ''} onChange={e => setAutoForm({ ...autoForm, scheduledAt: e.target.value })} required />
                                </div>
                            )}
                            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
                                <button type="button" className="btn btn-ghost" onClick={() => setShowAutoModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Create</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Preview Modal */}
            {previewData && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
                    <div className="card fade-in" style={{ width: '100%', maxWidth: 800, margin: 'auto', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 }}>
                            <h3 style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 17 }}>Preview: {previewData.name}</h3>
                            <button onClick={() => setPreviewData(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)' }}><X size={18} /></button>
                        </div>

                        {/* Preview Tab Bar */}
                        <div style={{
                            display: 'flex',
                            borderBottom: '1px solid var(--border)',
                            marginBottom: '15px',
                            gap: '5px',
                            background: 'var(--bg2)',
                            padding: '0 10px',
                            borderRadius: '8px'
                        }}>
                            {[
                                { id: 'steps', label: 'Steps Flow', icon: '🎨' },
                                { id: 'enrollment', label: 'Enrollment History', icon: '👥' },
                                { id: 'logs', label: 'Execution Logs', icon: '📋' }
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setPreviewTab(tab.id)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        background: 'none',
                                        border: 'none',
                                        borderBottom: previewTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
                                        color: previewTab === tab.id ? 'var(--accent)' : 'var(--text3)',
                                        padding: '8px 12px',
                                        fontSize: '12px',
                                        fontWeight: '600',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        outline: 'none'
                                    }}
                                    onMouseEnter={(e) => { if (previewTab !== tab.id) e.currentTarget.style.color = 'var(--text)'; }}
                                    onMouseLeave={(e) => { if (previewTab !== tab.id) e.currentTarget.style.color = 'var(--text3)'; }}
                                >
                                    <span>{tab.icon}</span> {tab.label}
                                </button>
                            ))}
                        </div>

                        <div style={{ overflowY: 'auto', flex: 1, paddingRight: 5 }}>
                            {previewTab === 'steps' && (
                                <>
                                    <div style={{ marginBottom: 15, padding: 10, background: 'var(--bg2)', borderRadius: 8, fontSize: 13 }}>
                                        <div><b>Trigger:</b> {previewData.triggerType.toUpperCase()}</div>
                                        {previewData.triggerType === 'schedule' && previewData.scheduledAt && (
                                            <div style={{ marginTop: 5 }}><b>Starts At:</b> {new Date(previewData.scheduledAt).toLocaleString()}</div>
                                        )}
                                        <div style={{ marginTop: 5 }}>
                                            <b>Target Groups:</b> {previewData.targetGroups.length} selected
                                            {previewData.groupNames && previewData.groupNames.length > 0 && (
                                                <div style={{ marginTop: 4, color: 'var(--text3)', fontSize: 11 }}>
                                                    {previewData.groupNames.join(', ')}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        {previewData.steps && previewData.steps.length > 0 ? previewData.steps.map((step, idx) => (
                                            <div key={idx} style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 8 }}>
                                                <div style={{ fontSize: 11, fontWeight: 'bold', color: 'var(--accent)', marginBottom: 8 }}># STEP {idx + 1}</div>
                                                {step.actionType === 'send_message' && (
                                                    <div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--green)', fontSize: 13, marginBottom: 5 }}><FileText size={14} /> <b>Send Message</b></div>
                                                        {step.mediaUrl && <div style={{ fontSize: 11, color: 'var(--accent)', marginBottom: 5 }}>[Contains Media]</div>}
                                                        <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', background: 'var(--bg2)', padding: 10, borderRadius: 6 }}>{step.message || <i>(No text content)</i>}</div>
                                                    </div>
                                                )}
                                                {step.actionType === 'delay' && (
                                                    <div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--yellow)', fontSize: 13, marginBottom: 5 }}><Clock size={14} /> <b>Wait / Delay</b></div>
                                                        <div style={{ fontSize: 13 }}>
                                                            {step.delayOption === 'exact_time' && step.delayUntilDate
                                                                ? `Until ${new Date(step.delayUntilDate).toLocaleString()}`
                                                                : `For ${step.delayValue || step.delayMinutes} ${step.delayUnit || 'minutes'}`
                                                            }
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )) : (
                                            <div style={{ textAlign: 'center', padding: 20, color: 'var(--text3)', fontSize: 13 }}>No steps configured yet.</div>
                                        )}
                                    </div>
                                </>
                            )}

                            {previewTab === 'enrollment' && (
                                <>
                                    {getPreviewEnrollments(previewData).length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--text3)' }}>
                                            <div style={{ fontSize: 32, marginBottom: 8 }}>👥</div>
                                            <h5 style={{ fontWeight: 600, fontSize: 13, margin: 0, color: 'var(--text)' }}>No enrollments found</h5>
                                        </div>
                                    ) : (
                                        <div style={{ overflowX: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12 }}>
                                                <thead>
                                                    <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text3)' }}>
                                                        <th style={{ padding: '8px', fontWeight: 600 }}>Group</th>
                                                        <th style={{ padding: '8px', fontWeight: 600 }}>Progress</th>
                                                        <th style={{ padding: '8px', fontWeight: 600 }}>Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {getPreviewEnrollments(previewData).map((e, index) => {
                                                        const progressPercent = Math.min(100, Math.round(((e.progressCount || 0) / (e.totalSteps || 1)) * 100));
                                                        let badgeColor = 'var(--text3)';
                                                        let badgeBg = 'var(--bg3)';
                                                        if (e.status === 'active') {
                                                            badgeColor = 'var(--accent)';
                                                            badgeBg = 'rgba(124, 58, 237, 0.1)';
                                                        } else if (e.status === 'completed') {
                                                            badgeColor = 'var(--green)';
                                                            badgeBg = 'rgba(16, 185, 129, 0.1)';
                                                        } else if (e.status === 'paused') {
                                                            badgeColor = 'var(--yellow)';
                                                            badgeBg = 'rgba(245, 158, 11, 0.1)';
                                                        } else if (e.status === 'failed') {
                                                            badgeColor = 'var(--red)';
                                                            badgeBg = 'rgba(239, 68, 68, 0.1)';
                                                        }

                                                        return (
                                                            <tr key={index} style={{ borderBottom: '1px solid var(--border)' }}>
                                                                <td style={{ padding: '8px', fontWeight: 600 }}>
                                                                    <div>{e.groupName}</div>
                                                                    <div style={{ fontSize: 10, color: 'var(--text3)' }}>{e.groupId}</div>
                                                                </td>
                                                                <td style={{ padding: '8px' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                        <div style={{ width: '80px', height: 4, background: 'var(--bg3)', borderRadius: 2, overflow: 'hidden' }}>
                                                                            <div style={{ width: `${progressPercent}%`, height: '100%', background: e.status === 'failed' ? 'var(--red)' : 'var(--accent)', borderRadius: 2 }}></div>
                                                                        </div>
                                                                        <span style={{ fontSize: 11, fontWeight: 600 }}>
                                                                            {e.progressCount}/{e.totalSteps}
                                                                        </span>
                                                                    </div>
                                                                </td>
                                                                <td style={{ padding: '8px' }}>
                                                                    <span style={{ 
                                                                        padding: '2px 6px', 
                                                                        borderRadius: 8, 
                                                                        fontSize: 9, 
                                                                        fontWeight: 600,
                                                                        color: badgeColor, 
                                                                        background: badgeBg, 
                                                                        textTransform: 'uppercase'
                                                                    }}>
                                                                        {e.status}
                                                                    </span>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </>
                            )}

                            {previewTab === 'logs' && (() => {
                                const previewFilteredLogs = getFormattedLogsWithMilestones(
                                    previewData.logs || [],
                                    previewData.steps || [],
                                    previewData.targetGroups || []
                                );
                                const totalPreviewLogs = previewFilteredLogs.length;
                                const indexOfLastPreviewLog = previewLogsPage * previewLogsPerPage;
                                const indexOfFirstPreviewLog = indexOfLastPreviewLog - previewLogsPerPage;
                                const currentPreviewLogs = previewFilteredLogs.slice(indexOfFirstPreviewLog, indexOfLastPreviewLog);
                                
                                return (
                                    <>
                                        {previewFilteredLogs.length === 0 ? (
                                            <div style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--text3)' }}>
                                                <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
                                                <h5 style={{ fontWeight: 600, fontSize: 13, margin: 0, color: 'var(--text)' }}>No logs found</h5>
                                            </div>
                                        ) : (
                                            <>
                                                <div style={{ overflowX: 'auto' }}>
                                                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12 }}>
                                                        <thead>
                                                            <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text3)' }}>
                                                                <th style={{ padding: '10px 8px', fontWeight: 600 }}>Contact</th>
                                                                <th style={{ padding: '10px 8px', fontWeight: 600 }}>Action</th>
                                                                <th style={{ padding: '10px 8px', fontWeight: 600 }}>Status</th>
                                                                <th style={{ padding: '10px 8px', fontWeight: 600 }}>Executed On (IST +05:30)</th>
                                                                <th style={{ padding: '10px 8px', fontWeight: 600 }}>Actions</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {currentPreviewLogs.map((log, index) => {
                                                                const group = groups.find(g => g.id === log.groupId) || { name: log.groupId };
                                                                const ui = getLogUIMapping(log, previewData.steps);
                                                                return (
                                                                    <tr key={log._id || index} style={{ borderBottom: '1px solid var(--border)' }}>
                                                                        <td style={{ padding: '10px 8px', fontWeight: 600 }}>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                                <div style={{
                                                                                    width: '28px',
                                                                                    height: '28px',
                                                                                    borderRadius: '50%',
                                                                                    backgroundColor: getAvatarColor(group.name).bg,
                                                                                    color: getAvatarColor(group.name).text,
                                                                                    display: 'flex',
                                                                                    alignItems: 'center',
                                                                                    justifyContent: 'center',
                                                                                    fontSize: '11px',
                                                                                    fontWeight: '700'
                                                                                }}>
                                                                                    {getInitials(group.name)}
                                                                                </div>
                                                                                <div>
                                                                                    <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text)' }}>
                                                                                        {group.name}
                                                                                    </div>
                                                                                    <div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 'normal' }}>
                                                                                        {log.groupId}
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        </td>
                                                                        <td style={{ padding: '10px 8px' }}>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text)' }}>
                                                                                <div style={{ 
                                                                                    display: 'flex', 
                                                                                    alignItems: 'center', 
                                                                                    justifyContent: 'center', 
                                                                                    width: '20px', 
                                                                                    height: '20px', 
                                                                                    borderRadius: '4px', 
                                                                                    background: 'var(--bg3)' 
                                                                                }}>
                                                                                    {ui.actionIcon}
                                                                                </div>
                                                                                <span style={{ fontSize: '12px', fontWeight: '500' }}>
                                                                                    {ui.actionLabel}
                                                                                </span>
                                                                            </div>
                                                                        </td>
                                                                        <td style={{ padding: '10px 8px' }}>
                                                                            <span style={{
                                                                                display: 'inline-flex',
                                                                                alignItems: 'center',
                                                                                padding: '2px 8px',
                                                                                borderRadius: '9999px',
                                                                                fontSize: '10px',
                                                                                fontWeight: '600',
                                                                                color: ui.statusColor,
                                                                                backgroundColor: ui.statusBg,
                                                                                border: `1px solid ${ui.statusColor}`,
                                                                                letterSpacing: '0.1px'
                                                                            }}>
                                                                                {ui.statusLabel}
                                                                            </span>
                                                                        </td>
                                                                        <td style={{ padding: '10px 8px', color: 'var(--text2)', fontSize: '11px' }}>
                                                                            {log.status === 'pending' && log.scheduledNextAt ? (
                                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                                                    <span style={{ fontSize: '11px', color: '#8b5cf6', fontWeight: 'bold' }}>
                                                                                        ⏰ Next at: {formatExecutedOn(log.scheduledNextAt)}
                                                                                    </span>
                                                                                    <span style={{ fontSize: '9px', color: 'var(--text3)' }}>
                                                                                        Started: {formatExecutedOn(log.executedAt)}
                                                                                    </span>
                                                                                </div>
                                                                            ) : (
                                                                                formatExecutedOn(log.executedAt)
                                                                            )}
                                                                        </td>
                                                                        <td style={{ padding: '10px 8px' }}>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                                <button 
                                                                                    onClick={() => {
                                                                                        setSelectedLogForDetails({
                                                                                            log,
                                                                                            groupName: group.name || log.groupId,
                                                                                            actionLabel: ui.actionLabel,
                                                                                            statusLabel: ui.statusLabel,
                                                                                            statusColor: ui.statusColor,
                                                                                            statusBg: ui.statusBg
                                                                                        });
                                                                                    }}
                                                                                    style={{ 
                                                                                        background: 'none', 
                                                                                        border: 'none', 
                                                                                        color: '#3b82f6', 
                                                                                        cursor: 'pointer', 
                                                                                        fontSize: '12px', 
                                                                                        fontWeight: '600',
                                                                                        padding: 0 
                                                                                    }}
                                                                                >
                                                                                    View Details
                                                                                </button>
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text3)' }}>
                                                                                    <button style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }} title="History">
                                                                                        <RotateCcw size={12} />
                                                                                    </button>
                                                                                    <button style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }} title="Contact Profile">
                                                                                        <User size={12} />
                                                                                    </button>
                                                                                    <button style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }} title="Redirect">
                                                                                        <LogOut size={12} />
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>

                                                {/* Preview Pagination */}
                                                <div style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    marginTop: '15px',
                                                    paddingTop: '10px',
                                                    borderTop: '1px solid var(--border)',
                                                    fontSize: '12px',
                                                    color: 'var(--text3)'
                                                }}>
                                                    <div>Showing Page {previewLogsPage}</div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <select
                                                            value={previewLogsPerPage}
                                                            onChange={(e) => {
                                                                setPreviewLogsPerPage(Number(e.target.value));
                                                                setPreviewLogsPage(1);
                                                            }}
                                                            style={{
                                                                background: 'var(--bg2)',
                                                                border: '1px solid var(--border)',
                                                                borderRadius: '6px',
                                                                padding: '2px 6px',
                                                                color: 'var(--text)',
                                                                fontSize: '11px',
                                                                outline: 'none',
                                                                cursor: 'pointer'
                                                            }}
                                                        >
                                                            <option value={10}>10</option>
                                                            <option value={20}>20</option>
                                                            <option value={50}>50</option>
                                                        </select>
                                                        <div style={{ display: 'flex', gap: '4px' }}>
                                                            <button
                                                                disabled={previewLogsPage === 1}
                                                                onClick={() => setPreviewLogsPage(prev => Math.max(1, prev - 1))}
                                                                style={{
                                                                    background: 'var(--bg2)',
                                                                    border: '1px solid var(--border)',
                                                                    borderRadius: '4px',
                                                                    padding: '4px 8px',
                                                                    color: previewLogsPage === 1 ? 'var(--text3)' : 'var(--text)',
                                                                    cursor: previewLogsPage === 1 ? 'not-allowed' : 'pointer',
                                                                    fontSize: '11px'
                                                                }}
                                                            >
                                                                ← Prev
                                                            </button>
                                                            <button
                                                                disabled={indexOfLastPreviewLog >= totalPreviewLogs}
                                                                onClick={() => setPreviewLogsPage(prev => prev + 1)}
                                                                style={{
                                                                    background: 'var(--bg2)',
                                                                    border: '1px solid var(--border)',
                                                                    borderRadius: '4px',
                                                                    padding: '4px 8px',
                                                                    color: indexOfLastPreviewLog >= totalPreviewLogs ? 'var(--text3)' : 'var(--text)',
                                                                    cursor: indexOfLastPreviewLog >= totalPreviewLogs ? 'not-allowed' : 'pointer',
                                                                    fontSize: '11px'
                                                                }}
                                                            >
                                                                Next →
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </>
                                );
                            })()}
                        </div>
                        <div style={{ marginTop: 15, display: 'flex', justifyContent: 'flex-end' }}>
                            <button className="btn btn-ghost" onClick={() => setPreviewData(null)}>Close</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Sliding Event Details Side Drawer */}
            {selectedLogForDetails && (() => {
                const detailLog = selectedLogForDetails.log;
                const groupName = selectedLogForDetails.groupName;
                const actionLabel = selectedLogForDetails.actionLabel;
                const statusLabel = selectedLogForDetails.statusLabel;
                const statusColor = selectedLogForDetails.statusColor;
                const statusBg = selectedLogForDetails.statusBg;

                // Find the step in current steps to get details like message/offset
                const stepsList = previewData ? previewData.steps : builderState.steps;
                const step = (stepsList || []).find(s => s._id === detailLog.stepId || s.id === detailLog.stepId);
                
                // Find trigger type
                const triggerName = previewData ? previewData.triggerType : (selectedAutomation?.triggerType || 'manual');

                return (
                    <>
                        {/* Drawer Backdrop Overlay */}
                        <div 
                            onClick={() => setSelectedLogForDetails(null)}
                            style={{
                                position: 'fixed',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                                backdropFilter: 'blur(4px)',
                                zIndex: 1050,
                                animation: 'fadeIn 0.2s ease-out'
                            }}
                        />
                        {/* Sliding Drawer Container */}
                        <div 
                            style={{
                                position: 'fixed',
                                top: 0,
                                right: 0,
                                bottom: 0,
                                width: '420px',
                                maxWidth: '100%',
                                backgroundColor: 'var(--bg)',
                                boxShadow: '-10px 0 30px rgba(0, 0, 0, 0.25)',
                                borderLeft: '1px solid var(--border)',
                                zIndex: 1060,
                                display: 'flex',
                                flexDirection: 'column',
                                animation: 'slideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                                color: 'var(--text)',
                                fontFamily: 'var(--font-head)'
                            }}
                        >
                            {/* Header */}
                            <div style={{
                                padding: '24px',
                                borderBottom: '1px solid var(--border)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                position: 'relative'
                            }}>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: 'var(--text)' }}>Event Details</h3>
                                    <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text3)' }}>All event related details can be found here</p>
                                </div>
                                <button 
                                    onClick={() => setSelectedLogForDetails(null)}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        color: 'var(--text3)',
                                        padding: '6px',
                                        borderRadius: '50%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'background-color 0.2s'
                                    }}
                                    className="btn-ghost-hover"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Content */}
                            <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                {/* Contact */}
                                <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
                                    <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text3)', fontWeight: 'bold', letterSpacing: '0.5px', marginBottom: '8px' }}>
                                        Contact
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div style={{
                                            width: '38px',
                                            height: '38px',
                                            borderRadius: '50%',
                                            backgroundColor: getAvatarColor(groupName).bg,
                                            color: getAvatarColor(groupName).text,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '13px',
                                            fontWeight: '700'
                                        }}>
                                            {getInitials(groupName)}
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text)' }}>
                                                {groupName}
                                            </div>
                                            <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>
                                                {detailLog.groupId}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Action */}
                                <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
                                    <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text3)', fontWeight: 'bold', letterSpacing: '0.5px', marginBottom: '6px' }}>
                                        Action
                                    </div>
                                    <div style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text)' }}>
                                        {actionLabel}
                                    </div>
                                </div>

                                {/* Event Status */}
                                <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
                                    <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text3)', fontWeight: 'bold', letterSpacing: '0.5px', marginBottom: '8px' }}>
                                        Event Status
                                    </div>
                                    <span style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        padding: '4px 12px',
                                        borderRadius: '9999px',
                                        fontSize: '11px',
                                        fontWeight: '600',
                                        color: statusColor,
                                        backgroundColor: statusBg,
                                        border: `1px solid ${statusColor}`
                                    }}>
                                        {statusLabel}
                                    </span>
                                </div>

                                {/* Added From */}
                                <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
                                    <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text3)', fontWeight: 'bold', letterSpacing: '0.5px', marginBottom: '4px' }}>
                                        Added From
                                    </div>
                                    <div style={{ fontSize: '13px', color: 'var(--text)' }}>
                                        <span style={{ fontWeight: '600' }}>Trigger</span>
                                    </div>
                                    <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>
                                        Name: {triggerName === 'manual' ? 'Manual Run' : triggerName === 'schedule' ? 'Time Scheduled' : 'Workflow Trigger'}
                                    </div>
                                </div>

                                {/* Step ID */}
                                {detailLog.stepId && detailLog.stepId !== 'start' && detailLog.stepId !== 'end' && (
                                    <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
                                        <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text3)', fontWeight: 'bold', letterSpacing: '0.5px', marginBottom: '4px' }}>
                                            Step - {step ? `Order ${step.stepOrder || ''}` : ''}
                                        </div>
                                        <div style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--text2)', wordBreak: 'break-all' }}>
                                            {detailLog.stepId}
                                        </div>
                                    </div>
                                )}

                                {/* Message / Delay Config / Error */}
                                <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
                                    <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text3)', fontWeight: 'bold', letterSpacing: '0.5px', marginBottom: '8px' }}>
                                        Details & payload
                                    </div>
                                    
                                    {/* If it's a message step, show message */}
                                    {step?.actionType === 'send_message' && (
                                        <div style={{ backgroundColor: 'var(--bg2)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', whiteSpace: 'pre-wrap', color: 'var(--text)' }}>
                                            <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 'bold', marginBottom: '6px', textTransform: 'uppercase' }}>Message Template:</div>
                                            {step.message}
                                            {step.mediaUrl && (
                                                <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border)', fontSize: '11px', color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    🔗 Media: <a href={step.mediaUrl} target="_blank" rel="noopener noreferrer" style={{ wordBreak: 'break-all', color: 'inherit', textDecoration: 'underline' }}>{step.mediaUrl}</a>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* If it's a delay step, show delay configs */}
                                    {step?.actionType === 'delay' && (
                                        <div style={{ backgroundColor: 'var(--bg2)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px', color: 'var(--text)' }}>
                                            <div><b style={{ color: 'var(--text3)' }}>Type:</b> {step.delayOption === 'event_time' ? 'Event Relative Time' : step.delayOption === 'exact_time' ? 'Exact Specific Time' : 'Time Interval'}</div>
                                            {step.delayOption === 'event_time' && (
                                                <>
                                                    <div><b style={{ color: 'var(--text3)' }}>Offset:</b> {step.eventOffsetDays || 0}d {step.eventOffsetHours || 0}h {step.eventOffsetMinutes || 0}m</div>
                                                    <div><b style={{ color: 'var(--text3)' }}>When:</b> {step.eventWhen?.toUpperCase()} Event</div>
                                                </>
                                            )}
                                            {step.delayOption === 'exact_time' && (
                                                <div><b style={{ color: 'var(--text3)' }}>Exact Date:</b> {step.delayUntilDate ? new Date(step.delayUntilDate).toLocaleString() : '-'}</div>
                                            )}
                                            {step.delayOption !== 'event_time' && step.delayOption !== 'exact_time' && (
                                                <div><b style={{ color: 'var(--text3)' }}>Interval:</b> {step.delayValue || step.delayMinutes || 0} {step.delayUnit || 'minutes'}</div>
                                            )}
                                        </div>
                                    )}

                                    {/* Error log if failed */}
                                    {detailLog.error && (
                                        <div style={{ marginTop: '10px', backgroundColor: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '12px', borderRadius: '8px', fontSize: '12px', color: '#ef4444', fontWeight: '500' }}>
                                            <div style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '4px' }}>Execution Error:</div>
                                            {detailLog.error}
                                        </div>
                                    )}
                                </div>

                                {/* Executed On */}
                                <div>
                                    <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text3)', fontWeight: 'bold', letterSpacing: '0.5px', marginBottom: '4px' }}>
                                        Executed On
                                    </div>
                                    <div style={{ fontSize: '13px', color: 'var(--text)' }}>
                                        {formatExecutedOn(detailLog.executedAt)}
                                    </div>
                                    {detailLog.status === 'pending' && detailLog.scheduledNextAt && (
                                        <div style={{ marginTop: '8px', backgroundColor: 'rgba(139, 92, 246, 0.08)', padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(139, 92, 246, 0.2)', fontSize: '12px', color: '#8b5cf6', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            ⏰ Next message scheduled: {formatExecutedOn(detailLog.scheduledNextAt)}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Keyframe animation in JSX */}
                            <style>{`
                                @keyframes slideIn {
                                    from { transform: translateX(100%); }
                                    to { transform: translateX(0); }
                                }
                                @keyframes fadeIn {
                                    from { opacity: 0; }
                                    to { opacity: 1; }
                                }
                                .btn-ghost-hover:hover {
                                    background-color: var(--bg3) !important;
                                }
                            `}</style>
                        </div>
                    </>
                );
            })()}
        </div>
    );
}
