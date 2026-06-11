// assets/js/admin.js
// หน้า: จัดการผู้ใช้งานและสิทธิ์
// เวอร์ชันแก้ไข: ไม่เด้งกลับหน้า login อัตโนมัติเมื่อ Auth ยังคืนค่าไม่ทัน/สถานะหลุดชั่วคราว

import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import { auth, db, firebaseConfig } from "./firebase-config.js";

const DEFAULT_PASSWORD = "password";
const USERS_COLLECTION = "users";

const ROLE_LABELS = {
  staff: "พนักงานทั่วไป",
  secretary: "เลขาฯ",
  manager: "หัวหน้างาน",
  admin: "ผู้ดูแลระบบ"
};

const els = {
  appBody: document.getElementById("appBody"),
  adminMenu: document.getElementById("adminMenu"),
  userName: document.getElementById("userName"),
  userRole: document.getElementById("userRole"),
  logoutBtn: document.getElementById("logoutBtn"),
  addUserBtn: document.getElementById("addUserBtn"),
  refreshBtn: document.getElementById("refreshBtn"),
  searchInput: document.getElementById("searchInput"),
  tableBody: document.getElementById("userTableBody"),
  pageAlert: document.getElementById("pageAlert"),
  modal: document.getElementById("userModal"),
  modalContent: document.getElementById("userModalContent"),
  modalTitle: document.getElementById("modalTitle"),
  closeModalBtn: document.getElementById("closeModalBtn"),
  cancelModalBtn: document.getElementById("cancelModalBtn"),
  form: document.getElementById("userForm"),
  modalError: document.getElementById("modalError"),
  userId: document.getElementById("userId"),
  userEmail: document.getElementById("userEmail"),
  emailHelpText: document.getElementById("emailHelpText"),
  userNameInput: document.getElementById("userNameInput"),
  roleSelect: document.getElementById("userRoleSelect"),
  annualLeave: document.getElementById("userAnnualLeave"),
  sickLeave: document.getElementById("userSickLeave"),
  overrideApproveLeave: document.getElementById("overrideApproveLeave"),
  overrideApproveProject: document.getElementById("overrideApproveProject"),
  saveBtn: document.getElementById("saveUserBtn"),
  saveSpinner: document.getElementById("saveSpinner"),
  themeToggleBtn: document.getElementById("themeToggleBtn"),
  mobileMenuBtn: document.getElementById("mobileMenuBtn"),
  closeSidebarBtn: document.getElementById("closeSidebarBtn"),
  sidebar: document.getElementById("sidebar"),
  mobileOverlay: document.getElementById("mobileOverlay")
};

let currentUser = null;
let currentProfile = null;
let usersCache = [];
let authFirstCheckDone = false;

function showBody() {
  els.appBody?.classList.remove("hidden");
}

function showAlert(message, type = "info") {
  if (!els.pageAlert) return;
  const styles = {
    info: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-800",
    success: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800",
    error: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800",
    warning: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800"
  };
  els.pageAlert.className = `mb-4 rounded-xl border px-4 py-3 text-sm ${styles[type] || styles.info}`;
  els.pageAlert.textContent = message;
  els.pageAlert.classList.remove("hidden");
  if (type === "success" || type === "info") {
    setTimeout(() => els.pageAlert?.classList.add("hidden"), 4200);
  }
}

function hideAlert() {
  els.pageAlert?.classList.add("hidden");
}

function showModalError(message) {
  els.modalError.textContent = message;
  els.modalError.classList.remove("hidden");
}

function hideModalError() {
  els.modalError.textContent = "";
  els.modalError.classList.add("hidden");
}

function setSaving(isSaving) {
  els.saveBtn.disabled = isSaving;
  els.saveBtn.classList.toggle("opacity-70", isSaving);
  els.saveSpinner.classList.toggle("hidden", !isSaving);
}

function safeText(value, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function permissionBadge(value) {
  const map = {
    allow: "<span class='inline-flex px-2 py-1 rounded-full text-xs bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'>Allow</span>",
    deny: "<span class='inline-flex px-2 py-1 rounded-full text-xs bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'>Deny</span>",
    inherit: "<span class='inline-flex px-2 py-1 rounded-full text-xs bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'>ตาม Role</span>"
  };
  return map[value || "inherit"] || map.inherit;
}

function roleBadge(role) {
  const color = {
    admin: "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
    manager: "bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
    secretary: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    staff: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300"
  }[role] || "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300";
  return `<span class="inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${color}">${ROLE_LABELS[role] || role || "-"}</span>`;
}

function renderLoading(message = "กำลังดึงข้อมูล...") {
  els.tableBody.innerHTML = `
    <tr>
      <td colspan="5" class="py-10 text-center text-slate-400">
        <div class="inline-block animate-spin rounded-full h-6 w-6 border-2 border-slate-300 dark:border-slate-600 border-t-sky-500 mb-2"></div>
        <p>${message}</p>
      </td>
    </tr>`;
}

function renderEmpty(message = "ยังไม่มีข้อมูลผู้ใช้งาน") {
  els.tableBody.innerHTML = `
    <tr>
      <td colspan="5" class="py-10 text-center text-slate-400">
        <i class="ph ph-users-three text-3xl block mb-2"></i>
        ${message}
      </td>
    </tr>`;
}

function renderLoginRequired() {
  els.userName.textContent = "ยังไม่ได้เข้าสู่ระบบ";
  els.userRole.textContent = "กรุณาเข้าสู่ระบบ";
  els.addUserBtn?.classList.add("hidden");
  els.refreshBtn?.classList.add("hidden");
  els.searchInput?.classList.add("hidden");

  els.tableBody.innerHTML = `
    <tr>
      <td colspan="5" class="py-12 px-4 text-center">
        <div class="max-w-md mx-auto rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 p-6">
          <i class="ph ph-warning-circle text-4xl text-amber-600 dark:text-amber-300 block mb-3"></i>
          <div class="text-base font-bold text-amber-800 dark:text-amber-200 mb-2">ยังไม่พบสถานะการเข้าสู่ระบบ</div>
          <div class="text-sm text-amber-700 dark:text-amber-300 mb-4">
            ระบบจะไม่เด้งกลับหน้า Login อัตโนมัติแล้ว เพื่อป้องกันอาการกด Back แล้วกลับมาหน้า Admin
          </div>
          <a href="index.html" class="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium">
            <i class="ph ph-sign-in"></i> ไปหน้าเข้าสู่ระบบ
          </a>
        </div>
      </td>
    </tr>`;
}

function renderUsers(users = usersCache) {
  els.addUserBtn?.classList.remove("hidden");
  els.refreshBtn?.classList.remove("hidden");
  els.searchInput?.classList.remove("hidden");

  const keyword = els.searchInput?.value?.trim().toLowerCase() || "";
  const filtered = users.filter((u) => {
    if (!keyword) return true;
    return [u.name, u.email, u.role].some((v) => String(v || "").toLowerCase().includes(keyword));
  });

  if (!filtered.length) {
    renderEmpty(keyword ? "ไม่พบข้อมูลที่ค้นหา" : "ยังไม่มีข้อมูลผู้ใช้งาน");
    return;
  }

  els.tableBody.innerHTML = filtered.map((u) => {
    const annual = Number(u.leaveQuota?.annual ?? u.annualLeave ?? 10);
    const sick = Number(u.leaveQuota?.sick ?? u.sickLeave ?? 30);
    const approveLeave = u.permissions?.approveLeave ?? "inherit";
    const approveProject = u.permissions?.approveProject ?? "inherit";

    return `
      <tr class="border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50/70 dark:hover:bg-slate-700/30 transition-colors">
        <td class="py-4 px-4">
          <div class="font-semibold text-slate-800 dark:text-white">${escapeHtml(safeText(u.name, "ไม่ระบุชื่อ"))}</div>
          <div class="text-xs text-slate-500 mt-0.5">${escapeHtml(safeText(u.email))}</div>
        </td>
        <td class="py-4 px-4">${roleBadge(u.role)}</td>
        <td class="py-4 px-4 text-center">
          <span class="font-medium">${annual}</span><span class="text-slate-400"> / </span><span class="font-medium">${sick}</span>
        </td>
        <td class="py-4 px-4 text-center">
          <div class="flex flex-col items-center gap-1">
            <div class="text-[11px] text-slate-400">ลา ${permissionBadge(approveLeave)}</div>
            <div class="text-[11px] text-slate-400">โครงการ ${permissionBadge(approveProject)}</div>
          </div>
        </td>
        <td class="py-4 px-4 text-right">
          <div class="inline-flex items-center gap-2">
            <button class="edit-user-btn px-3 py-1.5 text-xs rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200" data-id="${u.id}">แก้ไข</button>
            <button class="reset-password-btn px-3 py-1.5 text-xs rounded-lg bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-300" data-id="${u.id}">รีเซ็ตรหัส</button>
            <button class="delete-user-btn px-3 py-1.5 text-xs rounded-lg bg-red-50 hover:bg-red-100 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300" data-id="${u.id}">ลบ</button>
          </div>
        </td>
      </tr>`;
  }).join("");
}

async function loadCurrentProfile(user) {
  const ref = doc(db, USERS_COLLECTION, user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    return { id: user.uid, email: user.email, name: user.displayName || user.email, role: "staff" };
  }
  return { id: snap.id, ...snap.data() };
}

async function loadUsers() {
  renderLoading();
  hideAlert();
  try {
    let snap;
    try {
      const q = query(collection(db, USERS_COLLECTION), orderBy("name", "asc"));
      snap = await getDocs(q);
    } catch (orderError) {
      console.warn("orderBy fallback:", orderError);
      snap = await getDocs(collection(db, USERS_COLLECTION));
    }
    usersCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    usersCache.sort((a, b) => safeText(a.name, a.email).localeCompare(safeText(b.name, b.email), "th"));
    renderUsers();
  } catch (error) {
    console.error("loadUsers error:", error);
    renderEmpty("ดึงข้อมูลผู้ใช้ไม่สำเร็จ");
    showAlert(`ดึงข้อมูลผู้ใช้ไม่สำเร็จ: ${error.message || error}`, "error");
  }
}

function openModal(mode = "add", user = null) {
  hideModalError();
  els.form.reset();
  els.userId.value = "";
  els.annualLeave.value = 10;
  els.sickLeave.value = 30;
  els.overrideApproveLeave.value = "inherit";
  els.overrideApproveProject.value = "inherit";

  if (mode === "edit" && user) {
    els.modalTitle.textContent = "แก้ไขข้อมูลผู้ใช้งาน";
    els.userId.value = user.id;
    els.userEmail.value = user.email || "";
    els.userEmail.disabled = true;
    els.emailHelpText.textContent = "ไม่สามารถแก้ไขอีเมลจากหน้านี้ได้";
    els.userNameInput.value = user.name || "";
    els.roleSelect.value = user.role || "staff";
    els.annualLeave.value = user.leaveQuota?.annual ?? user.annualLeave ?? 10;
    els.sickLeave.value = user.leaveQuota?.sick ?? user.sickLeave ?? 30;
    els.overrideApproveLeave.value = user.permissions?.approveLeave ?? "inherit";
    els.overrideApproveProject.value = user.permissions?.approveProject ?? "inherit";
  } else {
    els.modalTitle.textContent = "เพิ่มผู้ใช้งานใหม่";
    els.userEmail.disabled = false;
    els.emailHelpText.textContent = "อีเมลนี้จะใช้สำหรับเข้าสู่ระบบ (รหัสผ่านเริ่มต้นคือ password)";
  }

  els.modal.classList.remove("hidden");
  requestAnimationFrame(() => {
    els.modal.classList.remove("opacity-0");
    els.modalContent.classList.remove("scale-95");
  });
}

function closeModal() {
  els.modal.classList.add("opacity-0");
  els.modalContent.classList.add("scale-95");
  setTimeout(() => els.modal.classList.add("hidden"), 180);
}

function collectFormData() {
  return {
    email: els.userEmail.value.trim().toLowerCase(),
    name: els.userNameInput.value.trim(),
    role: els.roleSelect.value,
    leaveQuota: {
      annual: Number(els.annualLeave.value || 0),
      sick: Number(els.sickLeave.value || 0)
    },
    permissions: {
      approveLeave: els.overrideApproveLeave.value,
      approveProject: els.overrideApproveProject.value
    }
  };
}

function validateUserData(data) {
  if (!data.email) return "กรุณากรอกอีเมล";
  if (!data.name) return "กรุณากรอกชื่อ-นามสกุล";
  if (!data.role) return "กรุณาเลือกบทบาท";
  if (data.leaveQuota.annual < 0 || data.leaveQuota.sick < 0) return "โควตาวันลาต้องไม่ติดลบ";
  return "";
}

async function createAuthUserWithSecondaryApp(email) {
  const secondaryApp = initializeApp(firebaseConfig, `secondary-${Date.now()}`);
  const secondaryAuth = getAuth(secondaryApp);
  try {
    await setPersistence(secondaryAuth, browserLocalPersistence);
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, DEFAULT_PASSWORD);
    return cred.user.uid;
  } finally {
    await deleteApp(secondaryApp).catch(() => {});
  }
}

async function handleSaveUser(event) {
  event.preventDefault();
  hideModalError();
  setSaving(true);
  try {
    const id = els.userId.value.trim();
    const data = collectFormData();
    const validationError = validateUserData(data);
    if (validationError) throw new Error(validationError);

    if (id) {
      await updateDoc(doc(db, USERS_COLLECTION, id), {
        name: data.name,
        role: data.role,
        leaveQuota: data.leaveQuota,
        permissions: data.permissions,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser?.uid || null
      });
      showAlert("บันทึกการแก้ไขผู้ใช้งานเรียบร้อย", "success");
    } else {
      const uid = await createAuthUserWithSecondaryApp(data.email);
      await setDoc(doc(db, USERS_COLLECTION, uid), {
        email: data.email,
        name: data.name,
        role: data.role,
        leaveQuota: data.leaveQuota,
        permissions: data.permissions,
        status: "active",
        createdAt: serverTimestamp(),
        createdBy: currentUser?.uid || null,
        mustChangePassword: true
      });
      showAlert(`เพิ่มผู้ใช้งานเรียบร้อย รหัสผ่านเริ่มต้นคือ ${DEFAULT_PASSWORD}`, "success");
    }
    closeModal();
    await loadUsers();
  } catch (error) {
    console.error("save user error:", error);
    showModalError(error.message || "บันทึกข้อมูลไม่สำเร็จ");
  } finally {
    setSaving(false);
  }
}

function findUserById(id) {
  return usersCache.find((u) => u.id === id);
}

async function handleTableClick(event) {
  const editBtn = event.target.closest(".edit-user-btn");
  const deleteBtn = event.target.closest(".delete-user-btn");
  const resetBtn = event.target.closest(".reset-password-btn");

  if (editBtn) {
    const user = findUserById(editBtn.dataset.id);
    if (user) openModal("edit", user);
    return;
  }

  if (resetBtn) {
    const user = findUserById(resetBtn.dataset.id);
    if (!user?.email) return showAlert("ไม่พบอีเมลของผู้ใช้งานนี้", "error");
    try {
      await sendPasswordResetEmail(auth, user.email);
      showAlert(`ส่งลิงก์รีเซ็ตรหัสผ่านไปที่ ${user.email} แล้ว`, "success");
    } catch (error) {
      console.error("reset password error:", error);
      showAlert(`ส่งลิงก์รีเซ็ตรหัสผ่านไม่สำเร็จ: ${error.message || error}`, "error");
    }
    return;
  }

  if (deleteBtn) {
    const user = findUserById(deleteBtn.dataset.id);
    if (!user) return;
    if (user.id === currentUser?.uid) {
      showAlert("ไม่สามารถลบบัญชีที่กำลังใช้งานอยู่ได้", "warning");
      return;
    }
    const ok = confirm(`ต้องการลบข้อมูลผู้ใช้ "${user.name || user.email}" หรือไม่?\n\nหมายเหตุ: การลบนี้จะลบเฉพาะข้อมูลใน Firestore ไม่ได้ลบบัญชี Authentication`);
    if (!ok) return;
    try {
      await deleteDoc(doc(db, USERS_COLLECTION, user.id));
      showAlert("ลบข้อมูลผู้ใช้งานเรียบร้อย", "success");
      await loadUsers();
    } catch (error) {
      console.error("delete user error:", error);
      showAlert(`ลบข้อมูลไม่สำเร็จ: ${error.message || error}`, "error");
    }
  }
}

function setupTheme() {
  els.themeToggleBtn?.addEventListener("click", () => {
    const root = document.documentElement;
    root.classList.toggle("dark");
    localStorage.setItem("color-theme", root.classList.contains("dark") ? "dark" : "light");
  });
}

function setupMobileSidebar() {
  const open = () => {
    els.sidebar?.classList.remove("-translate-x-full");
    els.mobileOverlay?.classList.remove("hidden");
    requestAnimationFrame(() => els.mobileOverlay?.classList.remove("opacity-0"));
  };
  const close = () => {
    els.sidebar?.classList.add("-translate-x-full");
    els.mobileOverlay?.classList.add("opacity-0");
    setTimeout(() => els.mobileOverlay?.classList.add("hidden"), 200);
  };
  els.mobileMenuBtn?.addEventListener("click", open);
  els.closeSidebarBtn?.addEventListener("click", close);
  els.mobileOverlay?.addEventListener("click", close);
}

function setupEvents() {
  els.logoutBtn?.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "index.html";
  });
  els.addUserBtn?.addEventListener("click", () => openModal("add"));
  els.closeModalBtn?.addEventListener("click", closeModal);
  els.cancelModalBtn?.addEventListener("click", closeModal);
  els.modal?.addEventListener("click", (e) => { if (e.target === els.modal) closeModal(); });
  els.form?.addEventListener("submit", handleSaveUser);
  els.tableBody?.addEventListener("click", handleTableClick);
  els.refreshBtn?.addEventListener("click", loadUsers);
  els.searchInput?.addEventListener("input", () => renderUsers());
  setupTheme();
  setupMobileSidebar();
}

function updateCurrentUserUI(profile, user) {
  els.userName.textContent = profile.name || user.displayName || user.email || "ผู้ใช้งาน";
  els.userRole.textContent = ROLE_LABELS[profile.role] || profile.role || "ไม่ระบุบทบาท";
  if (profile.role === "admin") els.adminMenu?.classList.remove("hidden");
}

async function handleSignedInUser(user) {
  currentUser = user;
  currentProfile = await loadCurrentProfile(user);
  updateCurrentUserUI(currentProfile, user);

  if (currentProfile.role !== "admin") {
    els.addUserBtn?.classList.add("hidden");
    renderEmpty("บัญชีนี้ไม่มีสิทธิ์ผู้ดูแลระบบสำหรับเข้าหน้านี้");
    showAlert("บัญชีนี้ไม่มีสิทธิ์ผู้ดูแลระบบ", "warning");
    return;
  }

  await loadUsers();
}

async function bootstrap() {
  setupEvents();
  showBody();
  renderLoading("กำลังตรวจสอบสถานะเข้าสู่ระบบ...");

  try {
    // ตั้งค่าให้ Auth จำสถานะไว้ใน browser local storage
    // จุดนี้ช่วยลดอาการเปลี่ยนหน้าแล้วหลุดกลับ login
    await setPersistence(auth, browserLocalPersistence);
  } catch (error) {
    console.warn("setPersistence warning:", error);
  }

  onAuthStateChanged(auth, async (user) => {
    showBody();
    authFirstCheckDone = true;

    try {
      if (!user) {
        // เวอร์ชันเดิมใช้ window.location.href = "index.html" ทันที
        // ทำให้เกิดอาการกดเมนู Admin แล้วเด้งไป Login แล้วต้องกด Back
        // เวอร์ชันนี้จะไม่ redirect อัตโนมัติ แต่แสดงปุ่มไป Login แทน
        renderLoginRequired();
        showAlert("ยังไม่พบ session การเข้าสู่ระบบ หากเพิ่ง Login ให้ตรวจหน้า login ว่าตั้งค่า browserLocalPersistence แล้ว", "warning");
        return;
      }

      await handleSignedInUser(user);
    } catch (error) {
      console.error("bootstrap auth state error:", error);
      renderEmpty("โหลดข้อมูลเริ่มต้นไม่สำเร็จ");
      showAlert(`โหลดข้อมูลเริ่มต้นไม่สำเร็จ: ${error.message || error}`, "error");
    }
  });

  // กันกรณี onAuthStateChanged ไม่ callback จากปัญหา network/CDN
  setTimeout(() => {
    if (!authFirstCheckDone) {
      renderLoginRequired();
      showAlert("ตรวจสอบสถานะ Login ไม่สำเร็จ กรุณาเช็ก Console หรือ CDN Firebase", "error");
    }
  }, 5000);
}

bootstrap();
