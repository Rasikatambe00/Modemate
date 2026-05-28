import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import './index.css';
import { StrictMode, useState, useCallback, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function now() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function timeAgo(date) {
    const secs = Math.floor((Date.now() - date.getTime()) / 1000);
    if (secs < 5)
        return 'just now';
    if (secs < 60)
        return `${secs}s ago`;
    const mins = Math.floor(secs / 60);
    if (mins < 60)
        return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
}
const RISK_ORDER = ['low', 'medium', 'high', 'critical'];
function adjustQueueRisk(meta, settings) {
    return meta.map((item) => {
        let idx = Math.max(0, RISK_ORDER.indexOf(item.riskLevel));
        const reason = item.reason.toLowerCase();
        if (settings.harassmentSensitivity === 'high' && (reason.includes('harass') || reason.includes('hate') || reason.includes('hostile'))) {
            idx = Math.min(idx + 1, RISK_ORDER.length - 1);
        }
        if (settings.spamAggression === 'high' && (reason.includes('spam') || reason.includes('link') || reason.includes('repost'))) {
            idx = Math.min(idx + 1, RISK_ORDER.length - 1);
        }
        return { ...item, riskLevel: RISK_ORDER[idx] };
    });
}
function generateInsights(data, settings) {
    if (!settings.enableContextSignals)
        return [];
    const { user, report, timeline, signals } = data;
    const results = [];
    const removalCount = timeline.filter((e) => /removed/i.test(e.action)).length;
    const warningCount = user.priorWarnings;
    const banCount = user.banHistory;
    const isNewAccount = user.accountAgeDays < 30;
    const isOldAccount = user.accountAgeDays > 365;
    const hasActivitySpike = signals.some((s) => /spike|frequency|posting/i.test(s.label));
    const spikeSignal = signals.find((s) => /spike|frequency|posting/i.test(s.label));
    if (isNewAccount) {
        results.push({ icon: '🕐', text: `Account is ${user.accountAgeDays} day${user.accountAgeDays === 1 ? '' : 's'} old with rapid escalation pattern.` });
    }
    else if (isOldAccount) {
        results.push({ icon: '📋', text: `Long-standing member (${user.accountAgeDays}d) with recent behavioral decline.` });
    }
    if (removalCount >= 2) {
        results.push({ icon: '🗑️', text: `Repeated removals (${removalCount}) within the moderation history.` });
    }
    else if (removalCount === 1) {
        results.push({ icon: '🗑️', text: 'Content removal recorded in the current moderation period.' });
    }
    if (warningCount > 0) {
        results.push({ icon: '⚠️', text: `Previously warned ${warningCount} time${warningCount === 1 ? '' : 's'} for rule violations.` });
    }
    if (banCount > 0) {
        results.push({ icon: '🔒', text: `Has ${banCount} prior ban${banCount === 1 ? '' : 's'} on record.` });
    }
    if (hasActivitySpike && spikeSignal) {
        results.push({ icon: '📈', text: spikeSignal.value.charAt(0).toLowerCase() + spikeSignal.value.slice(1) });
    }
    if (report.reasons.length > 0) {
        const primary = report.reasons[0];
        if (!results.some((r) => r.text.toLowerCase().includes(primary.toLowerCase()))) {
            results.push({ icon: '🚩', text: `Reported for ${primary}${report.reasons.length > 1 ? ` and ${report.reasons.length - 1} other reason(s)` : ''}.` });
        }
    }
    if (results.length < 3 && timeline.length > 0) {
        const recentMod = timeline[0].moderator;
        results.push({ icon: '👮', text: `Most recent moderation action by ${recentMod}.` });
    }
    return results.slice(0, 3);
}
function computeSuggestion(data, settings) {
    if (data.permanentlyBanned) {
        return { label: 'Case closed', text: 'User has been permanently banned from the community. No further action required.' };
    }
    const { priorWarnings, banHistory } = data.user;
    const threshold = settings.warningThreshold;
    const strict = settings.strictnessLevel;
    const escalation = settings.autoEscalation;
    const severity = strict === 'high' ? 0 : strict === 'medium' ? 1 : 2;
    const effectiveThreshold = threshold - severity;
    if (priorWarnings >= effectiveThreshold && escalation) {
        return {
            label: 'Permanent ban recommended',
            text: `User has exceeded the warning threshold (${priorWarnings}/${effectiveThreshold}) with auto-escalation enabled. Recommend permanent ban.`,
        };
    }
    if (priorWarnings >= Math.floor(effectiveThreshold / 2) || banHistory > 0) {
        return {
            label: `${settings.tempBanDuration} temp ban recommended`,
            text: `User has ${priorWarnings} prior warning(s) and ${banHistory} prior ban(s). A ${settings.tempBanDuration} temporary ban is advised.`,
        };
    }
    return {
        label: 'Issue formal warning',
        text: 'User has not yet exceeded the warning threshold. A formal warning may be sufficient.',
    };
}
// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------
const CASE_1 = {
    user: { username: 'u/troubled_user_42', karma: 1_247, accountAgeDays: 183, priorWarnings: 3, banHistory: 1, lastActionDays: 2, riskLevel: 'high' },
    signals: [
        { label: 'Escalating Hostility', value: 'Sharp increase in reportable language over 7 days', severity: 'high' },
        { label: 'Recent Removals', value: '3 comments removed in the past 48 hours', severity: 'medium' },
        { label: 'Activity Spike', value: '12× normal posting frequency in last 24 hours', severity: 'critical' },
    ],
    timeline: [
        { date: '2026-05-26 14:32', action: 'Comment Removed', moderator: 'AutoMod', detail: 'Rule 3: Harassment' },
        { date: '2026-05-25 09:15', action: 'Warning Issued', moderator: 'u/AliceMod', detail: 'Rule 1: Be civil' },
        { date: '2026-05-18 22:01', action: 'Comment Removed', moderator: 'u/BobMod', detail: 'Rule 5: Spam' },
        { date: '2026-05-12 16:44', action: 'Temp Ban (3 days)', moderator: 'AutoMod', detail: 'Repeat offense' },
        { date: '2026-05-01 11:20', action: 'Warning Issued', moderator: 'u/AliceMod', detail: 'Low-effort repost' },
        { date: '2026-04-28 07:33', action: 'Comment Removed', moderator: 'AutoMod', detail: 'External link' },
        { date: '2026-04-10 19:05', action: 'Warning Issued', moderator: 'u/CharlieMod', detail: 'Off-topic content' },
    ],
    recentActions: [
        { moderator: 'u/AliceMod', action: 'removed comment', target: 'u/troubled_user_42', timestamp: '2h ago' },
        { moderator: 'u/BobMod', action: 'issued warning', target: 'u/troubled_user_42', timestamp: '1d ago' },
        { moderator: 'AutoMod', action: 'temp banned', target: 'u/troubled_user_42', timestamp: '3d ago' },
    ],
    report: { content: '"Mods are corrupt idiots and this sub is garbage."', reasons: ['Harassment', 'Abuse', 'Rule 1'] },
    moderator: 'u/AliceMod',
    permanentlyBanned: false,
    suggestionLabel: '3-day temp ban recommended',
    suggestionText: 'Based on repeated removals within 14 days and escalating hostility pattern.',
};
const CASE_2 = {
    user: { username: 'u/angry_user_1', karma: 632, accountAgeDays: 41, priorWarnings: 1, banHistory: 0, lastActionDays: 0, riskLevel: 'medium' },
    signals: [
        { label: 'Escalating Hostility', value: 'Aggressive tone intensifying across 5+ comments', severity: 'medium' },
        { label: 'Recent Removals', value: '1 comment removed 6 hours ago', severity: 'low' },
        { label: 'Activity Spike', value: '8 comments in the last 90 minutes', severity: 'medium' },
    ],
    timeline: [
        { date: '2026-05-27 08:12', action: 'Comment Removed', moderator: 'AutoMod', detail: 'Rule 1: Be civil' },
        { date: '2026-05-26 19:44', action: 'Warning Issued', moderator: 'u/AliceMod', detail: 'Harassing language' },
    ],
    recentActions: [
        { moderator: 'u/AliceMod', action: 'issued warning', target: 'u/angry_user_1', timestamp: '12h ago' },
    ],
    report: { content: '"Why are you all so stupid? Learn to read the rules."', reasons: ['Harassment', 'Rule 1'] },
    moderator: 'u/BobMod',
    permanentlyBanned: false,
    suggestionLabel: 'Issue formal warning',
    suggestionText: 'First-time offender with escalating tone. A warning + removal may de-escalate.',
};
const CASE_3 = {
    user: { username: 'u/spam_throwaway', karma: 12, accountAgeDays: 3, priorWarnings: 0, banHistory: 2, lastActionDays: 1, riskLevel: 'low' },
    signals: [
        { label: 'Spam Pattern', value: 'Identical link posted across 4 subreddits', severity: 'low' },
        { label: 'Account Age', value: '3 days old with 0 community engagement', severity: 'low' },
        { label: 'Ban History', value: '2 prior accounts linked to same domain', severity: 'medium' },
    ],
    timeline: [
        { date: '2026-05-27 06:00', action: 'Post Removed', moderator: 'AutoMod', detail: 'Rule 7: Spam' },
        { date: '2026-05-26 22:15', action: 'Post Removed', moderator: 'AutoMod', detail: 'Rule 7: Spam' },
    ],
    recentActions: [
        { moderator: 'AutoMod', action: 'removed comment', target: 'u/spam_throwaway', timestamp: '3h ago' },
    ],
    report: { content: '"Check out this amazing deal!!! http://spam-site.example.com/ref"', reasons: ['Spam', 'Rule 7'] },
    moderator: 'AutoMod',
    permanentlyBanned: false,
    suggestionLabel: 'Permanent ban + report to admins',
    suggestionText: 'Clear spam account with link reposting. Recommend permanent ban and admin report for site-wide action.',
};
const CASE_4 = {
    user: { username: 'u/fresh_account99', karma: 5, accountAgeDays: 1, priorWarnings: 0, banHistory: 1, lastActionDays: 0, riskLevel: 'critical' },
    signals: [
        { label: 'Ban Evasion', value: 'Account created minutes after ban — near-certain evasion', severity: 'critical' },
        { label: 'Behavior Match', value: 'Posting identical content as banned user u/old_account_99', severity: 'critical' },
        { label: 'Immediate Violation', value: 'First post breaks Rule 3 within 5 minutes of account creation', severity: 'high' },
    ],
    timeline: [
        { date: '2026-05-27 09:30', action: 'Comment Removed', moderator: 'AutoMod', detail: 'Rule 3: Harassment' },
    ],
    recentActions: [],
    report: { content: '"You banned my other account for no reason. Mods are power-tripping losers."', reasons: ['Ban Evasion', 'Harassment', 'Rule 3'] },
    moderator: 'u/AliceMod',
    permanentlyBanned: false,
    suggestionLabel: 'Immediate permanent ban',
    suggestionText: 'Clear ban evasion with matching content and behavior. Permanent ban is the only appropriate action.',
};
const CASE_5 = {
    user: { username: 'u/low_effort_poster', karma: 3_421, accountAgeDays: 365, priorWarnings: 2, banHistory: 0, lastActionDays: 5, riskLevel: 'low' },
    signals: [
        { label: 'Low-Effort Pattern', value: 'Repetitive low-quality image posts flagged by community', severity: 'low' },
        { label: 'Recent Removals', value: '4 posts removed in the past week', severity: 'low' },
        { label: 'Quality Decline', value: 'Gradual drop in post quality over last 3 months', severity: 'low' },
    ],
    timeline: [
        { date: '2026-05-25 14:10', action: 'Post Removed', moderator: 'AutoMod', detail: 'Low-effort content' },
        { date: '2026-05-23 11:05', action: 'Post Removed', moderator: 'AutoMod', detail: 'Low-effort content' },
        { date: '2026-05-20 08:30', action: 'Warning Issued', moderator: 'u/CharlieMod', detail: 'Please add context to posts' },
        { date: '2026-05-15 19:22', action: 'Post Removed', moderator: 'AutoMod', detail: 'Repost — already submitted' },
    ],
    recentActions: [
        { moderator: 'u/CharlieMod', action: 'issued warning', target: 'u/low_effort_poster', timestamp: '5d ago' },
    ],
    report: { content: 'Just another screenshot with no title or explanation.', reasons: ['Low-Effort Repost', 'Rule 6'] },
    moderator: 'u/CharlieMod',
    permanentlyBanned: false,
    suggestionLabel: 'Send polite quality reminder',
    suggestionText: 'Long-standing member with recent quality issues. A friendly reminder may restore previous behavior.',
};
const MOCK_CASES = {
    'case-1': CASE_1,
    'case-2': CASE_2,
    'case-3': CASE_3,
    'case-4': CASE_4,
    'case-5': CASE_5,
};
const MOCK_QUEUE_META = [
    { id: 'case-1', username: 'u/troubled_user_42', reason: 'Harassment', riskLevel: 'high', unread: false },
    { id: 'case-2', username: 'u/angry_user_1', reason: 'Harassment', riskLevel: 'medium', unread: true },
    { id: 'case-3', username: 'u/spam_throwaway', reason: 'Spam', riskLevel: 'low', unread: true },
    { id: 'case-4', username: 'u/fresh_account99', reason: 'Ban Evasion', riskLevel: 'critical', unread: true },
    { id: 'case-5', username: 'u/low_effort_poster', reason: 'Low-Effort Reposts', riskLevel: 'low', unread: false },
];
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const RISK_COLORS = {
    low: { badge: 'bg-green-900/60 text-green-300 border-green-700', bg: 'bg-green-950/30', text: 'text-green-400', dot: 'bg-green-500' },
    medium: { badge: 'bg-yellow-900/60 text-yellow-300 border-yellow-700', bg: 'bg-yellow-950/30', text: 'text-yellow-400', dot: 'bg-yellow-500' },
    high: { badge: 'bg-orange-900/60 text-orange-300 border-orange-700', bg: 'bg-orange-950/30', text: 'text-orange-400', dot: 'bg-orange-500' },
    critical: { badge: 'bg-red-900/60 text-red-300 border-red-700', bg: 'bg-red-950/30', text: 'text-red-400', dot: 'bg-red-500' },
};
const DEFAULT_SETTINGS = {
    warningThreshold: 3,
    tempBanDuration: '3d',
    autoEscalation: true,
    enableContextSignals: true,
    noteRetention: '90d',
    strictnessLevel: 'medium',
    harassmentSensitivity: 'medium',
    spamAggression: 'medium',
    warningMessage: 'Hello {username},\n\nYour recent activity in r/{subreddit} violates {rule}. Please review the community guidelines.\n\n- ModTeam',
    tempBanMessage: 'Hello {username},\n\nYou have been temporarily banned from r/{subreddit} for violating {rule}. This ban will last {duration}.\n\n- ModTeam',
    permBanMessage: 'Hello {username},\n\nYou have been permanently banned from r/{subreddit} due to repeated violations of {rule}.\n\n- ModTeam',
};
// ---------------------------------------------------------------------------
// Collaboration Mock Data & Simulation
// ---------------------------------------------------------------------------
const CASE_USER_MAP = {
    'case-1': 'u/troubled_user_42',
    'case-2': 'u/angry_user_1',
    'case-3': 'u/spam_throwaway',
    'case-4': 'u/fresh_account99',
    'case-5': 'u/low_effort_poster',
};
const MOD_ACTION_TEMPLATES = [
    (mod, target) => `${mod} removed a post from ${target ?? 'a user'}`,
    (mod, target) => `${mod} issued a warning to ${target ?? 'a user'}`,
    (mod, target) => `${mod} escalated to temp ban for ${target ?? 'a user'}`,
    (mod, target) => `${mod} approved a report on ${target ?? 'content'}`,
    (mod, target) => `${mod} left a mod note on ${target ?? 'a case'}`,
    (mod, target) => `${mod} dismissed a report on ${target ?? 'content'}`,
];
const MOD_ACTION_DETAILS = [
    'Rule 3 — Harassment',
    'Rule 1 — Be civil',
    'Rule 7 — Spam',
    'Repeat offense',
    'Low-effort content',
    'Ban evasion detected',
];
function generateMockCollaborators() {
    const now = Date.now();
    return [
        { id: 'mod-1', username: 'AliceMod', initials: 'AM', status: 'reviewing', currentCase: 'case-4', currentAction: null, lastActive: new Date(now - 8_000), color: 'bg-emerald-500' },
        { id: 'mod-2', username: 'BobMod', initials: 'BM', status: 'online', currentCase: null, currentAction: 'handled 3 reports recently', lastActive: new Date(now - 12_000), color: 'bg-blue-500' },
        { id: 'mod-3', username: 'CharlieMod', initials: 'CM', status: 'online', currentCase: null, currentAction: null, lastActive: new Date(now - 180_000), color: 'bg-amber-500' },
        { id: 'mod-4', username: 'ModSarah', initials: 'MS', status: 'reviewing', currentCase: 'case-1', currentAction: null, lastActive: new Date(now - 45_000), color: 'bg-purple-500' },
        { id: 'mod-5', username: 'DaveMod', initials: 'DM', status: 'idle', currentCase: null, currentAction: null, lastActive: new Date(now - 300_000), color: 'bg-cyan-500' },
    ];
}
function useCollaboration(cases) {
    const [moderators, setModerators] = useState(() => generateMockCollaborators());
    const [activityFeed, setActivityFeed] = useState([]);
    const [reviewTimestamps] = useState(() => ({}));
    const activityIdRef = useRef(0);
    useEffect(() => {
        const interval = setInterval(() => {
            setModerators((prev) => {
                const next = prev.map((m) => {
                    let status = m.status;
                    let currentCase = m.currentCase;
                    let currentAction = m.currentAction;
                    const caseKeys = Object.keys(cases);
                    const roll = Math.random();
                    if (roll < 0.15 && status !== 'idle') {
                        status = Math.random() > 0.5 ? 'online' : 'reviewing';
                        currentAction = null;
                        if (status === 'reviewing' && caseKeys.length > 0) {
                            currentCase = caseKeys[Math.floor(Math.random() * caseKeys.length)];
                        }
                        if (status === 'online') {
                            currentCase = null;
                            if (Math.random() > 0.5) {
                                currentAction = 'reviewing the queue';
                            }
                        }
                    }
                    if (roll >= 0.7 && roll < 0.85 && status === 'reviewing' && caseKeys.length > 0) {
                        const others = caseKeys.filter((k) => k !== currentCase);
                        if (others.length > 0) {
                            currentCase = others[Math.floor(Math.random() * others.length)];
                        }
                    }
                    return {
                        ...m,
                        status,
                        currentCase,
                        currentAction,
                        lastActive: new Date(),
                    };
                });
                return next;
            });
            setActivityFeed((prev) => {
                const caseKeys = Object.keys(cases);
                const randomMod = ['AliceMod', 'BobMod', 'CharlieMod', 'ModSarah', 'DaveMod'][Math.floor(Math.random() * 5)];
                const template = MOD_ACTION_TEMPLATES[Math.floor(Math.random() * MOD_ACTION_TEMPLATES.length)];
                const target = caseKeys[Math.floor(Math.random() * caseKeys.length)];
                const targetUser = target ? CASE_USER_MAP[target] : undefined;
                const actionText = template(`u/${randomMod}`, targetUser);
                const detail = MOD_ACTION_DETAILS[Math.floor(Math.random() * MOD_ACTION_DETAILS.length)];
                activityIdRef.current += 1;
                const event = {
                    id: activityIdRef.current,
                    moderator: `u/${randomMod}`,
                    action: actionText,
                    ...(targetUser ? { target: targetUser } : {}),
                    detail,
                    timestamp: new Date(),
                };
                const updated = [...prev, event];
                return updated.length > 12 ? updated.slice(-12) : updated;
            });
        }, 3500);
        return () => clearInterval(interval);
    }, [cases]);
    return { moderators, activityFeed, reviewTimestamps };
}
// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------
function RiskBadge({ level }) {
    const c = RISK_COLORS[level];
    return (_jsx("span", { className: `inline-block text-[11px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full border transition-all duration-150 ${c.badge}`, children: level }));
}
function StatusChip({ label }) {
    return (_jsx("span", { className: "rounded-full border border-neutral-700/50 bg-neutral-800/50 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-neutral-400", children: label }));
}
function ContextSignalCard({ signal }) {
    const c = RISK_COLORS[signal.severity];
    return (_jsxs("div", { className: `flex items-start gap-3 rounded-lg border border-neutral-800/50 p-3 transition-all duration-150 hover:border-neutral-700/60 ${c.bg}`, children: [_jsx("span", { className: `mt-1 h-2 w-2 shrink-0 rounded-full ${c.dot}` }), _jsxs("div", { className: "min-w-0", children: [_jsx("span", { className: `text-[11px] font-semibold uppercase tracking-wider ${c.text}`, children: signal.label }), _jsx("p", { className: "mt-0.5 text-sm text-neutral-400", children: signal.value })] })] }));
}
function DisciplineEntry({ event, isLast }) {
    return (_jsxs("div", { className: "relative flex gap-4 pb-5 last:pb-0", children: [_jsxs("div", { className: "flex flex-col items-center", children: [_jsx("div", { className: "z-10 h-2.5 w-2.5 rounded-full bg-neutral-600 ring-[3px] ring-neutral-900" }), !isLast && _jsx("div", { className: "mt-1 h-full w-px bg-neutral-800/60" })] }), _jsxs("div", { className: "min-w-0 flex-1 -mt-0.5", children: [_jsxs("div", { className: "flex items-baseline justify-between gap-2", children: [_jsx("span", { className: "text-sm font-medium text-neutral-200", children: event.action }), _jsx("span", { className: "shrink-0 text-[11px] text-neutral-500", children: event.date })] }), _jsxs("p", { className: "mt-0.5 text-xs text-neutral-500", children: ["by ", _jsx("span", { className: "text-neutral-400", children: event.moderator }), " \u00B7 ", event.detail] })] })] }));
}
function RecentActionRow({ action }) {
    const iconMap = {
        'removed comment': '🗑️',
        'issued warning': '⚠️',
        'temp banned': '🔒',
        'permanent banned': '⛔',
    };
    return (_jsxs("div", { className: "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-150 hover:bg-neutral-800/40 hover:pl-4", children: [_jsx("span", { className: "text-base", children: iconMap[action.action] }), _jsx("div", { className: "min-w-0 flex-1", children: _jsxs("p", { className: "text-sm text-neutral-200", children: [_jsx("span", { className: "font-medium text-orange-400", children: action.moderator }), ' ', action.action, ' ', _jsx("span", { className: "font-medium text-neutral-100", children: action.target })] }) }), _jsx("span", { className: "shrink-0 text-xs text-neutral-500", children: action.timestamp })] }));
}
function ActionButton({ label, variant, onClick, loading, disabled }) {
    const styles = {
        warn: 'bg-yellow-700 hover:bg-yellow-600 active:bg-yellow-500 text-yellow-100',
        temp: 'bg-orange-700 hover:bg-orange-600 active:bg-orange-500 text-orange-100',
        perm: 'bg-red-800 hover:bg-red-700 active:bg-red-600 text-red-100',
    };
    return (_jsx("button", { onClick: onClick, disabled: disabled || loading, className: `flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold tracking-wide transition-all duration-150 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 disabled:hover:brightness-100 ${styles[variant]}`, children: loading ? (_jsxs("span", { className: "inline-flex items-center justify-center gap-1.5", children: [_jsx("span", { className: "h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" }), _jsx("span", { children: label })] })) : (label) }));
}
function QueueSidebar({ queue, activeId, onSelect }) {
    const highRiskCount = queue.filter((q) => q.riskLevel === 'high' || q.riskLevel === 'critical').length;
    return (_jsxs("aside", { className: "rounded-xl border border-neutral-800/50 bg-neutral-900/50 p-3 shadow-sm", children: [_jsxs("div", { className: "mb-3 flex items-center justify-between px-2", children: [_jsx("h2", { className: "text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400", children: "Report Queue" }), _jsxs("span", { className: "text-[10px] text-neutral-500", children: [queue.length, " open"] })] }), _jsxs("div", { className: "mb-3 flex gap-2 px-2", children: [_jsxs("span", { className: "rounded-md bg-neutral-800/70 px-2 py-0.5 text-[10px] font-medium text-neutral-400", children: [queue.length, " reports"] }), _jsxs("span", { className: "rounded-md bg-red-950/40 px-2 py-0.5 text-[10px] font-medium text-red-400", children: [highRiskCount, " high-risk"] })] }), _jsx("div", { className: "space-y-1", children: queue.map((item) => {
                    const isActive = item.id === activeId;
                    const riskDot = RISK_COLORS[item.riskLevel].dot;
                    return (_jsxs("div", { onClick: () => onSelect(item.id), className: `group flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-all duration-150 ${isActive
                            ? 'bg-orange-900/20 text-orange-300 ring-1 ring-orange-700/30'
                            : 'text-neutral-400 hover:bg-neutral-800/40 hover:text-neutral-200'}`, children: [_jsx("span", { className: `h-2 w-2 shrink-0 rounded-full transition-transform duration-150 ${riskDot} ${isActive ? 'scale-125' : ''}` }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsxs("div", { className: "flex items-center gap-1.5", children: [_jsx("p", { className: `truncate text-sm font-medium ${isActive ? 'text-orange-300' : 'text-neutral-300'}`, children: item.username }), item.unread && !isActive && (_jsx("span", { className: "h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" }))] }), _jsx("p", { className: "truncate text-[11px] text-neutral-500", children: item.reason })] }), isActive && _jsx("span", { className: "shrink-0 text-[10px] text-orange-500 font-medium", children: '>' })] }, item.id));
                }) })] }));
}
function ActiveModeratorItem({ mod }) {
    const statusColors = {
        online: 'bg-green-500',
        idle: 'bg-yellow-500',
        reviewing: 'bg-orange-500',
    };
    const statusLabels = {
        online: 'Online',
        idle: 'Idle',
        reviewing: 'Reviewing',
    };
    const activityText = mod.currentCase
        ? `reviewing ${CASE_USER_MAP[mod.currentCase] ?? 'a case'}`
        : mod.currentAction ?? statusLabels[mod.status];
    return (_jsxs("div", { className: "flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-all duration-150 hover:bg-neutral-800/40", children: [_jsxs("div", { className: "relative shrink-0", children: [_jsx("span", { className: `flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold text-white ${mod.color}`, children: mod.initials }), _jsx("span", { className: `absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-[3px] ring-neutral-900 ${statusColors[mod.status]} ${mod.status === 'online' ? 'animate-pulse' : ''}` })] }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsxs("p", { className: "truncate text-sm font-medium text-neutral-200", children: ["u/", mod.username] }), _jsx("p", { className: "truncate text-[11px] text-neutral-500", children: activityText })] }), _jsx("span", { className: "shrink-0 text-[10px] text-neutral-500", children: timeAgo(mod.lastActive) })] }));
}
function ActiveModeratorsPanel({ moderators }) {
    const online = moderators.filter((m) => m.status === 'online' || m.status === 'reviewing').length;
    return (_jsxs("section", { className: "rounded-xl border border-neutral-800/50 bg-neutral-900/50 p-3 shadow-sm", children: [_jsxs("div", { className: "mb-2 flex items-center justify-between px-1", children: [_jsx("h2", { className: "text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400", children: "Active Moderators" }), _jsxs("span", { className: "flex items-center gap-1.5 text-[10px] text-neutral-500", children: [_jsx("span", { className: "h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" }), online, " online"] })] }), _jsx("div", { className: "space-y-0.5", children: moderators.map((mod) => (_jsx(ActiveModeratorItem, { mod: mod }, mod.id))) })] }));
}
function CurrentlyReviewing({ activeCaseId, moderators }) {
    const reviewer = moderators.find((m) => m.currentCase === activeCaseId && m.status === 'reviewing');
    if (!reviewer)
        return null;
    return (_jsxs("div", { className: "mt-3 flex items-center gap-2.5 rounded-lg border border-orange-800/30 bg-orange-950/20 px-3 py-2", children: [_jsx("span", { className: "h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-orange-500" }), _jsxs("p", { className: "text-[11px] leading-relaxed text-orange-300/80", children: ["u/", reviewer.username, " started reviewing this case ", timeAgo(reviewer.lastActive)] })] }));
}
function ActivityFeedRow({ event }) {
    return (_jsxs("div", { className: "flex items-start gap-2.5 rounded-lg px-2.5 py-2 transition-all duration-150 hover:bg-neutral-800/40", children: [_jsx("span", { className: "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-700 text-[10px] font-bold text-neutral-300", children: event.moderator.charAt(2).toUpperCase() + (event.moderator.charAt(3)?.toUpperCase() ?? '') }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "text-xs leading-relaxed text-neutral-300", children: event.action }), _jsx("p", { className: "mt-0.5 text-[10px] text-neutral-500", children: event.detail })] }), _jsx("span", { className: "shrink-0 text-[10px] text-neutral-500", children: timeAgo(event.timestamp) })] }));
}
function ActivityFeed({ events }) {
    if (!events.length)
        return null;
    return (_jsxs("section", { className: "rounded-xl border border-neutral-800/50 bg-neutral-900/50 p-3 shadow-sm", children: [_jsx("h2", { className: "mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400", children: "Recent Moderator Activity" }), _jsx("div", { className: "space-y-0.5", children: events.map((event) => (_jsx(ActivityFeedRow, { event: event }, event.id))) })] }));
}
function ToastList({ toasts, onDismiss }) {
    if (!toasts.length)
        return null;
    return (_jsx("div", { className: "fixed right-4 top-4 z-50 flex flex-col gap-2", children: toasts.map((t) => (_jsxs("div", { className: `animate-in slide-in-from-right-2 flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm shadow-xl ${t.variant === 'success'
                ? 'border-green-800/60 bg-green-900/80 text-green-200'
                : t.variant === 'error'
                    ? 'border-red-800/60 bg-red-900/80 text-red-200'
                    : 'border-neutral-700/60 bg-neutral-800/90 text-neutral-200'}`, children: [_jsx("span", { className: "text-base", children: t.variant === 'success' ? '\u2713' : t.variant === 'error' ? '\u2717' : '\u2139' }), _jsx("span", { className: "flex-1 text-sm", children: t.message }), _jsx("button", { onClick: () => onDismiss(t.id), className: "ml-2 text-sm opacity-60 transition-opacity duration-150 hover:opacity-100", children: "\\u2715" })] }, t.id))) }));
}
function SettingsPanel({ open, settings, draft, onChange, onSave, onReset, onClose }) {
    const hasChanges = JSON.stringify(settings) !== JSON.stringify(draft);
    if (!open)
        return null;
    const update = (partial) => onChange({ ...draft, ...partial });
    const Select = ({ label, desc, value, options, onChange: selChange }) => (_jsxs("div", { className: "space-y-1.5", children: [_jsx("label", { className: "block text-sm font-medium text-neutral-200", children: label }), _jsx("p", { className: "text-[11px] text-neutral-500", children: desc }), _jsx("select", { value: value, onChange: (e) => selChange(e.target.value), className: "w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 outline-none transition-colors focus:border-orange-600 focus:ring-1 focus:ring-orange-600/30", children: options.map((o) => _jsx("option", { value: o.value, className: "bg-neutral-800", children: o.label }, o.value)) })] }));
    const Toggle = ({ label, desc, value, onChange: togChange }) => (_jsxs("div", { className: "flex items-start justify-between gap-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-neutral-200", children: label }), _jsx("p", { className: "text-[11px] text-neutral-500", children: desc })] }), _jsx("button", { onClick: () => togChange(!value), className: `relative h-5 w-9 shrink-0 rounded-full transition-colors ${value ? 'bg-orange-600' : 'bg-neutral-700'}`, children: _jsx("span", { className: `absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${value ? 'translate-x-4' : ''}` }) })] }));
    const NumberField = ({ label, desc, value, min, max, onChange: numChange }) => (_jsxs("div", { className: "space-y-1.5", children: [_jsx("label", { className: "block text-sm font-medium text-neutral-200", children: label }), _jsx("p", { className: "text-[11px] text-neutral-500", children: desc }), _jsx("input", { type: "number", min: min, max: max, value: value, onChange: (e) => numChange(Math.max(min, Math.min(max, parseInt(e.target.value) || min))), className: "w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 outline-none transition-colors focus:border-orange-600 focus:ring-1 focus:ring-orange-600/30" })] }));
    const TextArea = ({ label, desc, value, onChange: taChange }) => (_jsxs("div", { className: "space-y-1.5", children: [_jsx("label", { className: "block text-sm font-medium text-neutral-200", children: label }), _jsx("p", { className: "text-[11px] text-neutral-500", children: desc }), _jsx("textarea", { rows: 4, value: value, onChange: (e) => taChange(e.target.value), className: "w-full resize-y rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 outline-none transition-colors focus:border-orange-600 focus:ring-1 focus:ring-orange-600/30" })] }));
    const section = (title, children) => (_jsxs("div", { className: "rounded-xl border border-neutral-800/50 bg-neutral-900/50 p-4 shadow-sm", children: [_jsx("h3", { className: "mb-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400", children: title }), _jsx("div", { className: "space-y-4", children: children })] }));
    return (_jsxs("div", { className: "fixed inset-0 z-40 flex justify-end", children: [_jsx("div", { className: "absolute inset-0 bg-black/60 backdrop-blur-sm", onClick: onClose }), _jsxs("div", { className: "relative z-50 flex w-full max-w-lg flex-col overflow-y-auto border-l border-neutral-800 bg-neutral-950 shadow-2xl animate-in slide-in-from-right", children: [_jsxs("div", { className: "flex items-center justify-between border-b border-neutral-800 px-5 py-4", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-base font-bold text-white", children: "Settings" }), _jsx("p", { className: "text-xs text-neutral-500", children: "Configure moderation behavior" })] }), _jsxs("div", { className: "flex items-center gap-3", children: [hasChanges && _jsx("span", { className: "text-[10px] text-yellow-400", children: "Unsaved changes" }), _jsx("button", { onClick: onClose, className: "rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200", children: _jsx("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: _jsx("path", { d: "M18 6 6 18M6 6l12 12" }) }) })] })] }), _jsxs("div", { className: "flex-1 space-y-4 p-5", children: [section('Moderation Rules', _jsxs(_Fragment, { children: [_jsx(NumberField, { label: "Warning Threshold", desc: "Max warnings before auto-escalation is triggered.", value: draft.warningThreshold, min: 1, max: 10, onChange: (v) => update({ warningThreshold: v }) }), _jsx(Select, { label: "Temp Ban Duration", desc: "Default temporary ban length for standard offenses.", value: draft.tempBanDuration, options: [{ value: '1d', label: '1 Day' }, { value: '3d', label: '3 Days' }, { value: '7d', label: '7 Days' }], onChange: (v) => update({ tempBanDuration: v }) }), _jsx(Toggle, { label: "Auto Escalation", desc: "Automatically recommends stronger actions for repeat offenders.", value: draft.autoEscalation, onChange: (v) => update({ autoEscalation: v }) }), _jsx(Toggle, { label: "Enable Context Signals", desc: "Shows behavioral signals and pattern analysis on each case.", value: draft.enableContextSignals, onChange: (v) => update({ enableContextSignals: v }) }), _jsx(Select, { label: "Moderator Note Retention", desc: "How long moderator notes and case history are preserved.", value: draft.noteRetention, options: [{ value: '30d', label: '30 Days' }, { value: '90d', label: '90 Days' }, { value: 'forever', label: 'Forever' }], onChange: (v) => update({ noteRetention: v }) })] })), section('Community Tone', _jsxs(_Fragment, { children: [_jsx(Select, { label: "Strictness Level", desc: "Overall moderation strictness applied across all rules.", value: draft.strictnessLevel, options: [{ value: 'low', label: 'Low — lenient, warnings first' }, { value: 'medium', label: 'Medium — balanced enforcement' }, { value: 'high', label: 'High — zero tolerance' }], onChange: (v) => update({ strictnessLevel: v }) }), _jsx(Select, { label: "Harassment Sensitivity", desc: "How aggressively harassment and hostile language are flagged.", value: draft.harassmentSensitivity, options: [{ value: 'low', label: 'Low — flag only explicit content' }, { value: 'medium', label: 'Medium — moderate detection' }, { value: 'high', label: 'High — aggressive detection' }], onChange: (v) => update({ harassmentSensitivity: v }) }), _jsx(Select, { label: "Spam Aggression", desc: "How aggressively spam patterns and link reposting are targeted.", value: draft.spamAggression, options: [{ value: 'low', label: 'Low — flag only obvious spam' }, { value: 'medium', label: 'Medium — balanced detection' }, { value: 'high', label: 'High — aggressive filtering' }], onChange: (v) => update({ spamAggression: v }) })] })), section('Message Templates', _jsxs(_Fragment, { children: [_jsx(TextArea, { label: "Warning Message", desc: "Sent to users when issued a formal warning. Use {'{username}'}, {'{rule}'}, {'{subreddit}'}.", value: draft.warningMessage, onChange: (v) => update({ warningMessage: v }) }), _jsx(TextArea, { label: "Temp Ban Message", desc: "Sent to users on temporary suspension. Use {'{username}'}, {'{rule}'}, {'{subreddit}'}.", value: draft.tempBanMessage, onChange: (v) => update({ tempBanMessage: v }) }), _jsx(TextArea, { label: "Permanent Ban Message", desc: "Sent to users on permanent ban. Use {'{username}'}, {'{rule}'}, {'{subreddit}'}.", value: draft.permBanMessage, onChange: (v) => update({ permBanMessage: v }) })] }))] }), _jsxs("div", { className: "flex items-center justify-between border-t border-neutral-800 px-5 py-4", children: [_jsx("button", { onClick: onReset, className: "rounded-lg px-4 py-2 text-xs font-medium text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200", children: "Reset to Defaults" }), _jsx("button", { onClick: onSave, className: "rounded-lg bg-orange-700 px-5 py-2 text-sm font-semibold text-orange-100 transition-colors hover:bg-orange-600", children: "Save Settings" })] })] })] }));
}
function Card({ title, children }) {
    return (_jsxs("section", { className: "rounded-xl border border-neutral-800/50 bg-neutral-900/50 p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:border-neutral-700/60", children: [title && (_jsx("h2", { className: "mb-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400", children: title })), children] }));
}
// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
function ModDashboard() {
    const [cases, setCases] = useState(MOCK_CASES);
    const [activeCaseId, setActiveCaseId] = useState('case-1');
    const [loadingAction, setLoadingAction] = useState(null);
    const [toasts, setToasts] = useState([]);
    const [toastId, setToastId] = useState(0);
    const [transitioning, setTransitioning] = useState(false);
    const [displayedCaseId, setDisplayedCaseId] = useState('case-1');
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [settings, setSettings] = useState(DEFAULT_SETTINGS);
    const [draftSettings, setDraftSettings] = useState(DEFAULT_SETTINGS);
    const { moderators, activityFeed } = useCollaboration(cases);
    const active = cases[activeCaseId];
    const display = (transitioning ? cases[displayedCaseId] : active);
    const showToast = useCallback((message, variant = 'success') => {
        const id = toastId;
        setToastId((n) => n + 1);
        setToasts((prev) => [...prev, { id, message, variant }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 3000);
    }, [toastId]);
    const dismissToast = useCallback((id) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);
    const updateActiveCase = useCallback((updater) => {
        setCases((prev) => ({ ...prev, [activeCaseId]: updater(prev[activeCaseId]) }));
    }, [activeCaseId]);
    const selectCase = useCallback((id) => {
        if (id === activeCaseId || loadingAction)
            return;
        const target = cases[id];
        if (!target)
            return;
        setTransitioning(true);
        setActiveCaseId(id);
        setLoadingAction(null);
        setTimeout(() => {
            setDisplayedCaseId(id);
            setTransitioning(false);
        }, 200);
        showToast(`Switched to ${target.user.username}`, 'info');
    }, [activeCaseId, loadingAction, cases, showToast]);
    const simulateAction = useCallback(async (action, delayMs) => {
        setLoadingAction(action);
        await new Promise((r) => setTimeout(r, delayMs));
        setLoadingAction(null);
    }, []);
    const handleWarn = useCallback(async () => {
        await simulateAction('warn', 800);
        updateActiveCase((c) => ({
            ...c,
            user: { ...c.user, priorWarnings: c.user.priorWarnings + 1 },
            timeline: [{ date: now(), action: 'Warning Issued', moderator: c.moderator, detail: 'Rule 1 — Be civil' }, ...c.timeline],
            recentActions: [{ moderator: c.moderator, action: 'issued warning', target: c.user.username, timestamp: 'just now' }, ...c.recentActions],
            suggestionLabel: 'Escalation detected',
            suggestionText: 'User continues rule-breaking despite warnings. Consider a temp ban if behavior persists.',
            permanentlyBanned: false,
        }));
        showToast(`Warning issued to ${active.user.username}`, 'success');
    }, [simulateAction, updateActiveCase, showToast, active]);
    const handleTempBan = useCallback(async () => {
        const duration = settings.tempBanDuration;
        await simulateAction('temp', 1200);
        updateActiveCase((c) => ({
            ...c,
            user: { ...c.user, banHistory: c.user.banHistory + 1 },
            timeline: [{ date: now(), action: `Temp Ban (${duration})`, moderator: c.moderator, detail: 'Repeat offense — hostile conduct' }, ...c.timeline],
            recentActions: [{ moderator: c.moderator, action: 'temp banned', target: c.user.username, timestamp: 'just now' }, ...c.recentActions],
            suggestionLabel: 'Monitor closely',
            suggestionText: 'User has been temporarily banned. Further violations may warrant a permanent ban upon return.',
            permanentlyBanned: false,
        }));
        showToast(`${active.user.username} banned for ${duration}`, 'success');
    }, [simulateAction, updateActiveCase, showToast, active, settings]);
    const handlePermBan = useCallback(async () => {
        await simulateAction('perm', 1500);
        updateActiveCase((c) => ({
            ...c,
            permanentlyBanned: true,
            timeline: [{ date: now(), action: 'Permanent Ban', moderator: c.moderator, detail: 'Final resolution — egregious repeated violations' }, ...c.timeline],
            recentActions: [{ moderator: c.moderator, action: 'permanent banned', target: c.user.username, timestamp: 'just now' }, ...c.recentActions],
            suggestionLabel: 'Case closed',
            suggestionText: 'User has been permanently banned from the community. No further action required.',
        }));
        showToast(`${active.user.username} permanently banned`, 'error');
    }, [simulateAction, updateActiveCase, showToast, active]);
    const openSettings = useCallback(() => {
        setDraftSettings(settings);
        setSettingsOpen(true);
    }, [settings]);
    const closeSettings = useCallback(() => {
        setSettingsOpen(false);
    }, []);
    const saveSettings = useCallback(() => {
        setSettings(draftSettings);
        setSettingsOpen(false);
        showToast('Settings saved successfully', 'success');
    }, [draftSettings, showToast]);
    const resetSettings = useCallback(() => {
        setDraftSettings(DEFAULT_SETTINGS);
        showToast('Settings reset to defaults', 'info');
    }, [showToast]);
    return (_jsxs("div", { className: "mx-auto min-h-screen bg-neutral-950 px-3 py-5 text-neutral-100 md:px-4 md:py-6", children: [_jsxs("header", { className: "mx-auto mb-6 flex max-w-5xl items-start justify-between", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-lg font-bold tracking-tight text-white", children: "ModMate" }), _jsx("p", { className: "mt-0.5 text-[13px] text-neutral-500", children: "Unified Moderation Action Center" }), _jsx("p", { className: "mt-1 text-[10px] text-neutral-600", children: "Report Queue \u2022 Live Review Session" })] }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("button", { onClick: openSettings, className: "rounded-lg p-1.5 text-neutral-500 transition-all duration-150 hover:bg-neutral-800 hover:text-neutral-300 active:scale-95", title: "Settings", children: _jsxs("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("path", { d: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" }), _jsx("circle", { cx: "12", cy: "12", r: "3" })] }) }), active.permanentlyBanned && (_jsx("span", { className: "rounded-full border border-red-700 bg-red-900/60 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-red-300", children: "Banned" })), _jsx(RiskBadge, { level: active.user.riskLevel })] })] }), _jsx(ToastList, { toasts: toasts, onDismiss: dismissToast }), _jsx(SettingsPanel, { open: settingsOpen, settings: settings, draft: draftSettings, onChange: setDraftSettings, onSave: saveSettings, onReset: resetSettings, onClose: closeSettings }), _jsxs("div", { className: "mx-auto max-w-5xl lg:grid lg:grid-cols-[240px_1fr] lg:gap-6", children: [_jsxs("aside", { className: "mb-5 space-y-4 lg:mb-0", children: [_jsx(ActiveModeratorsPanel, { moderators: moderators }), _jsx(QueueSidebar, { queue: adjustQueueRisk(MOCK_QUEUE_META, settings), activeId: activeCaseId, onSelect: selectCase })] }), _jsxs("div", { className: `space-y-5 transition-opacity duration-200 ${transitioning ? 'opacity-30' : 'opacity-100'}`, children: [_jsxs(Card, { children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("p", { className: "text-base font-bold text-white", children: display.user.username }), _jsx(RiskBadge, { level: display.user.riskLevel })] }), _jsxs("div", { className: "mt-2 flex flex-wrap gap-1.5", children: [_jsx(StatusChip, { label: "WARNED" }), _jsx(StatusChip, { label: "REPEAT OFFENDER" }), _jsx(StatusChip, { label: "ESCALATED" }), display.permanentlyBanned && _jsx(StatusChip, { label: "BANNED" }), !display.permanentlyBanned && _jsx(StatusChip, { label: "UNDER REVIEW" })] }), _jsxs("div", { className: "mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm md:gap-x-6", children: [_jsx("span", { className: "text-neutral-500", children: "Account Age:" }), _jsxs("span", { className: "text-neutral-100 tabular-nums", children: [display.user.accountAgeDays, "d"] }), _jsx("span", { className: "text-neutral-500", children: "Karma:" }), _jsx("span", { className: "text-neutral-100 tabular-nums", children: display.user.karma.toLocaleString() }), _jsx("span", { className: "text-neutral-500", children: "Warnings:" }), _jsx("span", { className: "text-neutral-100 tabular-nums", children: display.user.priorWarnings }), _jsx("span", { className: "text-neutral-500", children: "Prior Bans:" }), _jsx("span", { className: "text-neutral-100 tabular-nums", children: display.user.banHistory }), _jsx("span", { className: "text-neutral-500", children: "Last Action:" }), _jsxs("span", { className: "text-neutral-100 tabular-nums", children: [display.user.lastActionDays, "d ago"] })] })] }), _jsxs(Card, { title: "Reported Content", children: [_jsx("div", { className: "rounded-lg border border-red-900/40 bg-red-950/20 p-4", children: _jsx("p", { className: "text-sm italic leading-relaxed text-neutral-200", children: display.report.content }) }), _jsx("div", { className: "mt-3 flex flex-wrap gap-1.5", children: display.report.reasons.map((r, i) => (_jsx("span", { className: "rounded-full bg-red-900/30 px-2.5 py-0.5 text-[11px] font-medium text-red-300", children: r }, i))) })] }), _jsxs(Card, { title: "Why This User Matters", children: [_jsx("ul", { className: "space-y-2", children: generateInsights(display, settings).map((insight, i) => (_jsxs("li", { className: "flex items-start gap-2.5 text-sm text-neutral-300", children: [_jsx("span", { className: "mt-0.5", children: insight.icon }), _jsx("span", { children: insight.text })] }, i))) }), _jsx("p", { className: "mt-2 text-[10px] text-neutral-600", children: "Context Signals Generated" })] }), settings.enableContextSignals && (_jsx(Card, { title: "Context Signals", children: _jsx("div", { className: "space-y-2.5", children: display.signals.map((signal, i) => (_jsx(ContextSignalCard, { signal: signal }, i))) }) })), _jsx(Card, { title: "Discipline Timeline", children: _jsx("div", { className: "pl-1", children: display.timeline.map((event, i) => (_jsx(DisciplineEntry, { event: event, isLast: i === display.timeline.length - 1 }, `${event.date}-${i}`))) }) }), _jsxs(Card, { title: "Moderator Presence", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("span", { className: "flex h-9 w-9 items-center justify-center rounded-full bg-orange-800/50 text-xs font-bold tracking-wide text-orange-300 ring-2 ring-orange-800/30", children: display.moderator.charAt(2).toUpperCase() + display.moderator.charAt(3).toUpperCase() }), _jsxs("div", { children: [_jsxs("p", { className: "text-sm font-medium text-neutral-200", children: [_jsx("span", { className: "text-orange-400", children: display.moderator }), " is reviewing this case"] }), _jsx("p", { className: "text-xs text-neutral-500", children: "Assigned 12 minutes ago" })] })] }), _jsx(CurrentlyReviewing, { activeCaseId: activeCaseId, moderators: moderators })] }), _jsx(Card, { title: "Recent Moderator Actions", children: _jsx("div", { className: "divide-y divide-neutral-800/60", children: display.recentActions.map((action, i) => (_jsx(RecentActionRow, { action: action }, `${action.timestamp}-${i}`))) }) }), _jsx(ActivityFeed, { events: activityFeed }), _jsx(Card, { title: "Suggested Next Action", children: (() => {
                                    const suggestion = computeSuggestion(display, settings);
                                    const isClosed = display.permanentlyBanned;
                                    return (_jsxs("div", { className: `flex items-start gap-3 rounded-lg border p-3 transition-all duration-150 ${isClosed
                                            ? 'border-neutral-700/40 bg-neutral-800/30'
                                            : 'border-orange-800/30 bg-orange-950/15'}`, children: [_jsx("span", { className: "mt-0.5 text-base", children: isClosed ? '\u{1F512}' : '\u{1F4A1}' }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: `text-sm font-medium ${isClosed ? 'text-neutral-400' : 'text-orange-200'}`, children: suggestion.label }), _jsx("p", { className: "mt-0.5 text-xs leading-relaxed text-neutral-400", children: suggestion.text })] })] }));
                                })() }), _jsx(Card, { children: _jsxs("div", { className: "flex gap-3", children: [_jsx(ActionButton, { label: "Warn + Remove", variant: "warn", onClick: handleWarn, loading: loadingAction === 'warn', disabled: loadingAction !== null || active.permanentlyBanned }), _jsx(ActionButton, { label: `${settings.tempBanDuration.toUpperCase()} Temp Ban`, variant: "temp", onClick: handleTempBan, loading: loadingAction === 'temp', disabled: loadingAction !== null || active.permanentlyBanned }), _jsx(ActionButton, { label: "Permanent Ban", variant: "perm", onClick: handlePermBan, loading: loadingAction === 'perm', disabled: loadingAction !== null || active.permanentlyBanned })] }) })] })] }), _jsx("footer", { className: "mx-auto mt-8 max-w-5xl border-t border-neutral-800/50 pt-4 text-center text-xs text-neutral-600", children: "ModMate \u00B7 Reddit Mod Toolkit" })] }));
}
// ---------------------------------------------------------------------------
// Entry Point
// ---------------------------------------------------------------------------
createRoot(document.getElementById('root')).render(_jsx(StrictMode, { children: _jsx(ModDashboard, {}) }));
//# sourceMappingURL=splash.js.map