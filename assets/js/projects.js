// assets/js/budget-editor-force.js
// Force Budget Editor for Projects page
// แสดงปุ่ม "แก้งบรวม" ให้ Admin / Manager / หัวหน้าฝ่าย / ผู้ที่มี override approve_project=allow
// Version: budget-editor-force-v5

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    doc,
    getDoc,
    setDoc,
    onSnapshot,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

console.log('budget-editor-force.js loaded: budget-editor-force-v5');

const DEFAULT_TOTAL_BUDGET = 1500000;
const SETTINGS_REF = doc(db, 'settings', 'budget');

let currentUser = null;
let currentUserUid = null;
let totalBudgetLimit = DEFAULT_TOTAL_BUDGET;
let canEdit = false;

const ALLOWED_ROLES = new Set([
    'admin',
    'manager',
    'administrator',
    'head',
    'department_head',
    'head_department',
    'section_head',
    'supervisor',
    'director',
    'ผู้ดูแลระบบ',
    'หัวหน้าฝ่าย',
    'หัวหน้างาน'
]);

// รันหลายจังหวะ เผื่อ DOM หรือ header โหลดช้า
window.addEventListener('load', bootBudgetEditor);
document.addEventListener('DOMContentLoaded', bootBudgetEditor);
setTimeout(bootBudgetEditor, 800);
setTimeout(bootBudgetEditor, 1800);

function bootBudgetEditor() {
    onAuthStateChanged(auth, async (user) => {
        if (!user) return;
        currentUserUid = user.uid;

        currentUser = await loadUser(user);
        canEdit = await canEditBudget(user.uid, currentUser);

        listenBudget();

        if (canEdit) {
            forceAddBudgetButton();
            ensureBudgetModal();
        } else {
            console.warn('[budget-editor-force] hidden. role =', currentUser?.role, 'override approve_project not allow');
        }
    });
}

async function loadUser(user) {
    try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        return snap.exists() ? { uid: user.uid, email: user.email, ...snap.data() } : { uid: user.uid, email: user.email, role: '' };
    } catch (error) {
        console.error('[budget-editor-force] load user error:', error);
        return { uid: user.uid, email: user.email, role: '' };
    }
}

async function canEditBudget(uid, userData) {
    const role = String(userData?.role || '').trim();
    if (ALLOWED_ROLES.has(role)) return true;

    // รองรับระบบ override จาก admin.js เดิม: user_overrides/{uid}.overrides.approve_project = allow
    try {
        const overrideSnap = await getDoc(doc(db, 'user_overrides', uid));
        const override = overrideSnap.exists() ? overrideSnap.data()?.overrides?.approve_project : null;
        if (override === 'allow') return true;
        if (override === 'deny') return false;
    } catch (error) {
        console.warn('[budget-editor-force] override check failed:', error);
    }

    // fallback จากข้อความ role ที่แสดงบน sidebar เช่น ผู้ดูแลระบบ / หัวหน้างาน
    const visibleRole = String(document.getElementById('userRole')?.textContent || '').trim();
    if (ALLOWED_ROLES.has(visibleRole)) return true;

    return false;
}

function listenBudget() {
    onSnapshot(SETTINGS_REF, (snap) => {
        totalBudgetLimit = snap.exists() ? Number(snap.data().totalBudget || DEFAULT_TOTAL_BUDGET) : DEFAULT_TOTAL_BUDGET;
        updateBudgetText();
    }, (error) => {
        console.error('[budget-editor-force] settings listener error:', error);
        updateBudgetText();
    });
}

function forceAddBudgetButton() {
    if (document.getElementById('forceEditBudgetBtn')) return;

    const titleEl = findBudgetTitle();
    if (!titleEl) {
        console.warn('[budget-editor-force] budget title not found');
        return;
    }

    titleEl.id = 'globalBudgetTitle';

    let row = titleEl.closest('#budgetTitleRow');
    if (!row) {
        row = document.createElement('div');
        row.id = 'budgetTitleRow';
        row.className = 'relative z-10 flex justify-between items-start gap-4 flex-wrap mb-6';
        const parent = titleEl.parentElement;
        parent.insertBefore(row, titleEl);
        row.appendChild(titleEl);
        titleEl.classList.remove('mb-6');
    }

    const btn = document.createElement('button');
    btn.id = 'forceEditBudgetBtn';
    btn.type = 'button';
    btn.className = 'inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-sm transition-colors';
    btn.innerHTML = '<i class="ph ph-pencil-simple"></i><span>แก้งบรวม</span>';
    btn.addEventListener('click', openBudgetModal);
    row.appendChild(btn);
}

function findBudgetTitle() {
    const byId = document.getElementById('globalBudgetTitle');
    if (byId) return byId;

    return Array.from(document.querySelectorAll('h1,h2,h3,h4,p,div'))
        .find(el => String(el.textContent || '').includes('ภาพรวมงบประมาณฝ่าย')) || null;
}

function ensureBudgetModal() {
    if (document.getElementById('forceBudgetModal')) return;

    const modal = document.createElement('div');
    modal.id = 'forceBudgetModal';
    modal.className = 'fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm z-[90] hidden flex items-center justify-center p-4 opacity-0 transition-opacity duration-300';
    modal.innerHTML = `
        <div id="forceBudgetModalContent" class="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-700 overflow-hidden transform scale-95 transition-transform duration-300">
            <div class="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
                <h3 class="text-lg font-bold text-slate-800 dark:text-white">แก้ไขงบประมาณรวมฝ่าย</h3>
                <button id="forceCloseBudgetBtn" class="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
                    <i class="ph ph-x text-xl"></i>
                </button>
            </div>
            <div class="p-6 space-y-4">
                <div id="forceBudgetError" class="hidden bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm p-3 rounded-lg border border-red-100 dark:border-red-800/50"></div>
                <div>
                    <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">งบประมาณรวมฝ่ายปีปัจจุบัน (บาท)</label>
                    <input type="number" id="forceBudgetInput" min="0" step="1000" class="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white focus:ring-2 focus:ring-brand-500 outline-none">
                </div>
                <p class="text-xs text-slate-500 dark:text-slate-400">บันทึกที่ Firestore: <code>settings/budget.totalBudget</code></p>
                <div class="pt-2 flex justify-end gap-3">
                    <button type="button" id="forceCancelBudgetBtn" class="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors">ยกเลิก</button>
                    <button type="button" id="forceSaveBudgetBtn" class="px-5 py-2 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-lg shadow-sm transition-colors flex items-center gap-2">
                        <span>บันทึกงบรวม</span>
                        <span id="forceSaveBudgetSpinner" class="hidden inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    document.getElementById('forceCloseBudgetBtn')?.addEventListener('click', closeBudgetModal);
    document.getElementById('forceCancelBudgetBtn')?.addEventListener('click', closeBudgetModal);
    document.getElementById('forceSaveBudgetBtn')?.addEventListener('click', saveBudget);
}

function openBudgetModal() {
    ensureBudgetModal();
    const modal = document.getElementById('forceBudgetModal');
    const content = document.getElementById('forceBudgetModalContent');
    const input = document.getElementById('forceBudgetInput');
    const error = document.getElementById('forceBudgetError');

    if (input) input.value = Number(totalBudgetLimit || DEFAULT_TOTAL_BUDGET);
    error?.classList.add('hidden');

    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        content.classList.remove('scale-95');
    }, 10);
}

function closeBudgetModal() {
    const modal = document.getElementById('forceBudgetModal');
    const content = document.getElementById('forceBudgetModalContent');
    if (!modal || !content) return;
    modal.classList.add('opacity-0');
    content.classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 250);
}

async function saveBudget() {
    if (!canEdit) {
        showError('บัญชีนี้ไม่มีสิทธิ์แก้ไขงบประมาณรวม');
        return;
    }

    const input = document.getElementById('forceBudgetInput');
    const saveBtn = document.getElementById('forceSaveBudgetBtn');
    const spinner = document.getElementById('forceSaveBudgetSpinner');
    const value = Number(input?.value || 0);

    if (!Number.isFinite(value) || value < 0) {
        showError('กรุณาระบุงบประมาณรวมให้ถูกต้อง');
        return;
    }

    try {
        saveBtn.disabled = true;
        spinner?.classList.remove('hidden');

        await setDoc(SETTINGS_REF, {
            totalBudget: value,
            updatedBy: currentUserUid,
            updatedByName: currentUser?.name || currentUser?.email || 'Unknown',
            updatedAt: serverTimestamp()
        }, { merge: true });

        closeBudgetModal();
    } catch (error) {
        console.error('[budget-editor-force] save error:', error);
        showError('บันทึกไม่สำเร็จ กรุณาตรวจสอบ Firestore Rules ของ settings/budget');
    } finally {
        saveBtn.disabled = false;
        spinner?.classList.add('hidden');
    }
}

function showError(message) {
    const error = document.getElementById('forceBudgetError');
    if (!error) return;
    error.textContent = message;
    error.classList.remove('hidden');
}

function updateBudgetText() {
    const title = findBudgetTitle();
    if (title) {
        title.id = 'globalBudgetTitle';
        title.textContent = `ภาพรวมงบประมาณฝ่ายปีปัจจุบัน (${formatNumber(totalBudgetLimit)} THB)`;
    }

    const spent = parseNumber(document.getElementById('globalSpent')?.textContent || '0');
    const remaining = totalBudgetLimit - spent;
    const percent = totalBudgetLimit > 0 ? (spent / totalBudgetLimit) * 100 : 0;

    setText('globalRemaining', formatNumber(remaining));
    setText('budgetPercent', percent.toFixed(1));

    const bar = document.getElementById('budgetProgressBar');
    if (bar) bar.style.width = `${Math.min(percent, 100)}%`;
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function parseNumber(value) {
    return Number(String(value || '0').replace(/[^0-9.-]/g, '')) || 0;
}

function formatNumber(value) {
    return new Intl.NumberFormat('th-TH').format(Number(value || 0));
}
