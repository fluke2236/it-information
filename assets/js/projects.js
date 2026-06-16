// assets/js/projects.js
// Project workflow: Draft -> Submit -> Manager Approve / Reject / Request Edit
// Auto-clean rejected projects older than 30 days when this page loads/listens
// Version: projects-draft-review-autoclean-v7-fixed

import { db, auth } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

console.log('projects.js loaded: projects-draft-review-autoclean-v7-fixed');

const DEFAULT_TOTAL_BUDGET = 1500000;
const PROJECTS_COLLECTION = 'projects';
const BUDGET_REF = doc(db, 'settings', 'budget');
const REJECTED_AUTO_DELETE_DAYS = 30;

let currentUser = null;
let currentUserUid = null;
let isMockMode = false;
let canApprove = false;
let totalBudgetLimit = DEFAULT_TOTAL_BUDGET;
let lastApprovedBudgetTotal = 0;
let unsubscribeProjects = null;
let unsubscribeBudget = null;
let currentActionProjectId = null;
let currentActionProject = null;
let currentEditProjectId = null;

window.projectsMap = new Map();

const ALLOWED_ROLES = new Set([
  'admin', 'manager', 'administrator', 'head', 'department_head', 'head_department',
  'section_head', 'supervisor', 'director', 'ผู้ดูแลระบบ', 'หัวหน้าฝ่าย', 'หัวหน้างาน'
]);

const CREATOR_ROLES = new Set([
  'admin', 'manager', 'administrator', 'head', 'department_head', 'head_department',
  'section_head', 'supervisor', 'director', 'secretary', 'staff', 'employee',
  'ผู้ดูแลระบบ', 'หัวหน้าฝ่าย', 'หัวหน้างาน', 'เลขาฯ', 'พนักงานทั่วไป'
]);

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

  mobileMenuBtn?.addEventListener('click', toggleMenu);
  closeSidebarBtn?.addEventListener('click', toggleMenu);
  mobileOverlay?.addEventListener('click', toggleMenu);
}

async function initAuth() {
  const mockUserStr = localStorage.getItem('mockUser');
  if (mockUserStr) {
    isMockMode = true;
    currentUser = JSON.parse(mockUserStr);
    currentUserUid = 'mock-uid';
    initPage();
    return;
  }

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = 'login.html';
      return;
    }

    currentUserUid = user.uid;

    try {
      const userSnap = await getDoc(doc(db, 'users', user.uid));
      currentUser = userSnap.exists()
        ? { uid: user.uid, email: user.email, ...userSnap.data() }
        : { uid: user.uid, email: user.email, role: '' };
    } catch (error) {
      console.error('Load user profile error:', error);
      currentUser = { uid: user.uid, email: user.email, role: '' };
    }

    initPage();
  });
}

async function initPage() {
  document.getElementById('appBody')?.classList.remove('hidden');
  setupUserHeader();

  canApprove = await canApproveBudgetAndProjects();

  if (canCreateProject()) document.getElementById('createProjectBtn')?.classList.remove('hidden');

  ensureProjectDurationFields();
  ensureProjectFormButtons();
  ensureActionBudgetFields();
  ensureGlobalBudgetButtonAndModal();

  if (canApprove) document.getElementById('editGlobalBudgetBtn')?.classList.remove('hidden');

  setupProjectModal();
  setupActionModal();
  setupGlobalBudgetModal();
  listenGlobalBudget();
  listenProjects();
}

function setupUserHeader() {
  const roleDisplay = {
    admin: 'ผู้ดูแลระบบ', manager: 'หัวหน้างาน', secretary: 'เลขาฯ',
    staff: 'พนักงานทั่วไป', employee: 'พนักงานทั่วไป'
  };

  setText('userName', currentUser?.name || currentUser?.email || 'ผู้ใช้งานระบบ');
  setText('userRole', roleDisplay[currentUser?.role] || currentUser?.role || 'พนักงานทั่วไป');

  if (isAdminLike(currentUser?.role)) document.getElementById('adminMenu')?.classList.remove('hidden');

  const logoutBtn = document.getElementById('logoutBtn');
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

function normalizeRole(role) {
  return String(role || '').trim().toLowerCase();
}

function isAllowedRole(role) {
  const raw = String(role || '').trim();
  const lower = normalizeRole(raw);
  return ALLOWED_ROLES.has(raw) || ALLOWED_ROLES.has(lower);
}

function isAdminLike(role) {
  const raw = String(role || '').trim();
  const lower = normalizeRole(raw);
  return raw === 'ผู้ดูแลระบบ' || lower === 'admin' || lower === 'administrator';
}

function canCreateProject() {
  const raw = String(currentUser?.role || '').trim();
  const lower = normalizeRole(raw);
  return CREATOR_ROLES.has(raw) || CREATOR_ROLES.has(lower) || true;
}

async function canApproveBudgetAndProjects() {
  if (isAllowedRole(currentUser?.role)) return true;

  try {
    if (!isMockMode && currentUserUid) {
      const overrideSnap = await getDoc(doc(db, 'user_overrides', currentUserUid));
      const override = overrideSnap.exists() ? overrideSnap.data()?.overrides?.approve_project : null;
      if (override === 'allow') return true;
      if (override === 'deny') return false;
    }
  } catch (error) {
    console.warn('Override permission check error:', error);
  }

  const visibleRole = document.getElementById('userRole')?.textContent || '';
  return isAllowedRole(visibleRole);
}

// ---------- UI injection ----------
function ensureProjectDurationFields() {
  if (document.getElementById('projNoDeadline')) return;

  const budgetInput = document.getElementById('projBudget');
  const budgetWrapper = budgetInput?.closest('div');
  if (!budgetWrapper) return;

  const box = document.createElement('div');
  box.className = 'space-y-4';
  box.innerHTML = `
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
  budgetWrapper.insertAdjacentElement('afterend', box);

  document.getElementById('projNoDeadline')?.addEventListener('change', toggleProjectDates);
}

function ensureProjectFormButtons() {
  const saveBtn = document.getElementById('saveProjectBtn');
  if (!saveBtn) return;

  // เปลี่ยนปุ่มเดิมให้เป็นบันทึกร่าง
  saveBtn.dataset.action = 'draft';
  const span = saveBtn.querySelector('span');
  if (span) span.textContent = 'บันทึกร่าง';

  let existingSubmitBtn = document.getElementById('submitProjectNowBtn');
  if (existingSubmitBtn) {
    if (!existingSubmitBtn.dataset.bound) {
      existingSubmitBtn.dataset.bound = '1';
      existingSubmitBtn.addEventListener('click', () => submitProjectForm('pending'));
    }
    return;
  }

  const submitBtn = document.createElement('button');
  submitBtn.type = 'button';
  submitBtn.id = 'submitProjectNowBtn';
  submitBtn.className = 'px-5 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors flex items-center';
  submitBtn.innerHTML = '<span>บันทึกและส่ง</span>';
  submitBtn.addEventListener('click', () => submitProjectForm('pending'));

  saveBtn.insertAdjacentElement('afterend', submitBtn);
}

function toggleProjectDates() {
  const checked = document.getElementById('projNoDeadline')?.checked;
  const start = document.getElementById('projStartDate');
  const end = document.getElementById('projEndDate');
  if (start) {
    start.disabled = Boolean(checked);
    if (checked) start.value = '';
  }
  if (end) {
    end.disabled = Boolean(checked);
    if (checked) end.value = '';
  }
}

function ensureActionBudgetFields() {
  if (document.getElementById('approveBudget')) return;

  const actionProjName = document.getElementById('actionProjName');
  const buttonRow = document.getElementById('btnRejectProj')?.parentElement;
  if (!actionProjName || !buttonRow) return;

  const box = document.createElement('div');
  box.className = 'text-left space-y-4 my-5';
  box.innerHTML = `
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
      <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">คอมเมนต์ถึงพนักงาน</label>
      <textarea id="approveNote" rows="3" placeholder="ใช้เมื่อขอแก้ไขหรือแจ้งเหตุผลไม่อนุมัติ" class="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white focus:ring-2 focus:ring-brand-500 outline-none"></textarea>
    </div>
  `;

  buttonRow.insertAdjacentElement('beforebegin', box);

  const approveBtn = document.getElementById('btnApproveProj');
  const rejectBtn = document.getElementById('btnRejectProj');

  if (approveBtn) approveBtn.textContent = 'อนุมัติ';
  if (rejectBtn) rejectBtn.textContent = 'ไม่อนุมัติ';

  if (!document.getElementById('btnRequestEditProj')) {
    const requestEditBtn = document.createElement('button');
    requestEditBtn.id = 'btnRequestEditProj';
    requestEditBtn.type = 'button';
    requestEditBtn.className = 'px-4 py-2 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50 font-medium transition-colors';
    requestEditBtn.textContent = 'ขอแก้ไข';
    requestEditBtn.addEventListener('click', () => requestEditProject(closeActionModal));
    rejectBtn?.insertAdjacentElement('afterend', requestEditBtn);
  }
}

function ensureGlobalBudgetButtonAndModal() {
  ensureGlobalBudgetButton();
  ensureGlobalBudgetModal();
}

function ensureGlobalBudgetButton() {
  if (document.getElementById('editGlobalBudgetBtn')) return;

  const title = findBudgetTitle();
  if (!title) return;

  title.id = 'globalBudgetTitle';

  const row = document.createElement('div');
  row.id = 'globalBudgetTitleRow';
  row.className = 'relative z-10 flex justify-between items-start gap-4 flex-wrap mb-6';

  const parent = title.parentElement;
  parent.insertBefore(row, title);
  row.appendChild(title);
  title.classList.remove('mb-6');

  const btn = document.createElement('button');
  btn.id = 'editGlobalBudgetBtn';
  btn.type = 'button';
  btn.className = 'hidden inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-sm transition-colors';
  btn.innerHTML = '<i class="ph ph-pencil-simple"></i><span>แก้งบรวม</span>';
  row.appendChild(btn);
}

function findBudgetTitle() {
  const idEl = document.getElementById('globalBudgetTitle');
  if (idEl) return idEl;
  return Array.from(document.querySelectorAll('h1,h2,h3,h4,p,div'))
    .find(el => String(el.textContent || '').includes('ภาพรวมงบประมาณฝ่าย')) || null;
}

function ensureGlobalBudgetModal() {
  if (document.getElementById('globalBudgetModal')) return;

  const modal = document.createElement('div');
  modal.id = 'globalBudgetModal';
  modal.className = 'fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm z-[90] hidden flex items-center justify-center p-4 opacity-0 transition-opacity duration-300';
  modal.innerHTML = `
    <div id="globalBudgetModalContent" class="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-700 overflow-hidden transform scale-95 transition-transform duration-300">
      <div class="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
        <h3 class="text-lg font-bold text-slate-800 dark:text-white">แก้ไขงบประมาณรวมฝ่าย</h3>
        <button id="closeGlobalBudgetModalBtn" class="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"><i class="ph ph-x text-xl"></i></button>
      </div>
      <div class="p-6 space-y-4">
        <div id="globalBudgetError" class="hidden bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm p-3 rounded-lg border border-red-100 dark:border-red-800/50"></div>
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">งบประมาณรวมฝ่ายปีปัจจุบัน (บาท)</label>
          <input type="number" id="globalBudgetInput" min="0" step="1000" class="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white focus:ring-2 focus:ring-brand-500 outline-none">
        </div>
        <p class="text-xs text-slate-500 dark:text-slate-400">บันทึกที่ Firestore: <code>settings/budget.totalBudget</code></p>
        <div class="pt-2 flex justify-end gap-3">
          <button type="button" id="cancelGlobalBudgetBtn" class="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors">ยกเลิก</button>
          <button type="button" id="saveGlobalBudgetBtn" class="px-5 py-2 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-lg shadow-sm transition-colors flex items-center gap-2">
            <span>บันทึกงบรวม</span>
            <span id="saveGlobalBudgetSpinner" class="hidden inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
          </button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

// ---------- project modal ----------
function setupProjectModal() {
  const modal = document.getElementById('projectModal');
  const content = document.getElementById('projectModalContent');
  const form = document.getElementById('projectForm');

  function toggle(show, project = null) {
    if (!modal || !content || !form) return;
    if (show) {
      ensureProjectDurationFields();
      ensureProjectFormButtons();
      fillProjectForm(project);
      modal.classList.remove('hidden');
      setTimeout(() => {
        modal.classList.remove('opacity-0');
        content.classList.remove('scale-95');
      }, 10);
    } else {
      modal.classList.add('opacity-0');
      content.classList.add('scale-95');
      setTimeout(() => modal.classList.add('hidden'), 250);
      currentEditProjectId = null;
      form.reset();
      document.getElementById('projectModalError')?.classList.add('hidden');
      const start = document.getElementById('projStartDate');
      const end = document.getElementById('projEndDate');
      if (start) start.disabled = false;
      if (end) end.disabled = false;
    }
  }

  window.openProjectDraftModal = () => toggle(true, null);
  window.openProjectEditModal = (id) => {
    const project = window.projectsMap.get(id);
    if (!project) return;
    toggle(true, project);
  };

  document.getElementById('createProjectBtn')?.addEventListener('click', () => toggle(true, null));
  document.getElementById('closeProjectModalBtn')?.addEventListener('click', () => toggle(false));
  document.getElementById('cancelProjectModalBtn')?.addEventListener('click', () => toggle(false));

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await submitProjectForm('draft');
  });
}

function fillProjectForm(project) {
  currentEditProjectId = project?.id || null;
  setValue('projTitle', project?.title || '');
  setValue('projDesc', project?.description || '');
  setValue('projBudget', project?.requestedBudget || '');
  setValue('projStartDate', project?.startDate || '');
  setValue('projEndDate', project?.endDate || '');
  const noDeadline = document.getElementById('projNoDeadline');
  if (noDeadline) noDeadline.checked = Boolean(project?.noDeadline);
  toggleProjectDates();
}

async function submitProjectForm(nextStatus) {
  const errorEl = document.getElementById('projectModalError');
  const saveBtn = document.getElementById('saveProjectBtn');
  const submitBtn = document.getElementById('submitProjectNowBtn');
  const spinner = document.getElementById('saveProjectSpinner');

  errorEl?.classList.add('hidden');
  if (saveBtn) saveBtn.disabled = true;
  if (submitBtn) submitBtn.disabled = true;
  spinner?.classList.remove('hidden');

  const title = document.getElementById('projTitle')?.value.trim();
  const description = document.getElementById('projDesc')?.value.trim();
  const requestedBudget = Number(document.getElementById('projBudget')?.value || 0);
  const noDeadline = Boolean(document.getElementById('projNoDeadline')?.checked);
  const startDate = document.getElementById('projStartDate')?.value || '';
  const endDate = document.getElementById('projEndDate')?.value || '';

  if (!title || !description || requestedBudget < 0) {
    showFormError(errorEl, 'กรุณากรอกข้อมูลให้ครบถ้วน และงบประมาณต้องไม่ติดลบ');
    resetSubmit(saveBtn, submitBtn, spinner);
    return;
  }

  if (!noDeadline && (!startDate || !endDate)) {
    showFormError(errorEl, 'กรุณาระบุวันที่เริ่มต้นและวันที่สิ้นสุด หรือเลือกไม่มีกำหนดเวลา');
    resetSubmit(saveBtn, submitBtn, spinner);
    return;
  }

  if (!noDeadline && startDate > endDate) {
    showFormError(errorEl, 'วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่มต้น');
    resetSubmit(saveBtn, submitBtn, spinner);
    return;
  }

  const basePayload = {
    title,
    name: title,
    description,
    requestedBudget,
    noDeadline,
    startDate: noDeadline ? null : startDate,
    endDate: noDeadline ? null : endDate,
    durationLabel: noDeadline ? 'ไม่มีกำหนดเวลา' : formatProjectDuration(startDate, endDate),
    updatedAt: serverTimestamp()
  };

  try {
    if (currentEditProjectId) {
      const existing = window.projectsMap.get(currentEditProjectId);
      await updateDoc(doc(db, PROJECTS_COLLECTION, currentEditProjectId), {
        ...basePayload,
        status: nextStatus,
        submittedAt: nextStatus === 'pending' ? serverTimestamp() : (existing?.submittedAt || null),
        revisionResolvedAt: existing?.status === 'revision_requested' && nextStatus === 'pending' ? serverTimestamp() : null
      });
    } else {
      await addDoc(collection(db, PROJECTS_COLLECTION), {
        ...basePayload,
        budgetAllocated: 0,
        budgetSpent: 0,
        totalBudget: 0,
        usedBudget: 0,
        progress: 0,
        code: 'งา',
        accent: '#3b82f6',
        status: nextStatus,
        createdBy: currentUserUid,
        creatorName: currentUser?.name || currentUser?.email || 'Unknown',
        ownerName: currentUser?.name || currentUser?.email || 'Unknown',
        createdAt: serverTimestamp(),
        submittedAt: nextStatus === 'pending' ? serverTimestamp() : null
      });
    }

    closeProjectModal();
  } catch (error) {
    console.error('Save project error:', error);
    showFormError(errorEl, `เกิดข้อผิดพลาดในการบันทึกข้อมูล: ${error.code || error.message || error}`);
  } finally {
    resetSubmit(saveBtn, submitBtn, spinner);
  }
}

function closeProjectModal() {
  const modal = document.getElementById('projectModal');
  const content = document.getElementById('projectModalContent');
  const form = document.getElementById('projectForm');
  if (!modal || !content) return;
  modal.classList.add('opacity-0');
  content.classList.add('scale-95');
  setTimeout(() => modal.classList.add('hidden'), 250);
  currentEditProjectId = null;
  form?.reset();
}

function resetSubmit(saveBtn, submitBtn, spinner) {
  if (saveBtn) saveBtn.disabled = false;
  if (submitBtn) submitBtn.disabled = false;
  spinner?.classList.add('hidden');
}

// ---------- action modal ----------
function setupActionModal() {
  const modal = document.getElementById('actionModal');
  const content = document.getElementById('actionModalContent');

  window.openActionModal = (id) => {
    ensureActionBudgetFields();
    const project = window.projectsMap.get(id);
    if (!project) return;

    currentActionProjectId = id;
    currentActionProject = project;

    setText('actionProjName', project.title || project.name || 'ไม่ระบุชื่อโครงการ');
    setText('actionRequestedBudget', formatNumber(project.requestedBudget || 0));
    setText('actionProjectDuration', project.durationLabel || getProjectDurationText(project));

    const approveBudget = document.getElementById('approveBudget');
    if (approveBudget) approveBudget.value = Number(project.totalBudget || project.budgetAllocated || project.requestedBudget || 0);

    const note = document.getElementById('approveNote');
    if (note) note.value = project.managerComment || project.approveNote || '';

    modal.classList.remove('hidden');
    setTimeout(() => {
      modal.classList.remove('opacity-0');
      content.classList.remove('scale-95');
    }, 10);
  };

  window.closeActionModal = closeActionModal;

  document.getElementById('closeActionModal')?.addEventListener('click', closeActionModal);
  document.getElementById('btnApproveProj')?.addEventListener('click', () => approveProject(closeActionModal));
  document.getElementById('btnRejectProj')?.addEventListener('click', () => rejectProject(closeActionModal));
  document.getElementById('btnRequestEditProj')?.addEventListener('click', () => requestEditProject(closeActionModal));
}

function closeActionModal() {
  const modal = document.getElementById('actionModal');
  const content = document.getElementById('actionModalContent');
  if (!modal || !content) return;
  modal.classList.add('opacity-0');
  content.classList.add('scale-95');
  setTimeout(() => modal.classList.add('hidden'), 250);
  currentActionProjectId = null;
  currentActionProject = null;
}

async function approveProject(closeModal) {
  if (!currentActionProjectId) return;
  if (!canApprove) return alert('บัญชีนี้ไม่มีสิทธิ์อนุมัติหรือแก้งบประมาณ');

  const budget = Number(document.getElementById('approveBudget')?.value || 0);
  const comment = document.getElementById('approveNote')?.value.trim() || '';

  if (budget < 0) return alert('งบประมาณต้องไม่ติดลบ');

  try {
    await updateDoc(doc(db, PROJECTS_COLLECTION, currentActionProjectId), {
      status: 'approved',
      budgetAllocated: budget,
      totalBudget: budget,
      usedBudget: Number(currentActionProject?.usedBudget || currentActionProject?.budgetSpent || 0),
      approverId: currentUserUid,
      approverName: currentUser?.name || currentUser?.email || 'Unknown',
      managerComment: comment,
      approvedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      rejectedAt: null,
      autoDeleteAt: null
    });
    closeModal();
  } catch (error) {
    console.error('Approve error:', error);
    alert(`อัปเดตไม่สำเร็จ: ${error.code || error.message || error}`);
  }
}

async function rejectProject(closeModal) {
  if (!currentActionProjectId) return;
  if (!canApprove) return alert('บัญชีนี้ไม่มีสิทธิ์ไม่อนุมัติโครงการ');

  const comment = document.getElementById('approveNote')?.value.trim() || '';

  try {
    const rejectedAtDate = new Date();
    const autoDeleteAtDate = addDays(rejectedAtDate, REJECTED_AUTO_DELETE_DAYS);

    await updateDoc(doc(db, PROJECTS_COLLECTION, currentActionProjectId), {
      status: 'rejected',
      totalBudget: 0,
      budgetAllocated: 0,
      approverId: currentUserUid,
      approverName: currentUser?.name || currentUser?.email || 'Unknown',
      managerComment: comment,
      rejectedAt: serverTimestamp(),
      autoDeleteAt: autoDeleteAtDate,
      updatedAt: serverTimestamp()
    });
    closeModal();
  } catch (error) {
    console.error('Reject error:', error);
    alert(`อัปเดตไม่สำเร็จ: ${error.code || error.message || error}`);
  }
}

async function requestEditProject(closeModal) {
  if (!currentActionProjectId) return;
  if (!canApprove) return alert('บัญชีนี้ไม่มีสิทธิ์ขอแก้ไขโครงการ');

  const comment = document.getElementById('approveNote')?.value.trim() || '';
  if (!comment) return alert('กรุณาใส่คอมเมนต์เพื่อแจ้งพนักงานว่าต้องแก้ไขอะไร');

  try {
    await updateDoc(doc(db, PROJECTS_COLLECTION, currentActionProjectId), {
      status: 'revision_requested',
      managerComment: comment,
      revisionRequestedBy: currentUserUid,
      revisionRequestedByName: currentUser?.name || currentUser?.email || 'Unknown',
      revisionRequestedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      rejectedAt: null,
      autoDeleteAt: null
    });
    closeModal();
  } catch (error) {
    console.error('Request edit error:', error);
    alert(`อัปเดตไม่สำเร็จ: ${error.code || error.message || error}`);
  }
}

// ---------- global budget ----------
function setupGlobalBudgetModal() {
  document.getElementById('editGlobalBudgetBtn')?.addEventListener('click', openGlobalBudgetModal);
  document.getElementById('closeGlobalBudgetModalBtn')?.addEventListener('click', closeGlobalBudgetModal);
  document.getElementById('cancelGlobalBudgetBtn')?.addEventListener('click', closeGlobalBudgetModal);
  document.getElementById('saveGlobalBudgetBtn')?.addEventListener('click', saveGlobalBudget);
}

function openGlobalBudgetModal() {
  ensureGlobalBudgetModal();
  const modal = document.getElementById('globalBudgetModal');
  const content = document.getElementById('globalBudgetModalContent');
  const input = document.getElementById('globalBudgetInput');
  const error = document.getElementById('globalBudgetError');

  if (input) input.value = Number(totalBudgetLimit || DEFAULT_TOTAL_BUDGET);
  error?.classList.add('hidden');

  modal.classList.remove('hidden');
  setTimeout(() => {
    modal.classList.remove('opacity-0');
    content.classList.remove('scale-95');
  }, 10);
}

function closeGlobalBudgetModal() {
  const modal = document.getElementById('globalBudgetModal');
  const content = document.getElementById('globalBudgetModalContent');
  if (!modal || !content) return;
  modal.classList.add('opacity-0');
  content.classList.add('scale-95');
  setTimeout(() => modal.classList.add('hidden'), 250);
}

async function saveGlobalBudget() {
  if (!canApprove) {
    showGlobalBudgetError('บัญชีนี้ไม่มีสิทธิ์แก้ไขงบประมาณรวม');
    return;
  }

  const value = Number(document.getElementById('globalBudgetInput')?.value || 0);
  const saveBtn = document.getElementById('saveGlobalBudgetBtn');
  const spinner = document.getElementById('saveGlobalBudgetSpinner');

  if (!Number.isFinite(value) || value < 0) {
    showGlobalBudgetError('กรุณาระบุงบประมาณรวมให้ถูกต้อง');
    return;
  }

  try {
    if (saveBtn) saveBtn.disabled = true;
    spinner?.classList.remove('hidden');

    await setDoc(BUDGET_REF, {
      totalBudget: value,
      updatedBy: currentUserUid,
      updatedByName: currentUser?.name || currentUser?.email || 'Unknown',
      updatedAt: serverTimestamp()
    }, { merge: true });

    closeGlobalBudgetModal();
  } catch (error) {
    console.error('Save global budget error:', error);
    showGlobalBudgetError(`บันทึกไม่สำเร็จ: ${error.code || error.message || error}`);
  } finally {
    if (saveBtn) saveBtn.disabled = false;
    spinner?.classList.add('hidden');
  }
}

function showGlobalBudgetError(message) {
  const error = document.getElementById('globalBudgetError');
  if (!error) return;
  error.textContent = message;
  error.classList.remove('hidden');
}

function listenGlobalBudget() {
  if (unsubscribeBudget) unsubscribeBudget();

  unsubscribeBudget = onSnapshot(BUDGET_REF, (snap) => {
    totalBudgetLimit = snap.exists() ? Number(snap.data().totalBudget || DEFAULT_TOTAL_BUDGET) : DEFAULT_TOTAL_BUDGET;
    updateGlobalBudget(lastApprovedBudgetTotal);
  }, (error) => {
    console.error('Global budget listener error:', error);
    updateGlobalBudget(lastApprovedBudgetTotal);
  });
}

// ---------- list ----------
function listenProjects() {
  const grid = document.getElementById('projectsGrid');
  if (!grid) return;

  if (unsubscribeProjects) unsubscribeProjects();

  unsubscribeProjects = onSnapshot(collection(db, PROJECTS_COLLECTION), async (snapshot) => {
    grid.innerHTML = '';
    window.projectsMap = new Map();
    let approvedTotal = 0;
    const items = [];

    for (const docSnap of snapshot.docs) {
      const data = normalizeProjectDoc(docSnap.id, docSnap.data());

      if (shouldAutoDeleteRejected(data)) {
        try {
          await deleteDoc(doc(db, PROJECTS_COLLECTION, docSnap.id));
          continue;
        } catch (error) {
          console.warn('Auto delete rejected project failed:', error);
        }
      }

      items.push(data);
    }

    items.sort((a, b) => getTime(b.createdAt) - getTime(a.createdAt));

    if (!items.length) {
      grid.innerHTML = `<div class="col-span-full py-12 text-center text-slate-500">ยังไม่มีโครงการในระบบ</div>`;
    }

    items.forEach((data) => {
      window.projectsMap.set(data.id, data);
      if (data.status === 'approved') approvedTotal += Number(data.totalBudget || data.budgetAllocated || 0);
      grid.insertAdjacentHTML('beforeend', createProjectCard(data.id, data));
    });

    updateGlobalBudget(approvedTotal);
  }, (error) => {
    console.error('Projects listener error:', error);
    grid.innerHTML = `
      <div class="col-span-full py-12 text-center text-red-500">
        เกิดข้อผิดพลาดในการโหลดข้อมูล<br>
        <span class="text-xs text-red-400">${escapeHtml(error.code || error.message || String(error))}</span>
      </div>`;
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
    status: data.status || 'draft',
    managerComment: data.managerComment || data.approveNote || ''
  };
}

function createProjectCard(id, data) {
  const statusMap = {
    draft: { label: 'ร่าง', class: 'bg-slate-100 text-slate-700 dark:bg-slate-700/50 dark:text-slate-200 border-slate-200 dark:border-slate-700' },
    pending: { label: 'รอหัวหน้าอนุมัติ', class: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800/50' },
    revision_requested: { label: 'ให้แก้ไข', class: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 border-orange-200 dark:border-orange-800/50' },
    approved: { label: 'อนุมัติแล้ว', class: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50' },
    rejected: { label: 'ไม่อนุมัติ', class: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800/50' }
  };

  const statusInfo = statusMap[data.status] || statusMap.draft;
  const dateStr = data.createdAt?.toDate ? data.createdAt.toDate().toLocaleDateString('th-TH') : '';
  const isOwner = data.createdBy === currentUserUid;
  const commentHtml = data.managerComment
    ? `<div class="mt-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 p-3 text-xs text-amber-700 dark:text-amber-300"><b>คอมเมนต์หัวหน้า:</b> ${escapeHtml(data.managerComment)}</div>`
    : '';

  let actionButton = '';

  if (isOwner && ['draft', 'revision_requested'].includes(data.status)) {
    actionButton = `
      <div class="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/50 grid grid-cols-2 gap-2">
        <button onclick="window.openProjectEditModal('${id}')" class="py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-white text-sm font-medium rounded-lg transition-colors">แก้ไข</button>
        <button onclick="window.submitSavedProject('${id}')" class="py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors">ส่งโครงการ</button>
      </div>`;
  } else if (canApprove && ['pending', 'approved'].includes(data.status)) {
    actionButton = `
      <div class="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/50">
        <button onclick="window.openActionModal('${id}')" class="w-full py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-white text-sm font-medium rounded-lg transition-colors">${data.status === 'approved' ? 'แก้ไขงบประมาณ' : 'พิจารณาโครงการ'}</button>
      </div>`;
  }

  const autoDeleteText = data.status === 'rejected'
    ? `<div class="text-xs text-red-400 mt-1">จะลบอัตโนมัติหลังครบ ${REJECTED_AUTO_DELETE_DAYS} วัน หากไม่มีการเปลี่ยนสถานะ</div>`
    : '';

  return `
    <div class="border border-slate-200 dark:border-slate-700 rounded-xl p-5 bg-white dark:bg-slate-800 shadow-sm hover:shadow-md transition-shadow flex flex-col h-full">
      <div class="flex justify-between items-start mb-3"><span class="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold border ${statusInfo.class}">${statusInfo.label}</span><span class="text-xs text-slate-400">${dateStr}</span></div>
      <h4 class="text-base font-bold text-slate-800 dark:text-white mb-2 line-clamp-2">${escapeHtml(data.title)}</h4>
      <p class="text-sm text-slate-500 dark:text-slate-400 mb-4 line-clamp-3 flex-grow">${escapeHtml(data.description)}</p>
      <div class="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3 mt-auto space-y-2">
        <div><div class="text-xs text-slate-500 dark:text-slate-400 mb-1">งบประมาณที่ขอ</div><div class="text-lg font-bold text-brand-600 dark:text-sky-400">${formatNumber(data.requestedBudget)} <span class="text-xs font-normal">THB</span></div></div>
        <div><div class="text-xs text-slate-500 dark:text-slate-400 mb-1">งบประมาณที่อนุมัติ</div><div class="text-base font-bold text-emerald-600 dark:text-emerald-400">${formatNumber(data.totalBudget || data.budgetAllocated || 0)} <span class="text-xs font-normal">THB</span></div></div>
        <div class="text-xs text-slate-400 mt-1">ผู้เสนอ: ${escapeHtml(data.creatorName || 'Unknown')}</div>
        <div class="text-xs text-slate-400 mt-1">ระยะเวลา: ${escapeHtml(data.durationLabel || getProjectDurationText(data))}</div>
        ${autoDeleteText}
      </div>
      ${commentHtml}
      ${actionButton}
    </div>`;
}

window.submitSavedProject = async (id) => {
  const project = window.projectsMap.get(id);
  if (!project) return;
  try {
    await updateDoc(doc(db, PROJECTS_COLLECTION, id), {
      status: 'pending',
      submittedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      rejectedAt: null,
      autoDeleteAt: null
    });
  } catch (error) {
    alert(`ส่งโครงการไม่สำเร็จ: ${error.code || error.message || error}`);
  }
};

// ---------- auto cleanup ----------
function shouldAutoDeleteRejected(project) {
  if (project.status !== 'rejected') return false;

  const baseTime = getTime(project.rejectedAt) || getTime(project.updatedAt);
  if (!baseTime) return false;

  const ageMs = Date.now() - baseTime;
  const limitMs = REJECTED_AUTO_DELETE_DAYS * 24 * 60 * 60 * 1000;
  return ageMs >= limitMs;
}

// ---------- budget ----------
function updateGlobalBudget(spent) {
  lastApprovedBudgetTotal = Number(spent || 0);
  const remaining = totalBudgetLimit - lastApprovedBudgetTotal;
  const percent = totalBudgetLimit > 0 ? (lastApprovedBudgetTotal / totalBudgetLimit) * 100 : 0;

  const title = findBudgetTitle();
  if (title) {
    title.id = 'globalBudgetTitle';
    title.textContent = `ภาพรวมงบประมาณฝ่ายปีปัจจุบัน (${formatNumber(totalBudgetLimit)} THB)`;
  }

  setText('globalSpent', formatNumber(lastApprovedBudgetTotal));
  setText('globalRemaining', formatNumber(remaining));
  setText('budgetPercent', percent.toFixed(1));

  const bar = document.getElementById('budgetProgressBar');
  if (!bar) return;
  bar.style.width = `${Math.min(percent, 100)}%`;
  bar.className = 'bg-gradient-to-r from-brand-500 to-sky-400 h-3 rounded-full transition-all duration-1000';
  if (percent > 90) bar.className = 'bg-gradient-to-r from-red-500 to-orange-400 h-3 rounded-full transition-all duration-1000';
  else if (percent > 70) bar.className = 'bg-gradient-to-r from-amber-500 to-yellow-400 h-3 rounded-full transition-all duration-1000';
}

// ---------- helpers ----------
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function getTime(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.toDate === 'function') return ts.toDate().getTime();
  if (ts instanceof Date) return ts.getTime();
  return 0;
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
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateString || '-';
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

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value ?? '';
}

function formatNumber(value) {
  return new Intl.NumberFormat('th-TH').format(Number(value || 0));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}
