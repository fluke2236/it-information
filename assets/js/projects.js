// assets/js/projects.js
// Hotfix: เพิ่มระยะเวลาโครงการ + ไม่มีกำหนดเวลา + Admin/Manager ปรับงบได้
// ใช้ได้แม้ projects.html ยังเป็นฟอร์มเก่า เพราะ JS จะ inject ช่องที่ขาดให้เอง
// Version: approval-budget-duration-hotfix-v2

import { db, auth } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    collection,
    doc,
    getDoc,
    addDoc,
    updateDoc,
    onSnapshot,
    query,
    orderBy,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

console.log('projects.js loaded: approval-budget-duration-hotfix-v2');

const TOTAL_BUDGET = 1500000;
const APPROVER_ROLES = ['admin', 'manager'];
const CREATOR_ROLES = ['admin', 'manager', 'secretary', 'staff', 'employee'];

let currentUser = null;
let currentUserUid = null;
let isMockMode = false;
let canApprove = false;
let projectsUnsubscribe = null;
let currentActionProjectId = null;
let currentActionProject = null;

window.projectsMap = new Map();

document.addEventListener('DOMContentLoaded', () => {
    setupSharedUI();
    initAuth();
});

function setupSharedUI() {
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            document.documentElement.classList.toggle('dark');
            localStorage.setItem('color-theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
        });
    }

    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const closeSidebarBtn = document.getElementById('closeSidebarBtn');
    const sidebar = document.getElementById('sidebar');
    const mobileOverlay = document.getElementById('mobileOverlay');

    function toggleMenu() {
        if (!sidebar || !mobileOverlay) return;
        sidebar.classList.toggle('-translate-x-full');
        mobileOverlay.classList.toggle('hidden');
        setTimeout(() => mobileOverlay.classList.toggle('opacity-0'), 10);
    }

    if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', toggleMenu);
    if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', toggleMenu);
    if (mobileOverlay) mobileOverlay.addEventListener('click', toggleMenu);
}

function initAuth() {
    const mockUserStr = localStorage.getItem('mockUser');

    if (mockUserStr) {
        isMockMode = true;
        currentUser = JSON.parse(mockUserStr);
        currentUserUid = 'mock-uid';
        initProjectSystem();
        return;
    }

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = 'login.html';
            return;
        }

        try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (!userDoc.exists()) {
                window.location.href = 'login.html';
                return;
            }

            currentUser = {
                uid: user.uid,
                email: user.email,
                ...userDoc.data()
            };
            currentUserUid = user.uid;
            initProjectSystem();
        } catch (error) {
            console.error('Auth Error:', error);
            window.location.href = 'login.html';
        }
    });
}

function initProjectSystem() {
    document.getElementById('appBody')?.classList.remove('hidden');
    setupUserHeader();

    canApprove = APPROVER_ROLES.includes(currentUser?.role);
    const canCreate = CREATOR_ROLES.includes(currentUser?.role);

    if (canCreate) document.getElementById('createProjectBtn')?.classList.remove('hidden');

    injectProjectDurationFields();
    injectApprovalBudgetFields();
    setupProjectModal();
    setupActionModal();
    listenProjectsRealtime();
}

function setupUserHeader() {
    const userName = document.getElementById('userName');
    const userRole = document.getElementById('userRole');
    const adminMenu = document.getElementById('adminMenu');
    const logoutBtn = document.getElementById('logoutBtn');

    if (userName) userName.textContent = currentUser?.name || currentUser?.email || 'ผู้ใช้งานระบบ';

    const roleDisplay = {
        admin: 'ผู้ดูแลระบบ',
        manager: 'หัวหน้างาน',
        secretary: 'เลขาฯ',
        staff: 'พนักงานทั่วไป',
        employee: 'พนักงานทั่วไป'
    };

    if (userRole) userRole.textContent = roleDisplay[currentUser?.role] || currentUser?.role || 'พนักงานทั่วไป';
    if (adminMenu && currentUser?.role === 'admin') adminMenu.classList.remove('hidden');

    if (logoutBtn) {
        logoutBtn.onclick = () => {
            if (isMockMode) {
                localStorage.removeItem('mockUser');
                window.location.href = 'login.html';
                return;
            }
            signOut(auth).then(() => window.location.href = 'login.html');
        };
    }
}

// ✅ เพิ่มช่องระยะเวลาให้ modal เสนอโครงการ แม้ HTML ยังไม่มี
function injectProjectDurationFields() {
    if (document.getElementById('projNoDeadline')) return;

    const budgetInput = document.getElementById('projBudget');
    if (!budgetInput) return;

    const budgetWrapper = budgetInput.closest('div');
    if (!budgetWrapper) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'space-y-4';
    wrapper.innerHTML = `
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4" id="projectDateFields">
            <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">วันที่เริ่มต้น</label>
                <input type="date" id="projStartDate" class="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white focus:ring-2 focus:ring-brand-500 outline-none">
            </div>
            <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">วันที่สิ้นสุด</label>
                <input type="date" id="projEndDate" class="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white focus:ring-2 focus:ring-brand-500 outline-none">
            </div>
        </div>
        <label class="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 select-none">
            <input type="checkbox" id="projNoDeadline" class="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500">
            <span>ไม่มีกำหนดเวลา</span>
        </label>
    `;

    budgetWrapper.insertAdjacentElement('afterend', wrapper);

    const noDeadlineCheckbox = document.getElementById('projNoDeadline');
    noDeadlineCheckbox?.addEventListener('change', toggleDateInputsByNoDeadline);
}

function toggleDateInputsByNoDeadline() {
    const noDeadline = document.getElementById('projNoDeadline')?.checked;
    const startDateInput = document.getElementById('projStartDate');
    const endDateInput = document.getElementById('projEndDate');

    if (startDateInput) {
        startDateInput.disabled = Boolean(noDeadline);
        if (noDeadline) startDateInput.value = '';
    }
    if (endDateInput) {
        endDateInput.disabled = Boolean(noDeadline);
        if (noDeadline) endDateInput.value = '';
    }
}

// ✅ เพิ่มช่องงบอนุมัติให้ modal พิจารณา แม้ HTML ยังเป็น modal เดิม
function injectApprovalBudgetFields() {
    if (document.getElementById('approveBudget')) return;

    const actionProjName = document.getElementById('actionProjName');
    if (!actionProjName) return;

    const container = actionProjName.closest('.p-6') || actionProjName.parentElement;
    if (!container) return;

    const fieldBox = document.createElement('div');
    fieldBox.className = 'text-left space-y-4 my-5';
    fieldBox.innerHTML = `
        <div class="rounded-xl bg-slate-50 dark:bg-slate-900/50 p-4 space-y-2">
            <div>
                <div class="text-xs text-slate-500 dark:text-slate-400 mb-1">งบประมาณที่ผู้เสนอขอ</div>
                <div class="font-bold text-brand-600 dark:text-sky-400"><span id="actionRequestedBudget">0</span> THB</div>
            </div>
            <div>
                <div class="text-xs text-slate-500 dark:text-slate-400 mb-1">ระยะเวลาโครงการ</div>
                <div class="font-medium text-slate-700 dark:text-slate-200" id="actionProjectDuration">-</div>
            </div>
        </div>
        <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">งบประมาณที่หัวหน้าอนุมัติ / ปรับแก้ (บาท)</label>
            <input type="number" id="approveBudget" min="0" step="1000" class="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white focus:ring-2 focus:ring-brand-500 outline-none">
        </div>
        <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">หมายเหตุการอนุมัติ</label>
            <textarea id="approveNote" rows="2" class="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white focus:ring-2 focus:ring-brand-500 outline-none"></textarea>
        </div>
    `;

    const buttonRow = document.getElementById('btnRejectProj')?.parentElement;
    if (buttonRow) buttonRow.insertAdjacentElement('beforebegin', fieldBox);
    else container.appendChild(fieldBox);
}

function setupProjectModal() {
    const modal = document.getElementById('projectModal');
    const content = document.getElementById('projectModalContent');
    const form = document.getElementById('projectForm');
    const createProjectBtn = document.getElementById('createProjectBtn');
    const closeBtn = document.getElementById('closeProjectModalBtn');
    const cancelBtn = document.getElementById('cancelProjectModalBtn');

    if (!modal || !content || !form) return;

    function toggleModal(show) {
        if (show) {
            injectProjectDurationFields();
            modal.classList.remove('hidden');
            setTimeout(() => {
                modal.classList.remove('opacity-0');
                content.classList.remove('scale-95');
            }, 10);
        } else {
            modal.classList.add('opacity-0');
            content.classList.add('scale-95');
            setTimeout(() => modal.classList.add('hidden'), 250);
            form.reset();
            const start = document.getElementById('projStartDate');
            const end = document.getElementById('projEndDate');
            const noDeadline = document.getElementById('projNoDeadline');
            if (noDeadline) noDeadline.checked = false;
            if (start) start.disabled = false;
            if (end) end.disabled = false;
            document.getElementById('projectModalError')?.classList.add('hidden');
        }
    }

    createProjectBtn?.addEventListener('click', () => toggleModal(true));
    closeBtn?.addEventListener('click', () => toggleModal(false));
    cancelBtn?.addEventListener('click', () => toggleModal(false));

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const errorMsg = document.getElementById('projectModalError');
        const saveBtn = document.getElementById('saveProjectBtn');
        const spinner = document.getElementById('saveProjectSpinner');

        errorMsg?.classList.add('hidden');
        if (saveBtn) saveBtn.disabled = true;
        spinner?.classList.remove('hidden');

        const title = document.getElementById('projTitle')?.value.trim();
        const desc = document.getElementById('projDesc')?.value.trim();
        const requestedBudget = Number(document.getElementById('projBudget')?.value || 0);
        const noDeadline = Boolean(document.getElementById('projNoDeadline')?.checked);
        const startDate = document.getElementById('projStartDate')?.value || '';
        const endDate = document.getElementById('projEndDate')?.value || '';

        if (!title || !desc || requestedBudget < 0) {
            showFormError(errorMsg, 'กรุณากรอกข้อมูลให้ครบถ้วน และงบประมาณต้องไม่ติดลบ');
            resetSubmitState(saveBtn, spinner);
            return;
        }

        if (!noDeadline && (!startDate || !endDate)) {
            showFormError(errorMsg, 'กรุณาระบุวันที่เริ่มต้นและวันที่สิ้นสุด หรือเลือกไม่มีกำหนดเวลา');
            resetSubmitState(saveBtn, spinner);
            return;
        }

        if (!noDeadline && startDate > endDate) {
            showFormError(errorMsg, 'วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่มต้น');
            resetSubmitState(saveBtn, spinner);
            return;
        }

        if (isMockMode) {
            alert('Mock Mode: เสนอโครงการสำเร็จ');
            toggleModal(false);
            resetSubmitState(saveBtn, spinner);
            return;
        }

        try {
            await addDoc(collection(db, 'projects'), {
                title,
                description: desc,
                requestedBudget,
                noDeadline,
                startDate: noDeadline ? null : startDate,
                endDate: noDeadline ? null : endDate,
                durationLabel: noDeadline ? 'ไม่มีกำหนดเวลา' : formatProjectDuration(startDate, endDate),

                // Pending project must not affect dashboard budget yet
                budgetAllocated: 0,
                budgetSpent: 0,
                name: title,
                ownerName: currentUser?.name || currentUser?.email || 'Unknown',
                totalBudget: 0,
                usedBudget: 0,
                progress: 0,
                code: 'งา',
                accent: '#3b82f6',

                status: 'pending',
                createdBy: currentUserUid,
                creatorName: currentUser?.name || currentUser?.email || 'Unknown',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });

            toggleModal(false);
        } catch (error) {
            console.error('Save Project Error:', error);
            showFormError(errorMsg, 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
        } finally {
            resetSubmitState(saveBtn, spinner);
        }
    });
}

function resetSubmitState(saveBtn, spinner) {
    if (saveBtn) saveBtn.disabled = false;
    spinner?.classList.add('hidden');
}

function setupActionModal() {
    const modal = document.getElementById('actionModal');
    const content = document.getElementById('actionModalContent');
    const closeBtn = document.getElementById('closeActionModal');
    const approveBtn = document.getElementById('btnApproveProj');
    const rejectBtn = document.getElementById('btnRejectProj');

    if (!modal || !content) return;

    window.openActionModal = (id) => {
        injectApprovalBudgetFields();

        const project = window.projectsMap?.get(id);
        if (!project) return;

        currentActionProjectId = id;
        currentActionProject = project;

        document.getElementById('actionProjName').textContent = project.title || project.name || 'ไม่ระบุชื่อโครงการ';
        setText('actionRequestedBudget', formatNumber(project.requestedBudget || project.budgetAllocated || project.totalBudget || 0));
        setText('actionProjectDuration', project.durationLabel || getProjectDurationText(project));

        const budgetInput = document.getElementById('approveBudget');
        if (budgetInput) budgetInput.value = Number(project.totalBudget || project.budgetAllocated || project.requestedBudget || 0);

        const noteInput = document.getElementById('approveNote');
        if (noteInput) noteInput.value = project.approveNote || '';

        const isApproved = project.status === 'approved';
        if (approveBtn) approveBtn.textContent = isApproved ? 'บันทึกงบประมาณ' : 'อนุมัติโครงการ';
        if (rejectBtn) rejectBtn.classList.toggle('hidden', isApproved);

        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            content.classList.remove('scale-95');
        }, 10);
    };

    function closeModal() {
        modal.classList.add('opacity-0');
        content.classList.add('scale-95');
        setTimeout(() => modal.classList.add('hidden'), 250);
        currentActionProjectId = null;
        currentActionProject = null;
    }

    closeBtn?.addEventListener('click', closeModal);
    approveBtn?.addEventListener('click', () => approveOrUpdateBudget(closeModal));
    rejectBtn?.addEventListener('click', () => rejectProject(closeModal));
}

async function approveOrUpdateBudget(closeModal) {
    if (!currentActionProjectId) return;

    if (!canApprove) {
        alert('บัญชีนี้ไม่มีสิทธิ์อนุมัติหรือแก้งบประมาณ');
        return;
    }

    const budget = Number(document.getElementById('approveBudget')?.value || 0);
    const note = document.getElementById('approveNote')?.value.trim() || '';

    if (budget < 0) {
        alert('งบประมาณต้องไม่ติดลบ');
        return;
    }

    if (isMockMode) {
        alert('Mock Mode: อนุมัติ/แก้งบประมาณสำเร็จ');
        closeModal();
        return;
    }

    try {
        const updatePayload = {
            status: 'approved',
            budgetAllocated: budget,
            totalBudget: budget,
            usedBudget: Number(currentActionProject?.usedBudget || currentActionProject?.budgetSpent || 0),
            name: currentActionProject?.name || currentActionProject?.title || 'ไม่ระบุชื่อโครงการ',
            ownerName: currentActionProject?.ownerName || currentActionProject?.creatorName || 'Unknown',

            noDeadline: Boolean(currentActionProject?.noDeadline),
            startDate: currentActionProject?.startDate || null,
            endDate: currentActionProject?.endDate || null,
            durationLabel: currentActionProject?.durationLabel || getProjectDurationText(currentActionProject),

            approverId: currentUserUid,
            approverName: currentUser?.name || currentUser?.email || 'Unknown',
            approveNote: note,
            updatedAt: serverTimestamp()
        };

        if (currentActionProject?.status !== 'approved') {
            updatePayload.approvedAt = serverTimestamp();
        }

        await updateDoc(doc(db, 'projects', currentActionProjectId), updatePayload);
        closeModal();
    } catch (error) {
        console.error('Approve/Update Budget Error:', error);
        alert('อัปเดตไม่สำเร็จ กรุณาตรวจสอบสิทธิ์ Firestore Rules หรือ role ของผู้ใช้');
    }
}

async function rejectProject(closeModal) {
    if (!currentActionProjectId) return;

    if (!canApprove) {
        alert('บัญชีนี้ไม่มีสิทธิ์ไม่อนุมัติโครงการ');
        return;
    }

    if (isMockMode) {
        alert('Mock Mode: ไม่อนุมัติโครงการ');
        closeModal();
        return;
    }

    try {
        await updateDoc(doc(db, 'projects', currentActionProjectId), {
            status: 'rejected',
            totalBudget: 0,
            budgetAllocated: 0,
            approverId: currentUserUid,
            approverName: currentUser?.name || currentUser?.email || 'Unknown',
            rejectedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        closeModal();
    } catch (error) {
        console.error('Reject Project Error:', error);
        alert('อัปเดตไม่สำเร็จ');
    }
}

function listenProjectsRealtime() {
    const grid = document.getElementById('projectsGrid');
    if (!grid) return;

    if (isMockMode) {
        grid.innerHTML = `<div class="col-span-full py-12 text-center text-slate-500">Mock Data Mode</div>`;
        return;
    }

    if (typeof projectsUnsubscribe === 'function') projectsUnsubscribe();

    const q = query(collection(db, 'projects'), orderBy('createdAt', 'desc'));

    projectsUnsubscribe = onSnapshot(q, (querySnapshot) => {
        grid.innerHTML = '';
        window.projectsMap = new Map();
        let totalApprovedBudget = 0;

        if (querySnapshot.empty) {
            grid.innerHTML = `<div class="col-span-full py-12 text-center text-slate-500">ยังไม่มีโครงการในระบบ</div>`;
        }

        querySnapshot.forEach((docSnap) => {
            const data = normalizeProjectDoc(docSnap.id, docSnap.data());
            window.projectsMap.set(docSnap.id, data);
            if (data.status === 'approved') totalApprovedBudget += Number(data.totalBudget || data.budgetAllocated || 0);
            grid.insertAdjacentHTML('beforeend', createProjectCard(docSnap.id, data));
        });

        updateGlobalBudget(totalApprovedBudget);
    }, (error) => {
        console.error('Error loading projects:', error);
        grid.innerHTML = `<div class="col-span-full py-12 text-center text-red-500">เกิดข้อผิดพลาดในการโหลดข้อมูล</div>`;
    });
}

function normalizeProjectDoc(id, data) {
    const title = data.title || data.name || 'ไม่ระบุชื่อโครงการ';
    const requestedBudget = Number(data.requestedBudget ?? data.budgetRequested ?? data.budgetAllocated ?? data.totalBudget ?? 0);
    const approvedBudget = Number(data.totalBudget ?? data.budgetAllocated ?? 0);

    return {
        id,
        ...data,
        title,
        name: data.name || title,
        description: data.description || '',
        requestedBudget,
        totalBudget: approvedBudget,
        budgetAllocated: approvedBudget,
        budgetSpent: Number(data.budgetSpent || data.usedBudget || 0),
        creatorName: data.creatorName || data.ownerName || 'Unknown',
        noDeadline: Boolean(data.noDeadline),
        startDate: data.startDate || null,
        endDate: data.endDate || null,
        durationLabel: data.durationLabel || getProjectDurationText(data),
        status: data.status || 'pending'
    };
}

function createProjectCard(projectId, data) {
    const statusMap = {
        pending: { label: 'รอหัวหน้าอนุมัติ', class: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800/50' },
        approved: { label: 'อนุมัติแล้ว', class: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50' },
        rejected: { label: 'ไม่อนุมัติ', class: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800/50' }
    };

    const statusInfo = statusMap[data.status] || statusMap.pending;
    const dateStr = data.createdAt?.toDate ? data.createdAt.toDate().toLocaleDateString('th-TH') : '';
    const requestedBudget = formatNumber(data.requestedBudget);
    const approvedBudget = formatNumber(data.totalBudget || data.budgetAllocated || 0);
    const durationText = data.durationLabel || getProjectDurationText(data);

    let actionHtml = '';
    if (canApprove && ['pending', 'approved'].includes(data.status)) {
        const buttonText = data.status === 'approved' ? 'แก้ไขงบประมาณ' : 'พิจารณาโครงการ';
        actionHtml = `
            <div class="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/50">
                <button onclick="window.openActionModal('${projectId}')" class="w-full py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-white text-sm font-medium rounded-lg transition-colors">${buttonText}</button>
            </div>
        `;
    }

    return `
        <div class="border border-slate-200 dark:border-slate-700 rounded-xl p-5 bg-white dark:bg-slate-800 shadow-sm hover:shadow-md transition-shadow flex flex-col h-full">
            <div class="flex justify-between items-start mb-3">
                <span class="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold border ${statusInfo.class}">${statusInfo.label}</span>
                <span class="text-xs text-slate-400">${dateStr}</span>
            </div>
            <h4 class="text-base font-bold text-slate-800 dark:text-white mb-2 line-clamp-2">${escapeHtml(data.title)}</h4>
            <p class="text-sm text-slate-500 dark:text-slate-400 mb-4 line-clamp-3 flex-grow">${escapeHtml(data.description)}</p>
            <div class="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3 mt-auto space-y-2">
                <div><div class="text-xs text-slate-500 dark:text-slate-400 mb-1">งบประมาณที่ขอ</div><div class="text-lg font-bold text-brand-600 dark:text-sky-400">${requestedBudget} <span class="text-xs font-normal">THB</span></div></div>
                <div><div class="text-xs text-slate-500 dark:text-slate-400 mb-1">งบประมาณที่อนุมัติ</div><div class="text-base font-bold text-emerald-600 dark:text-emerald-400">${approvedBudget} <span class="text-xs font-normal">THB</span></div></div>
                <div class="text-xs text-slate-400 mt-1">ผู้เสนอ: ${escapeHtml(data.creatorName || 'Unknown')}</div>
                <div class="text-xs text-slate-400 mt-1">ระยะเวลา: ${escapeHtml(durationText)}</div>
            </div>
            ${actionHtml}
        </div>
    `;
}

function updateGlobalBudget(spent) {
    const remaining = TOTAL_BUDGET - spent;
    const percent = TOTAL_BUDGET > 0 ? (spent / TOTAL_BUDGET) * 100 : 0;

    setText('globalSpent', formatNumber(spent));
    setText('globalRemaining', formatNumber(remaining));
    setText('budgetPercent', percent.toFixed(1));

    const bar = document.getElementById('budgetProgressBar');
    if (!bar) return;

    bar.style.width = `${Math.min(percent, 100)}%`;
    bar.className = 'bg-gradient-to-r from-brand-500 to-sky-400 h-3 rounded-full transition-all duration-1000';
    if (percent > 90) bar.className = 'bg-gradient-to-r from-red-500 to-orange-400 h-3 rounded-full transition-all duration-1000';
    else if (percent > 70) bar.className = 'bg-gradient-to-r from-amber-500 to-yellow-400 h-3 rounded-full transition-all duration-1000';
}

function formatProjectDuration(startDate, endDate) {
    if (!startDate || !endDate) return 'ไม่มีกำหนดเวลา';
    return `${formatThaiDate(startDate)} - ${formatThaiDate(endDate)}`;
}

function getProjectDurationText(project) {
    if (!project) return '-';
    if (project.noDeadline) return 'ไม่มีกำหนดเวลา';
    if (project.startDate && project.endDate) return formatProjectDuration(project.startDate, project.endDate);
    return 'ไม่มีกำหนดเวลา';
}

function formatThaiDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(`${dateString}T00:00:00`);
    if (Number.isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function showFormError(errorEl, message) {
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function formatNumber(value) {
    return new Intl.NumberFormat('th-TH').format(Number(value || 0));
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[char]));
}
