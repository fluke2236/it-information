// assets/js/dashboard.js
// Firebase-only Dashboard + Global Budget from Firestore settings/budget
// แก้ปัญหา "ช่องงบประมาณรวมเป็น 0" โดยอ่านงบรวมจาก settings/budget.totalBudget
// Version: dashboard-metric-soft-colors-v4

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    collection,
    doc,
    getDoc,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

console.log('dashboard.js loaded: dashboard-metric-soft-colors-v4');

const DEFAULT_TOTAL_BUDGET = 1500000;
const BUDGET_REF = doc(db, 'settings', 'budget');

let budgetChart = null;
let workloadChart = null;
let projectsCache = [];
let tasksCache = [];
let globalBudget = DEFAULT_TOTAL_BUDGET;
let unsubProjects = null;
let unsubTasks = null;
let unsubBudget = null;
let mounted = false;

document.addEventListener('DOMContentLoaded', initDashboardPage);

function initDashboardPage() {
    showBody();
    waitForPageContent(() => {
        initAuthAndRealtimeData();
    });
}

function waitForPageContent(callback) {
    const existing = document.getElementById('pageContent');
    if (existing) {
        mountDashboard(existing);
        callback();
        return;
    }

    const layoutRoot = document.getElementById('layoutRoot');
    if (!layoutRoot) {
        console.error('ไม่พบ #layoutRoot ใน dashboard.html');
        return;
    }

    let attempts = 0;
    const timer = setInterval(() => {
        attempts += 1;
        const pageContent = document.getElementById('pageContent');
        if (pageContent) {
            clearInterval(timer);
            mountDashboard(pageContent);
            callback();
            return;
        }

        if (attempts >= 20) {
            clearInterval(timer);
            const fallback = createFallbackPageContent();
            mountDashboard(fallback);
            callback();
        }
    }, 100);
}

function createFallbackPageContent() {
    let pageContent = document.getElementById('pageContent');
    if (pageContent) return pageContent;

    const layoutRoot = document.getElementById('layoutRoot') || document.body;
    const main = document.createElement('main');
    main.className = 'flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-slate-900 transition-theme';

    pageContent = document.createElement('div');
    pageContent.id = 'pageContent';
    pageContent.className = 'flex-1 overflow-y-auto p-6 lg:p-8 z-10';

    main.appendChild(pageContent);
    layoutRoot.appendChild(main);
    return pageContent;
}

function mountDashboard(pageContent) {
    if (mounted || document.getElementById('totalBudget')) {
        mounted = true;
        return;
    }

    const template = document.getElementById('dashboardTemplate');
    if (template) {
        pageContent.appendChild(template.content.cloneNode(true));
    } else {
        pageContent.innerHTML = getFallbackDashboardHtml();
    }

    mounted = true;
}

function initAuthAndRealtimeData() {
    const mockUserStr = localStorage.getItem('mockUser');

    if (mockUserStr) {
        const mockUser = JSON.parse(mockUserStr);
        initUserHeader(mockUser, true);
        listenGlobalBudget();
        listenProjects();
        listenTasks();
        return;
    }

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = 'login.html';
            return;
        }

        let appUser = {
            uid: user.uid,
            name: user.email,
            email: user.email,
            role: 'staff'
        };

        try {
            const userDocSnap = await getDoc(doc(db, 'users', user.uid));
            if (userDocSnap.exists()) {
                appUser = {
                    uid: user.uid,
                    email: user.email,
                    ...userDocSnap.data()
                };
            }
        } catch (error) {
            console.error('Error fetching user data:', error);
        }

        initUserHeader(appUser, false);
        listenGlobalBudget();
        listenProjects();
        listenTasks();
    });
}

function initUserHeader(user, isMockUser) {
    const userName = document.getElementById('userName');
    const userRole = document.getElementById('userRole');
    const adminMenu = document.getElementById('adminMenu');
    const logoutBtn = document.getElementById('logoutBtn');

    if (userName) userName.textContent = user.name || user.email || 'ผู้ใช้งานระบบ';

    const roleDisplay = {
        admin: 'ผู้ดูแลระบบ',
        manager: 'หัวหน้างาน',
        secretary: 'เลขาฯ',
        staff: 'พนักงานทั่วไป',
        employee: 'พนักงานทั่วไป'
    };

    if (userRole) userRole.textContent = roleDisplay[user.role] || user.role || 'พนักงานทั่วไป';
    if (adminMenu && user.role === 'admin') adminMenu.classList.remove('hidden');

    if (logoutBtn) {
        logoutBtn.onclick = () => {
            if (isMockUser) {
                localStorage.removeItem('mockUser');
                window.location.href = 'login.html';
                return;
            }

            signOut(auth)
                .then(() => window.location.href = 'login.html')
                .catch((error) => console.error('Logout Error:', error));
        };
    }
}

function listenGlobalBudget() {
    if (typeof unsubBudget === 'function') unsubBudget();

    unsubBudget = onSnapshot(BUDGET_REF, (snap) => {
        if (snap.exists()) {
            const data = snap.data();
            globalBudget = toNumber(data.totalBudget || DEFAULT_TOTAL_BUDGET);
        } else {
            globalBudget = DEFAULT_TOTAL_BUDGET;
        }
        renderDashboardFromFirebase();
    }, (error) => {
        console.error('Budget settings listener error:', error);
        globalBudget = DEFAULT_TOTAL_BUDGET;
        showFirebaseStatus('อ่านข้อมูลงบประมาณรวมจาก settings/budget ไม่สำเร็จ ใช้ค่าเริ่มต้น 1,500,000 บาท', 'info');
        renderDashboardFromFirebase();
    });
}

function listenProjects() {
    if (typeof unsubProjects === 'function') unsubProjects();

    const projectsRef = collection(db, 'projects');

    unsubProjects = onSnapshot(projectsRef, (snapshot) => {
        projectsCache = snapshot.docs.map((docSnap) => normalizeProject(docSnap.id, docSnap.data()));
        renderDashboardFromFirebase();
    }, (error) => {
        console.error('Projects listener error:', error);
        showFirebaseStatus(`อ่านข้อมูล projects จาก Firebase ไม่สำเร็จ: ${error.code || error.message || error}`, 'error');
        projectsCache = [];
        renderDashboardFromFirebase();
    });
}

function listenTasks() {
    if (typeof unsubTasks === 'function') unsubTasks();

    const tasksRef = collection(db, 'tasks');

    unsubTasks = onSnapshot(tasksRef, (snapshot) => {
        tasksCache = snapshot.docs.map((docSnap) => normalizeTask(docSnap.id, docSnap.data()));
        renderDashboardFromFirebase();
    }, (error) => {
        console.error('Tasks listener error:', error);
        // tasks ไม่จำเป็นต่อยอดงบรวม จึงไม่ให้ทับ status error ของ projects/settings
        tasksCache = [];
        renderDashboardFromFirebase();
    });
}

function normalizeProject(id, data) {
    const total = toNumber(data.totalBudget ?? data.total ?? data.budgetAllocated ?? data.budget ?? 0);
    const used = toNumber(data.usedBudget ?? data.used ?? data.budgetSpent ?? data.spent ?? 0);

    return {
        id,
        code: data.code || 'งา',
        name: data.name || data.title || data.projectName || 'ไม่ระบุชื่อโครงการ',
        owner: data.ownerName || data.creatorName || data.owner || data.managerName || 'ไม่ระบุผู้รับผิดชอบ',
        total,
        used,
        progress: toNumber(data.progress ?? 0),
        accent: data.accent || data.color || '#3b82f6',
        status: data.status || 'active',
        requestedBudget: toNumber(data.requestedBudget ?? 0),
        durationLabel: data.durationLabel || getProjectDurationText(data)
    };
}

function normalizeTask(id, data) {
    return {
        id,
        title: data.title || data.taskName || 'ไม่ระบุชื่องาน',
        projectId: data.projectId || '',
        project: data.projectName || data.project || 'ไม่ระบุโครงการ',
        assignee: data.assigneeName || data.assignee || data.ownerName || 'ไม่ระบุผู้รับผิดชอบ',
        amount: toNumber(data.amount ?? data.budgetAmount ?? data.cost ?? 0),
        status: data.statusText || data.dueStatus || data.status || '',
        workflowStatus: data.workflowStatus || data.stage || 'todo',
        tone: data.tone || data.priorityTone || (data.isOverdue ? 'red' : 'amber'),
        urgent: Boolean(data.urgent ?? data.isUrgent ?? data.isOverdue ?? false)
    };
}

function renderDashboardFromFirebase() {
    const projects = projectsCache;
    const tasks = tasksCache;

    // งบประมาณรวมฝ่ายอ่านจาก settings/budget.totalBudget
    const totalBudget = toNumber(globalBudget || DEFAULT_TOTAL_BUDGET);

    // ใช้เฉพาะโครงการที่ approved เป็นงบที่จัดสรร/อนุมัติแล้ว
    const approvedProjects = projects.filter(project => project.status === 'approved');
    const approvedBudget = approvedProjects.reduce((sum, project) => sum + toNumber(project.total), 0);
    const usedBudget = approvedProjects.reduce((sum, project) => sum + toNumber(project.used), 0);

    // คงเหลือ = งบรวมฝ่าย - งบที่อนุมัติแล้วรวม
    const remainingBudget = Math.max(totalBudget - approvedBudget, 0);

    const workloads = buildWorkloads(tasks);
    const urgentTasks = tasks.filter(task => task.urgent || task.tone === 'red' || task.tone === 'amber').slice(0, 10);

    renderDashboard({
        summary: {
            totalBudget,
            usedBudget: approvedBudget,
            remainingBudget
        },
        projects,
        workloads,
        urgentTasks
    });
}

function buildWorkloads(tasks) {
    const map = new Map();

    tasks.forEach(task => {
        const name = task.assignee || 'ไม่ระบุผู้รับผิดชอบ';
        if (!map.has(name)) {
            map.set(name, {
                name,
                todo: 0,
                doing: 0,
                review: 0,
                done: 0
            });
        }

        const item = map.get(name);
        const status = String(task.workflowStatus || 'todo').toLowerCase();

        if (['doing', 'in_progress', 'progress'].includes(status)) item.doing += 1;
        else if (['review', 'checking', 'verify'].includes(status)) item.review += 1;
        else if (['done', 'completed', 'complete', 'finish'].includes(status)) item.done += 1;
        else item.todo += 1;
    });

    return Array.from(map.values());
}

function renderDashboard(data) {
    const projects = Array.isArray(data.projects) ? data.projects : [];
    const workloads = Array.isArray(data.workloads) ? data.workloads : [];
    const urgentTasks = Array.isArray(data.urgentTasks) ? data.urgentTasks : [];

    const total = toNumber(data.summary?.totalBudget);
    const used = toNumber(data.summary?.usedBudget);
    const remaining = toNumber(data.summary?.remainingBudget);

    setText('totalBudget', baht(total));
    setText('usedBudget', baht(used));
    setText('remainingBudget', baht(remaining));
    setText('usedPercent', `${percent(used, total)}% ของงบประมาณรวมฝ่าย`);
    setText('remainingPercent', `${percent(remaining, total)}% ของงบประมาณรวมฝ่าย`);

    renderProjects(projects);
    renderUrgentTasks(urgentTasks);
    renderBudgetChart(projects);
    renderWorkloadChart(workloads);

    if (!projects.length && !tasksCache.length) {
        showFirebaseStatus('ยังไม่มีข้อมูลโครงการใน Firebase แต่ระบบอ่านงบประมาณรวมจาก settings/budget แล้ว', 'info');
    } else {
        hideFirebaseStatus();
    }
}

function renderProjects(projects) {
    const list = document.getElementById('projectList');
    if (!list) return;

    if (!projects.length) {
        list.innerHTML = `<div class="rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-5 text-sm text-slate-500 dark:text-slate-400">ยังไม่มีข้อมูลโครงการใน Firebase</div>`;
        return;
    }

    list.innerHTML = projects.map(project => {
        const usedPercent = percent(project.used, project.total);
        const progress = toNumber(project.progress);
        const statusText = project.status === 'pending' ? 'รออนุมัติ' : project.status === 'approved' ? 'อนุมัติแล้ว' : project.status === 'rejected' ? 'ไม่อนุมัติ' : project.status;

        return `
            <article class="rounded-2xl border border-slate-200/80 dark:border-slate-700/80 bg-white/60 dark:bg-slate-900/55 p-5">
                <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    <div class="flex items-start gap-3 min-w-0">
                        <div class="w-10 h-10 rounded-xl text-white flex items-center justify-center font-bold shrink-0" style="background:${escapeAttr(project.accent || '#3b82f6')}">${escapeHtml(project.code || 'งา')}</div>
                        <div class="min-w-0">
                            <h4 class="font-bold text-slate-900 dark:text-white truncate">${escapeHtml(project.name)}</h4>
                            <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">${escapeHtml(project.owner)}</p>
                            <p class="text-xs text-slate-400 dark:text-slate-500 mt-1">สถานะ: ${escapeHtml(statusText)} • ระยะเวลา: ${escapeHtml(project.durationLabel || '-')}</p>
                        </div>
                    </div>
                    <div class="text-right shrink-0">
                        <strong class="text-slate-900 dark:text-white">${baht(project.used)}</strong>
                        <span class="text-slate-500 dark:text-slate-400"> / ${baht(project.total)}</span>
                    </div>
                </div>

                <div class="mt-4 space-y-3">
                    <div>
                        <div class="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                            <span>การใช้งบประมาณ</span>
                            <span>${usedPercent}%</span>
                        </div>
                        <div class="progress-track"><div class="progress-fill bg-amber-400" style="width:${clamp(usedPercent)}%"></div></div>
                    </div>
                    <div>
                        <div class="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                            <span>ความคืบหน้างาน</span>
                            <span>${progress.toFixed(1)}%</span>
                        </div>
                        <div class="progress-track"><div class="progress-fill bg-emerald-500" style="width:${clamp(progress)}%"></div></div>
                    </div>
                </div>
            </article>
        `;
    }).join('');
}

function renderUrgentTasks(tasks) {
    const list = document.getElementById('urgentList');
    if (!list) return;

    if (!tasks.length) {
        list.innerHTML = `<div class="rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-4 text-sm text-slate-500 dark:text-slate-400">ยังไม่มีงานเร่งด่วนใน Firebase</div>`;
        return;
    }

    list.innerHTML = tasks.map(task => {
        const isRed = task.tone === 'red';
        const badgeClass = isRed
            ? 'bg-red-500/10 text-red-500 border-red-500/35'
            : 'bg-amber-500/10 text-amber-500 border-amber-500/35';

        return `
            <article class="rounded-2xl border border-slate-200/80 dark:border-slate-700/80 bg-white/60 dark:bg-slate-900/55 p-4">
                <div class="flex items-start justify-between gap-4">
                    <div>
                        <h4 class="font-bold text-sm text-slate-900 dark:text-white">${escapeHtml(task.title)}</h4>
                        <p class="text-xs text-slate-500 dark:text-slate-400 mt-2">
                            <i class="ph ph-folder"></i> ${escapeHtml(task.project)}
                            <span class="mx-1">•</span>
                            <i class="ph ph-user"></i> ${escapeHtml(task.assignee)}
                        </p>
                    </div>
                    <span class="shrink-0 inline-flex items-center gap-1 px-3 py-1 rounded-lg border text-xs font-bold ${badgeClass}">
                        <i class="ph ph-clock"></i>${escapeHtml(task.status || (isRed ? 'เร่งด่วน' : 'ใกล้กำหนด'))}
                    </span>
                </div>
                <div class="text-right mt-2 font-bold text-sm text-slate-900 dark:text-white">${baht(task.amount)}</div>
            </article>
        `;
    }).join('');
}

function renderBudgetChart(projects) {
    const canvas = document.getElementById('budgetChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const approvedProjects = projects.filter(project => project.status === 'approved');
    const labels = approvedProjects.map(p => p.name);
    const usedData = approvedProjects.map(p => toNumber(p.used));
    const remainingData = approvedProjects.map(p => Math.max(toNumber(p.total) - toNumber(p.used), 0));

    if (budgetChart) budgetChart.destroy();

    budgetChart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'งบที่อนุมัติแล้ว (บาท)', data: approvedProjects.map(p => toNumber(p.total)), backgroundColor: '#3b6fc8', borderRadius: 3 },
                { label: 'งบใช้จริง (บาท)', data: usedData, backgroundColor: '#15986e', borderRadius: 3 },
                { label: 'งบคงเหลือในโครงการ (บาท)', data: remainingData, backgroundColor: '#c8820f', borderRadius: 3 }
            ]
        },
        options: chartBaseOptions(false)
    });
}

function renderWorkloadChart(workloads) {
    const canvas = document.getElementById('workloadChart');
    if (!canvas || typeof Chart === 'undefined') return;

    if (workloadChart) workloadChart.destroy();

    workloadChart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: workloads.map(w => w.name),
            datasets: [
                { label: 'ค้างทำ', data: workloads.map(w => w.todo || 0), backgroundColor: '#7a7f8c' },
                { label: 'กำลังดำเนินงาน', data: workloads.map(w => w.doing || 0), backgroundColor: '#356bbd' },
                { label: 'รอตรวจทาน', data: workloads.map(w => w.review || 0), backgroundColor: '#c8820f' },
                { label: 'เสร็จสมบูรณ์', data: workloads.map(w => w.done || 0), backgroundColor: '#16966f' }
            ]
        },
        options: chartBaseOptions(true)
    });
}

function chartBaseOptions(stacked) {
    const isDark = document.documentElement.classList.contains('dark');
    return {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
            legend: { labels: { color: isDark ? '#cbd5e1' : '#475569', boxWidth: 18 } }
        },
        scales: {
            x: { stacked, ticks: { color: isDark ? '#cbd5e1' : '#475569', maxRotation: 0, autoSkip: true }, grid: { color: 'rgba(148,163,184,.12)' } },
            y: { stacked, beginAtZero: true, ticks: { color: isDark ? '#cbd5e1' : '#475569' }, grid: { color: 'rgba(148,163,184,.16)' } }
        }
    };
}

function injectMetricCardThemeStyle() {
    if (document.getElementById('metricSoftCardThemeStyle')) return;

    const style = document.createElement('style');
    style.id = 'metricSoftCardThemeStyle';
    style.textContent = `
        /* Force override dashboard-card dark/black background */
        article.metric-soft-card,
        .dashboard-card.metric-soft-card,
        .metric-card.metric-soft-card {
            position: relative !important;
            overflow: hidden !important;
            border-width: 1px !important;
            backdrop-filter: blur(14px) !important;
            transition: background .25s ease, border-color .25s ease, box-shadow .25s ease, transform .25s ease !important;
            background-color: transparent !important;
            background-blend-mode: normal !important;
        }

        article.metric-soft-card::before,
        .dashboard-card.metric-soft-card::before,
        .metric-card.metric-soft-card::before {
            content: "" !important;
            position: absolute !important;
            inset: 0 !important;
            pointer-events: none !important;
            opacity: 1 !important;
            z-index: 0 !important;
        }

        article.metric-soft-card > *,
        .dashboard-card.metric-soft-card > *,
        .metric-card.metric-soft-card > * {
            position: relative !important;
            z-index: 1 !important;
        }

        article.metric-soft-card:hover,
        .dashboard-card.metric-soft-card:hover,
        .metric-card.metric-soft-card:hover {
            transform: translateY(-1px) !important;
        }

        /* LIGHT MODE */
        html:not(.dark) article.metric-soft-card[data-metric-card="total"],
        html:not(.dark) .dashboard-card.metric-soft-card[data-metric-card="total"] {
            background: linear-gradient(135deg, rgba(37, 99, 235, .20) 0%, rgba(37, 99, 235, .105) 42%, rgba(37, 99, 235, .045) 100%) !important;
            border-color: rgba(37, 99, 235, .42) !important;
            box-shadow: inset 4px 0 0 rgba(37, 99, 235, .95), 0 18px 44px rgba(37, 99, 235, .13) !important;
        }
        html:not(.dark) article.metric-soft-card[data-metric-card="used"],
        html:not(.dark) .dashboard-card.metric-soft-card[data-metric-card="used"] {
            background: linear-gradient(135deg, rgba(245, 158, 11, .22) 0%, rgba(245, 158, 11, .115) 42%, rgba(245, 158, 11, .048) 100%) !important;
            border-color: rgba(245, 158, 11, .46) !important;
            box-shadow: inset 4px 0 0 rgba(245, 158, 11, .95), 0 18px 44px rgba(245, 158, 11, .13) !important;
        }
        html:not(.dark) article.metric-soft-card[data-metric-card="remaining"],
        html:not(.dark) .dashboard-card.metric-soft-card[data-metric-card="remaining"] {
            background: linear-gradient(135deg, rgba(16, 185, 129, .22) 0%, rgba(16, 185, 129, .115) 42%, rgba(16, 185, 129, .048) 100%) !important;
            border-color: rgba(16, 185, 129, .46) !important;
            box-shadow: inset 4px 0 0 rgba(16, 185, 129, .95), 0 18px 44px rgba(16, 185, 129, .13) !important;
        }

        /* DARK MODE - stronger tint so it won't look black */
        html.dark article.metric-soft-card[data-metric-card="total"],
        html.dark .dashboard-card.metric-soft-card[data-metric-card="total"] {
            background: linear-gradient(135deg, rgba(37, 99, 235, .34) 0%, rgba(37, 99, 235, .18) 42%, rgba(37, 99, 235, .075) 100%) !important;
            border-color: rgba(96, 165, 250, .55) !important;
            box-shadow: inset 4px 0 0 rgba(37, 99, 235, 1), 0 18px 46px rgba(37, 99, 235, .24) !important;
        }
        html.dark article.metric-soft-card[data-metric-card="used"],
        html.dark .dashboard-card.metric-soft-card[data-metric-card="used"] {
            background: linear-gradient(135deg, rgba(245, 158, 11, .36) 0%, rgba(245, 158, 11, .19) 42%, rgba(245, 158, 11, .08) 100%) !important;
            border-color: rgba(251, 191, 36, .58) !important;
            box-shadow: inset 4px 0 0 rgba(245, 158, 11, 1), 0 18px 46px rgba(245, 158, 11, .23) !important;
        }
        html.dark article.metric-soft-card[data-metric-card="remaining"],
        html.dark .dashboard-card.metric-soft-card[data-metric-card="remaining"] {
            background: linear-gradient(135deg, rgba(16, 185, 129, .36) 0%, rgba(16, 185, 129, .19) 42%, rgba(16, 185, 129, .08) 100%) !important;
            border-color: rgba(52, 211, 153, .58) !important;
            box-shadow: inset 4px 0 0 rgba(16, 185, 129, 1), 0 18px 46px rgba(16, 185, 129, .23) !important;
        }

        html.dark article.metric-soft-card[data-metric-card="total"]::before,
        html.dark .dashboard-card.metric-soft-card[data-metric-card="total"]::before {
            background: radial-gradient(circle at 14% 20%, rgba(96, 165, 250, .22), transparent 38%) !important;
        }
        html.dark article.metric-soft-card[data-metric-card="used"]::before,
        html.dark .dashboard-card.metric-soft-card[data-metric-card="used"]::before {
            background: radial-gradient(circle at 14% 20%, rgba(251, 191, 36, .24), transparent 38%) !important;
        }
        html.dark article.metric-soft-card[data-metric-card="remaining"]::before,
        html.dark .dashboard-card.metric-soft-card[data-metric-card="remaining"]::before {
            background: radial-gradient(circle at 14% 20%, rgba(52, 211, 153, .24), transparent 38%) !important;
        }
    `;
    document.head.appendChild(style);
}

function getFallbackDashboardHtml() {
    return `
        <section class="space-y-6">
            <div id="firebaseStatus" class="hidden rounded-2xl border px-4 py-3 text-sm"></div>
            <div class="grid grid-cols-1 xl:grid-cols-3 gap-5">
                <article class="dashboard-card metric-card rounded-2xl p-6" style="--accent:#2563eb"><p class="text-xs font-semibold text-slate-500 dark:text-slate-400">งบประมาณรวมฝ่าย</p><h3 id="totalBudget" class="text-3xl font-extrabold text-slate-900 dark:text-white mt-1">฿0</h3><p class="text-xs font-semibold text-blue-500 mt-1">อ่านจาก settings/budget.totalBudget</p></article>
                <article class="dashboard-card metric-card rounded-2xl p-6" style="--accent:#f59e0b"><p class="text-xs font-semibold text-slate-500 dark:text-slate-400">งบที่อนุมัติแล้ว</p><h3 id="usedBudget" class="text-3xl font-extrabold text-slate-900 dark:text-white mt-1">฿0</h3><p id="usedPercent" class="text-xs font-semibold text-amber-500 mt-1">0%</p></article>
                <article class="dashboard-card metric-card rounded-2xl p-6" style="--accent:#10b981"><p class="text-xs font-semibold text-slate-500 dark:text-slate-400">งบประมาณรวมคงเหลือ</p><h3 id="remainingBudget" class="text-3xl font-extrabold text-slate-900 dark:text-white mt-1">฿0</h3><p id="remainingPercent" class="text-xs font-semibold text-emerald-500 mt-1">0%</p></article>
            </div>
            <div class="grid grid-cols-1 2xl:grid-cols-7 gap-5">
                <section class="dashboard-card rounded-2xl 2xl:col-span-4 overflow-hidden"><div class="px-6 py-5 border-b border-slate-200/70 dark:border-slate-700/70"><h3 class="font-bold text-slate-900 dark:text-white">สถานะงบประมาณโครงการย่อย</h3></div><div id="projectList" class="p-5 space-y-4 max-h-[390px] overflow-y-auto soft-scroll"></div></section>
                <section class="dashboard-card rounded-2xl 2xl:col-span-3 overflow-hidden"><div class="px-6 py-5 border-b border-slate-200/70 dark:border-slate-700/70"><h3 class="font-bold text-slate-900 dark:text-white">สัดส่วนการใช้งบประมาณ</h3></div><div class="p-5 chart-box"><canvas id="budgetChart"></canvas></div></section>
            </div>
            <div class="grid grid-cols-1 2xl:grid-cols-2 gap-5">
                <section class="dashboard-card rounded-2xl overflow-hidden"><div class="px-6 py-5 border-b border-slate-200/70 dark:border-slate-700/70"><h3 class="font-bold text-slate-900 dark:text-white">ภาระงานของทีมงานรายบุคคล</h3></div><div class="p-5 chart-box"><canvas id="workloadChart"></canvas></div></section>
                <section class="dashboard-card rounded-2xl overflow-hidden"><div class="px-6 py-5 border-b border-slate-200/70 dark:border-slate-700/70"><h3 class="font-bold text-slate-900 dark:text-white">งานที่ล่าช้าหรือใกล้ถึงกำหนดส่ง</h3></div><div id="urgentList" class="p-5 space-y-3"></div></section>
            </div>
        </section>
    `;
}

function showFirebaseStatus(message, type = 'info') {
    const el = document.getElementById('firebaseStatus');
    if (!el) return;

    const styles = {
        info: 'border-blue-400/40 bg-blue-500/10 text-blue-600 dark:text-blue-300',
        success: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
        error: 'border-red-400/40 bg-red-500/10 text-red-600 dark:text-red-300'
    };

    el.className = `rounded-2xl border px-4 py-3 text-sm ${styles[type] || styles.info}`;
    el.textContent = message;
}

function hideFirebaseStatus() {
    const el = document.getElementById('firebaseStatus');
    if (el) el.classList.add('hidden');
}

function getProjectDurationText(data) {
    if (data.noDeadline) return 'ไม่มีกำหนดเวลา';
    if (data.startDate && data.endDate) return `${formatThaiDate(data.startDate)} - ${formatThaiDate(data.endDate)}`;
    return '-';
}

function formatThaiDate(dateString) {
    const date = new Date(`${dateString}T00:00:00`);
    if (Number.isNaN(date.getTime())) return dateString || '-';
    return date.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function showBody() {
    document.getElementById('appBody')?.classList.remove('hidden');
}

function toNumber(value) {
    const number = Number(value || 0);
    return Number.isFinite(number) ? number : 0;
}

function baht(value) {
    return `฿${toNumber(value).toLocaleString('th-TH')}`;
}

function percent(part, total) {
    return total > 0 ? ((toNumber(part) / toNumber(total)) * 100).toFixed(1) : '0.0';
}

function clamp(value) {
    return Math.max(0, Math.min(100, toNumber(value)));
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[char]));
}

function escapeAttr(value) {
    return escapeHtml(value);
}
