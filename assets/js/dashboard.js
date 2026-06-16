// assets/js/dashboard.js
// Dashboard UI + Firebase Firestore
// แก้แล้ว: เปลี่ยน defaultDashboardData แล้วสามารถบังคับ sync ไป Firestore ด้วย ?syncDashboard=1

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    doc,
    getDoc,
    setDoc,
    onSnapshot,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const DASHBOARD_REF = doc(db, 'dashboard', 'main');

let budgetChart = null;
let workloadChart = null;
let unsubscribeDashboard = null;

// ===============================
// ข้อมูลตั้งต้น Dashboard
// หมายเหตุ:
// - ข้อมูลนี้จะถูกใช้ตอน dashboard/main ยังไม่มีใน Firestore
// - ถ้า dashboard/main มีอยู่แล้ว ต้องเปิด dashboard.html?syncDashboard=1 เพื่อเขียนค่านี้ทับ summary ใน Firestore
// ===============================
const defaultDashboardData = {
    summary: {
        totalBudget: 1000000,
        usedBudget: 850000,
        remainingBudget: 150000
    },
    projects: [
        {
            id: 'media',
            code: 'งา',
            name: 'งานสารสนเทศ',
            owner: 'ผู้รับผิดชอบหลัก: ศิริวิดี บานปะพงศ์',
            total: 120000,
            used: 100000,
            progress: 50,
            accent: '#06b6d4'
        },
        {
            id: 'org',
            code: 'งา',
            name: 'งานสื่อสารองค์กร',
            owner: 'ผู้รับผิดชอบหลัก: วรรณาภา ทองเจริญ',
            total: 100000,
            used: 100000,
            progress: 33.3,
            accent: '#8b5cf6'
        },
        {
            id: 'security',
            code: 'งา',
            name: 'งานระบบความปลอดภัยข้อมูล',
            owner: 'ผู้รับผิดชอบหลัก: ทีมพัฒนาระบบ',
            total: 780000,
            used: 650000,
            progress: 82,
            accent: '#10b981'
        }
    ],
    workloads: [
        { name: 'รัตจะรัตน์ ปั้นทราย', todo: 1, doing: 1, review: 0, done: 1 },
        { name: 'สุทธิศักดิ์ ทองคำ', todo: 1, doing: 1, review: 0, done: 1 },
        { name: 'ชาญภพัฒน์ อินทร์บุรี', todo: 1, doing: 1, review: 0, done: 1 },
        { name: 'ศิริวิดี บานปะพงศ์', todo: 0, doing: 0, review: 1, done: 1 },
        { name: 'เดชธนินทร์ แก้วมณี', todo: 0, doing: 0, review: 1, done: 1 },
        { name: 'บุญนิติ คงดี', todo: 0, doing: 0, review: 1, done: 1 },
        { name: 'ธนณัฏฐ์ ปราณี', todo: 0, doing: 0, review: 1, done: 1 },
        { name: 'ปณิตดา ทองชุ่ม', todo: 0, doing: 0, review: 1, done: 1 },
        { name: 'วรรณาภา ทองเจริญ', todo: 1, doing: 1, review: 0, done: 1 }
    ],
    urgentTasks: [
        {
            title: 'ผลิตสื่อประชาสัมพันธ์ภาพลักษณ์องค์กร (PR Media Production)',
            project: 'งานสื่อสารองค์กร',
            assignee: 'วรรณาภา ทองเจริญ',
            amount: 50000,
            status: 'เลยกำหนด 6 วัน',
            tone: 'red'
        },
        {
            title: 'พัฒนาระบบความปลอดภัยข้อมูล (Data Privacy Compliance)',
            project: 'งานสารสนเทศ',
            assignee: 'ศิริวิดี บานปะพงศ์',
            amount: 40000,
            status: 'เลยกำหนด 5 วัน',
            tone: 'red'
        },
        {
            title: 'พัฒนาระบบหลังบ้าน (Backend System Development)',
            project: 'งานเทคนิค',
            assignee: 'รัตจะรัตน์ ปั้นทราย',
            amount: 400000,
            status: 'กำหนดส่งวันนี้',
            tone: 'amber'
        }
    ],
    updatedAt: null
};

document.addEventListener('DOMContentLoaded', () => {
    waitForHeaderThenStart();
});

// ===============================
// รอ header.js โหลด components/header.html แล้วให้มี #pageContent ก่อน
// ===============================
function waitForHeaderThenStart() {
    const existingContent = document.getElementById('pageContent');

    if (existingContent) {
        mountDashboard(existingContent);
        initAuthAndData();
        return;
    }

    const layoutRoot = document.getElementById('layoutRoot');

    if (!layoutRoot) {
        console.error('ไม่พบ #layoutRoot ใน dashboard.html');
        document.getElementById('appBody')?.classList.remove('hidden');
        return;
    }

    const observer = new MutationObserver(() => {
        const pageContent = document.getElementById('pageContent');

        if (pageContent) {
            observer.disconnect();
            mountDashboard(pageContent);
            initAuthAndData();
        }
    });

    observer.observe(layoutRoot, {
        childList: true,
        subtree: true
    });
}

function mountDashboard(pageContent) {
    const template = document.getElementById('dashboardTemplate');

    if (!template) {
        console.error('ไม่พบ #dashboardTemplate ใน dashboard.html');
        return;
    }

    if (document.getElementById('projectList')) return;

    pageContent.appendChild(template.content.cloneNode(true));
}

// ===============================
// Auth + User Header
// ===============================
function initAuthAndData() {
    const mockUserStr = localStorage.getItem('mockUser');

    if (mockUserStr) {
        const mockUser = JSON.parse(mockUserStr);
        initUserHeader(mockUser, true);
        initDashboardListener();
        return;
    }

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = 'login.html';
            return;
        }

        let appUser = {
            name: user.email,
            role: 'staff'
        };

        try {
            const userDocSnap = await getDoc(doc(db, 'users', user.uid));
            if (userDocSnap.exists()) {
                appUser = userDocSnap.data();
            }
        } catch (error) {
            console.error('Error fetching user data:', error);
        }

        initUserHeader(appUser, false);
        initDashboardListener();
    });
}

function initUserHeader(user, isMockUser) {
    const appBody = document.getElementById('appBody');
    const userName = document.getElementById('userName');
    const userRole = document.getElementById('userRole');
    const adminMenu = document.getElementById('adminMenu');
    const logoutBtn = document.getElementById('logoutBtn');

    if (appBody) appBody.classList.remove('hidden');

    if (userName) {
        userName.textContent = user.name || user.email || 'ผู้ใช้งานระบบ';
    }

    const roleDisplay = {
        admin: 'ผู้ดูแลระบบ',
        manager: 'หัวหน้างาน',
        secretary: 'เลขาฯ',
        staff: 'พนักงานทั่วไป',
        employee: 'พนักงานทั่วไป'
    };

    if (userRole) {
        userRole.textContent = roleDisplay[user.role] || user.role || 'พนักงานทั่วไป';
    }

    if (adminMenu && user.role === 'admin') {
        adminMenu.classList.remove('hidden');
    }

    if (logoutBtn) {
        logoutBtn.onclick = () => {
            if (isMockUser) {
                localStorage.removeItem('mockUser');
                window.location.href = 'login.html';
            } else {
                signOut(auth).then(() => {
                    window.location.href = 'login.html';
                }).catch((error) => {
                    console.error('Logout Error:', error);
                });
            }
        };
    }
}

// ===============================
// Firestore Dashboard Listener
// ===============================
async function initDashboardListener() {
    try {
        const snap = await getDoc(DASHBOARD_REF);

        // ถ้าไม่มีเอกสาร dashboard/main ให้สร้างจาก defaultDashboardData
        if (!snap.exists()) {
            await setDoc(DASHBOARD_REF, {
                ...defaultDashboardData,
                updatedAt: serverTimestamp()
            });

            showFirebaseStatus('สร้างข้อมูลตัวอย่างใน Firebase Firestore เรียบร้อยแล้ว', 'success');
        }

        // สำคัญ: ถ้าแก้ defaultDashboardData แล้วอยากเขียนค่าใหม่เข้า Firestore
        // ให้เปิด URL: dashboard.html?syncDashboard=1
        const urlParams = new URLSearchParams(window.location.search);

        if (urlParams.get('syncDashboard') === '1') {
            await setDoc(DASHBOARD_REF, {
                summary: {
                    totalBudget: defaultDashboardData.summary.totalBudget,
                    usedBudget: defaultDashboardData.summary.usedBudget,
                    remainingBudget: defaultDashboardData.summary.remainingBudget
                },
                updatedAt: serverTimestamp()
            }, { merge: true });

            showFirebaseStatus('อัปเดตยอดงบประมาณจาก dashboard.js ไปยัง Firebase แล้ว', 'success');

            // ลบ query เพื่อไม่ให้เขียนซ้ำทุกครั้งที่ refresh
            window.history.replaceState({}, document.title, window.location.pathname);
        }

        if (typeof unsubscribeDashboard === 'function') {
            unsubscribeDashboard();
        }

        unsubscribeDashboard = onSnapshot(DASHBOARD_REF, (docSnap) => {
            if (!docSnap.exists()) return;
            renderDashboard(docSnap.data());
        }, (error) => {
            console.error('Firestore listener error:', error);
            showFirebaseStatus('อ่านข้อมูลจาก Firebase ไม่สำเร็จ กรุณาตรวจสอบ Firestore Rules หรือ firebase-config.js', 'error');
            renderDashboard(defaultDashboardData);
        });
    } catch (error) {
        console.error('Dashboard init error:', error);
        showFirebaseStatus('ไม่สามารถเชื่อมต่อ Firebase ได้ จึงแสดงข้อมูลตัวอย่างก่อน', 'error');
        renderDashboard(defaultDashboardData);
    }
}

// ===============================
// Render Dashboard
// ===============================
function renderDashboard(data) {
    const projects = Array.isArray(data.projects) ? data.projects : [];
    const workloads = Array.isArray(data.workloads) ? data.workloads : [];
    const urgentTasks = Array.isArray(data.urgentTasks) ? data.urgentTasks : [];

    const total = Number(data.summary?.totalBudget ?? sum(projects, 'total'));
    const used = Number(data.summary?.usedBudget ?? sum(projects, 'used'));
    const remaining = Number(data.summary?.remainingBudget ?? Math.max(total - used, 0));

    setText('totalBudget', baht(total));
    setText('usedBudget', baht(used));
    setText('remainingBudget', baht(remaining));
    setText('usedPercent', `${percent(used, total)}% ของงบประมาณจัดสรร`);
    setText('remainingPercent', `${percent(remaining, total)}% ของงบประมาณจัดสรร`);

    renderProjects(projects);
    renderUrgentTasks(urgentTasks);
    renderBudgetChart(projects);
    renderWorkloadChart(workloads);

    const appBody = document.getElementById('appBody');
    if (appBody) appBody.classList.remove('hidden');
}

function renderProjects(projects) {
    const list = document.getElementById('projectList');
    if (!list) return;

    if (!projects.length) {
        list.innerHTML = `<div class="text-sm text-slate-500 dark:text-slate-400">ยังไม่มีข้อมูลโครงการ</div>`;
        return;
    }

    list.innerHTML = projects.map(project => {
        const usedPercent = percent(project.used, project.total);
        const progress = Number(project.progress || 0);

        return `
            <article class="rounded-2xl border border-slate-200/80 dark:border-slate-700/80 bg-white/60 dark:bg-slate-900/55 p-5">
                <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    <div class="flex items-start gap-3 min-w-0">
                        <div class="w-10 h-10 rounded-xl text-white flex items-center justify-center font-bold shrink-0" style="background:${escapeAttr(project.accent || '#3b82f6')}">${escapeHtml(project.code || 'งา')}</div>
                        <div class="min-w-0">
                            <h4 class="font-bold text-slate-900 dark:text-white truncate">${escapeHtml(project.name || '-')}</h4>
                            <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">${escapeHtml(project.owner || '-')}</p>
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
                        <div class="progress-track">
                            <div class="progress-fill bg-amber-400" style="width:${clamp(usedPercent)}%"></div>
                        </div>
                    </div>
                    <div>
                        <div class="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                            <span>ความคืบหน้างาน</span>
                            <span>${Number(progress).toFixed(1)}%</span>
                        </div>
                        <div class="progress-track">
                            <div class="progress-fill bg-emerald-500" style="width:${clamp(progress)}%"></div>
                        </div>
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
        list.innerHTML = `<div class="text-sm text-slate-500 dark:text-slate-400">ยังไม่มีรายการเร่งด่วน</div>`;
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
                        <h4 class="font-bold text-sm text-slate-900 dark:text-white">${escapeHtml(task.title || '-')}</h4>
                        <p class="text-xs text-slate-500 dark:text-slate-400 mt-2">
                            <i class="ph ph-folder"></i> ${escapeHtml(task.project || '-')}
                            <span class="mx-1">•</span>
                            <i class="ph ph-user"></i> ${escapeHtml(task.assignee || '-')}
                        </p>
                    </div>
                    <span class="shrink-0 inline-flex items-center gap-1 px-3 py-1 rounded-lg border text-xs font-bold ${badgeClass}">
                        <i class="ph ph-clock"></i>${escapeHtml(task.status || '-')}
                    </span>
                </div>
                <div class="text-right mt-2 font-bold text-sm text-slate-900 dark:text-white">${baht(task.amount || 0)}</div>
            </article>
        `;
    }).join('');
}

function renderBudgetChart(projects) {
    const canvas = document.getElementById('budgetChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const labels = projects.map(p => p.name || '-');
    const usedData = projects.map(p => Number(p.used || 0));
    const remainingData = projects.map(p => Math.max(Number(p.total || 0) - Number(p.used || 0), 0));

    if (budgetChart) budgetChart.destroy();

    budgetChart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'งบประมาณใช้ไป (บาท)',
                    data: usedData,
                    backgroundColor: '#3b6fc8',
                    borderRadius: 3
                },
                {
                    label: 'งบประมาณคงเหลือ (บาท)',
                    data: remainingData,
                    backgroundColor: '#15986e',
                    borderRadius: 3
                }
            ]
        },
        options: chartBaseOptions(true)
    });
}

function renderWorkloadChart(workloads) {
    const canvas = document.getElementById('workloadChart');
    if (!canvas || typeof Chart === 'undefined') return;

    if (workloadChart) workloadChart.destroy();

    workloadChart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: workloads.map(w => w.name || '-'),
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
        interaction: {
            mode: 'index',
            intersect: false
        },
        plugins: {
            legend: {
                labels: {
                    color: isDark ? '#cbd5e1' : '#475569',
                    boxWidth: 18
                }
            },
            tooltip: {
                callbacks: {
                    label: (ctx) => `${ctx.dataset.label}: ${Number(ctx.raw).toLocaleString('th-TH')}`
                }
            }
        },
        scales: {
            x: {
                stacked,
                ticks: {
                    color: isDark ? '#cbd5e1' : '#475569',
                    maxRotation: 0,
                    autoSkip: true
                },
                grid: {
                    color: 'rgba(148,163,184,.12)'
                }
            },
            y: {
                stacked,
                beginAtZero: true,
                ticks: {
                    color: isDark ? '#cbd5e1' : '#475569'
                },
                grid: {
                    color: 'rgba(148,163,184,.16)'
                }
            }
        }
    };
}

// ===============================
// Utility
// ===============================
function showFirebaseStatus(message, type = 'success') {
    const el = document.getElementById('firebaseStatus');
    if (!el) return;

    el.classList.remove('hidden');
    el.textContent = message;

    el.className = `rounded-2xl border px-4 py-3 text-sm ${type === 'success'
        ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
        : 'border-red-400/40 bg-red-500/10 text-red-600 dark:text-red-300'}`;
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function baht(value) {
    return `฿${Number(value || 0).toLocaleString('th-TH')}`;
}

function sum(items, key) {
    return items.reduce((acc, item) => acc + Number(item[key] || 0), 0);
}

function percent(part, total) {
    return total > 0 ? ((Number(part || 0) / Number(total)) * 100).toFixed(1) : '0.0';
}

function clamp(value) {
    return Math.max(0, Math.min(100, Number(value || 0)));
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
