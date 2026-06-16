// assets/js/dashboard.js
// เวอร์ชันไม่เชื่อม Firebase: แก้ตัวเลขในไฟล์นี้แล้วหน้าเว็บต้องเปลี่ยนทันที

const defaultDashboardData = {
    summary: {
        totalBudget: 1000001,
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
        { name: 'บุญนิติ คงดี', todo: 0, doing: 0, review: 1, done: 1 }
    ],

    urgentTasks: [
        {
            title: 'ผลิตสื่อประชาสัมพันธ์ภาพลักษณ์องค์กร',
            project: 'งานสื่อสารองค์กร',
            assignee: 'วรรณาภา ทองเจริญ',
            amount: 50000,
            status: 'เลยกำหนด 6 วัน',
            tone: 'red'
        },
        {
            title: 'พัฒนาระบบความปลอดภัยข้อมูล',
            project: 'งานสารสนเทศ',
            assignee: 'ศิริวิดี บานปะพงศ์',
            amount: 40000,
            status: 'เลยกำหนด 5 วัน',
            tone: 'red'
        }
    ]
};

let budgetChart = null;
let workloadChart = null;

document.addEventListener('DOMContentLoaded', () => {
    waitForPageContent();
});

function waitForPageContent() {
    const pageContent = document.getElementById('pageContent');

    if (pageContent) {
        mountDashboard(pageContent);
        renderDashboard(defaultDashboardData);
        showBody();
        return;
    }

    const layoutRoot = document.getElementById('layoutRoot');

    if (!layoutRoot) {
        console.error('ไม่พบ #layoutRoot');
        showBody();
        return;
    }

    const observer = new MutationObserver(() => {
        const pageContent = document.getElementById('pageContent');

        if (pageContent) {
            observer.disconnect();
            mountDashboard(pageContent);
            renderDashboard(defaultDashboardData);
            showBody();
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

function renderDashboard(data) {
    const projects = data.projects || [];
    const workloads = data.workloads || [];
    const urgentTasks = data.urgentTasks || [];

    const total = Number(data.summary.totalBudget || 0);
    const used = Number(data.summary.usedBudget || 0);
    const remaining = Number(data.summary.remainingBudget || 0);

    setText('totalBudget', baht(total));
    setText('usedBudget', baht(used));
    setText('remainingBudget', baht(remaining));
    setText('usedPercent', `${percent(used, total)}% ของงบประมาณจัดสรร`);
    setText('remainingPercent', `${percent(remaining, total)}% ของงบประมาณจัดสรร`);

    renderProjects(projects);
    renderUrgentTasks(urgentTasks);
    renderBudgetChart(projects);
    renderWorkloadChart(workloads);
}

function renderProjects(projects) {
    const list = document.getElementById('projectList');
    if (!list) return;

    list.innerHTML = projects.map(project => {
        const usedPercent = percent(project.used, project.total);
        const progress = Number(project.progress || 0);

        return `
            <article class="rounded-2xl border border-slate-200/80 dark:border-slate-700/80 bg-white/60 dark:bg-slate-900/55 p-5">
                <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    <div class="flex items-start gap-3 min-w-0">
                        <div class="w-10 h-10 rounded-xl text-white flex items-center justify-center font-bold shrink-0"
                             style="background:${project.accent || '#3b82f6'}">
                            ${project.code || 'งา'}
                        </div>

                        <div class="min-w-0">
                            <h4 class="font-bold text-slate-900 dark:text-white truncate">
                                ${escapeHtml(project.name)}
                            </h4>
                            <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                ${escapeHtml(project.owner)}
                            </p>
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
                            <span>${progress.toFixed(1)}%</span>
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

    list.innerHTML = tasks.map(task => {
        const badgeClass = task.tone === 'red'
            ? 'bg-red-500/10 text-red-500 border-red-500/35'
            : 'bg-amber-500/10 text-amber-500 border-amber-500/35';

        return `
            <article class="rounded-2xl border border-slate-200/80 dark:border-slate-700/80 bg-white/60 dark:bg-slate-900/55 p-4">
                <div class="flex items-start justify-between gap-4">
                    <div>
                        <h4 class="font-bold text-sm text-slate-900 dark:text-white">
                            ${escapeHtml(task.title)}
                        </h4>
                        <p class="text-xs text-slate-500 dark:text-slate-400 mt-2">
                            <i class="ph ph-folder"></i> ${escapeHtml(task.project)}
                            <span class="mx-1">•</span>
                            <i class="ph ph-user"></i> ${escapeHtml(task.assignee)}
                        </p>
                    </div>

                    <span class="shrink-0 inline-flex items-center gap-1 px-3 py-1 rounded-lg border text-xs font-bold ${badgeClass}">
                        <i class="ph ph-clock"></i>${escapeHtml(task.status)}
                    </span>
                </div>

                <div class="text-right mt-2 font-bold text-sm text-slate-900 dark:text-white">
                    ${baht(task.amount)}
                </div>
            </article>
        `;
    }).join('');
}

function renderBudgetChart(projects) {
    const canvas = document.getElementById('budgetChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const labels = projects.map(p => p.name);
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
            labels: workloads.map(w => w.name),
            datasets: [
                {
                    label: 'ค้างทำ',
                    data: workloads.map(w => w.todo || 0),
                    backgroundColor: '#7a7f8c'
                },
                {
                    label: 'กำลังดำเนินงาน',
                    data: workloads.map(w => w.doing || 0),
                    backgroundColor: '#356bbd'
                },
                {
                    label: 'รอตรวจทาน',
                    data: workloads.map(w => w.review || 0),
                    backgroundColor: '#c8820f'
                },
                {
                    label: 'เสร็จสมบูรณ์',
                    data: workloads.map(w => w.done || 0),
                    backgroundColor: '#16966f'
                }
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
        plugins: {
            legend: {
                labels: {
                    color: isDark ? '#cbd5e1' : '#475569'
                }
            }
        },
        scales: {
            x: {
                stacked,
                ticks: {
                    color: isDark ? '#cbd5e1' : '#475569'
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

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function baht(value) {
    return `฿${Number(value || 0).toLocaleString('th-TH')}`;
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

function showBody() {
    const appBody = document.getElementById('appBody');
    if (appBody) appBody.classList.remove('hidden');
}