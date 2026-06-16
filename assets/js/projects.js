// assets/js/project-budget-editor-hotfix.js
// Standalone hotfix: ปุ่มแก้ไขงบประมาณรวมฝ่าย สำหรับ admin / manager / หัวหน้าฝ่าย
// ใช้ร่วมกับ projects.js เดิมได้ ไม่ต้องแก้ logic หลัก
// Version: budget-editor-hotfix-v4

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    doc,
    getDoc,
    setDoc,
    onSnapshot,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

console.log('project-budget-editor-hotfix.js loaded: budget-editor-hotfix-v4');

const DEFAULT_TOTAL_BUDGET = 1500000;
const SETTINGS_REF = doc(db, 'settings', 'budget');

let currentUser = null;
let currentUserUid = null;
let totalBudgetLimit = DEFAULT_TOTAL_BUDGET;
let unsubscribeBudget = null;

const APPROVER_ROLES = new Set([
    'admin',
    'administrator',
    'manager',
    'head',
    'department_head',
    'head_department',
    'section_head',
    'supervisor',
    'director',
    'หัวหน้าฝ่าย',
    'หัวหน้างาน',
    'ผู้ดูแลระบบ'
]);

document.addEventListener('DOMContentLoaded', initBudgetEditorHotfix);

function initBudgetEditorHotfix() {
    onAuthStateChanged(auth, async (user) => {
        if (!user) return;

        currentUserUid = user.uid;

        try {
            const userSnap = await getDoc(doc(db, 'users', user.uid));
            currentUser = userSnap.exists()
                ? { uid: user.uid, email: user.email, ...userSnap.data() }
                : { uid: user.uid, email: user.email, role: '' };
        } catch (error) {
            console.error('Budget editor user role error:', error);
            currentUser = { uid: user.uid, email: user.email, role: '' };
        }

        listenBudgetSetting();

        if (canEditBudget(currentUser)) {
            injectGlobalBudgetButton();
            ensureGlobalBudgetModal();
        } else {
            console.warn('Budget editor hidden because user role is:', currentUser?.role);
        }
    });
}

function canEditBudget(user) {
    const role = String(user?.role || '').trim();
    return APPROVER_ROLES.has(role);
}

function listenBudgetSetting() {
    if (typeof unsubscribeBudget === 'function') unsubscribeBudget();

    unsubscribeBudget = onSnapshot(SETTINGS_REF, (snap) => {
        if (snap.exists()) {
            totalBudgetLimit = Number(snap.data().totalBudget || DEFAULT_TOTAL_BUDGET);
        } else {
            totalBudgetLimit = DEFAULT_TOTAL_BUDGET;
        }
        updateBudgetOverviewText();
    }, (error) => {
        console.error('Budget setting listener error:', error);
        updateBudgetOverviewText();
    });
}

function injectGlobalBudgetButton() {
    if (document.getElementById('editGlobalBudgetBtn')) {
        document.getElementById('editGlobalBudgetBtn').classList.remove('hidden');
        return;
    }

    const titleEl = findBudgetTitleElement();
    if (!titleEl) {
        console.warn('Budget title element not found. Cannot inject edit button.');
        return;
    }

    titleEl.id = 'globalBudgetTitle';

    const row = document.createElement('div');
    row.className = 'relative z-10 flex justify-between items-start gap-4 flex-wrap mb-6';

    const parent = titleEl.parentElement;
    parent.insertBefore(row, titleEl);
    row.appendChild(titleEl);

    // ลบ margin เดิมถ้ามี เพื่อไม่ให้ช่องว่างเพี้ยน
    titleEl.classList.remove('mb-6');

    const button = document.createElement('button');
    button.id = 'editGlobalBudgetBtn';
    button.type = 'button';
    button.className = 'inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold border border-white/15 transition-colors';
    button.innerHTML = '<i class="ph ph-pencil-simple"></i><span>แก้งบรวม</span>';
    button.addEventListener('click', openGlobalBudgetModal);

    row.appendChild(button);
}

function findBudgetTitleElement() {
    const byId = document.getElementById('globalBudgetTitle');
    if (byId) return byId;

    const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,p,div'));
    return headings.find((el) => String(el.textContent || '').includes('ภาพรวมงบประมาณฝ่าย')) || null;
}

function ensureGlobalBudgetModal() {
    if (document.getElementById('globalBudgetModal')) return;

    const modal = document.createElement('div');
    modal.id = 'globalBudgetModal';
    modal.className = 'fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm z-[80] hidden flex items-center justify-center p-4 opacity-0 transition-opacity duration-300';
    modal.innerHTML = `
        <div id="globalBudgetModalContent" class="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-700 overflow-hidden transform scale-95 transition-transform duration-300">
            <div class="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
                <h3 class="text-lg font-bold text-slate-800 dark:text-white">แก้ไขงบประมาณรวมฝ่าย</h3>
                <button id="closeGlobalBudgetModalBtn" class="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
                    <i class="ph ph-x text-xl"></i>
                </button>
            </div>
            <div class="p-6 space-y-4">
                <div id="globalBudgetError" class="hidden bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm p-3 rounded-lg border border-red-100 dark:border-red-800/50"></div>
                <div>
                    <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">งบประมาณรวมฝ่ายปีปัจจุบัน (บาท)</label>
                    <input type="number" id="globalBudgetInput" min="0" step="1000" class="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white focus:ring-2 focus:ring-brand-500 outline-none">
                </div>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                    บันทึกที่ Firestore: <code>settings/budget.totalBudget</code>
                </p>
                <div class="pt-2 flex justify-end gap-3">
                    <button type="button" id="cancelGlobalBudgetBtn" class="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors">ยกเลิก</button>
                    <button type="button" id="saveGlobalBudgetBtn" class="px-5 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 dark:bg-sky-600 dark:hover:bg-sky-700 rounded-lg shadow-sm transition-colors flex items-center gap-2">
                        <span>บันทึกงบรวม</span>
                        <span id="saveGlobalBudgetSpinner" class="hidden inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

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
    if (!canEditBudget(currentUser)) {
        showBudgetError('บัญชีนี้ไม่มีสิทธิ์แก้ไขงบประมาณรวม');
        return;
    }

    const input = document.getElementById('globalBudgetInput');
    const spinner = document.getElementById('saveGlobalBudgetSpinner');
    const saveBtn = document.getElementById('saveGlobalBudgetBtn');
    const value = Number(input?.value || 0);

    if (!Number.isFinite(value) || value < 0) {
        showBudgetError('กรุณาระบุงบประมาณรวมให้ถูกต้อง');
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

        closeGlobalBudgetModal();
    } catch (error) {
        console.error('Save global budget error:', error);
        showBudgetError('บันทึกงบประมาณรวมไม่สำเร็จ กรุณาตรวจสอบ Firestore Rules ของ settings/budget');
    } finally {
        saveBtn.disabled = false;
        spinner?.classList.add('hidden');
    }
}

function showBudgetError(message) {
    const error = document.getElementById('globalBudgetError');
    if (!error) return;
    error.textContent = message;
    error.classList.remove('hidden');
}

function updateBudgetOverviewText() {
    const titleEl = findBudgetTitleElement();
    if (titleEl) {
        titleEl.id = 'globalBudgetTitle';
        titleEl.textContent = `ภาพรวมงบประมาณฝ่ายปีปัจจุบัน (${formatNumber(totalBudgetLimit)} THB)`;
    }

    const spent = parseThaiNumber(document.getElementById('globalSpent')?.textContent || '0');
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

function parseThaiNumber(text) {
    return Number(String(text || '0').replace(/[^0-9.-]/g, '')) || 0;
}

function formatNumber(value) {
    return new Intl.NumberFormat('th-TH').format(Number(value || 0));
}
