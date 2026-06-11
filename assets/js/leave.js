// assets/js/leave.js
import { db, auth } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, getDocs, doc, getDoc, addDoc, updateDoc, query, where, orderBy, Timestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Shared UI Logic
const setupSharedUI = () => {
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

    const toggleMenu = () => {
        sidebar.classList.toggle('-translate-x-full');
        mobileOverlay.classList.toggle('hidden');
        setTimeout(() => mobileOverlay.classList.toggle('opacity-0'), 10);
    };

    if(mobileMenuBtn) mobileMenuBtn.addEventListener('click', toggleMenu);
    if(closeSidebarBtn) closeSidebarBtn.addEventListener('click', toggleMenu);
    if(mobileOverlay) mobileOverlay.addEventListener('click', toggleMenu);
};

document.addEventListener('DOMContentLoaded', () => {
    setupSharedUI();

    const mockUserStr = localStorage.getItem('mockUser');
    let currentUser = null;
    let currentUserUid = null;
    let canApprove = false;

    if (mockUserStr) {
        currentUser = JSON.parse(mockUserStr);
        currentUserUid = "mock-uid";
        initLeaveSystem(currentUser);
    } else {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    const userDoc = await getDoc(doc(db, "users", user.uid));
                    if (userDoc.exists()) {
                        currentUser = userDoc.data();
                        currentUserUid = user.uid;
                        await initLeaveSystem(currentUser, user.uid);
                    } else {
                        window.location.href = 'login.html';
                    }
                } catch(e) {
                    console.error("Auth Error:", e);
                    window.location.href = 'login.html';
                }
            } else {
                window.location.href = 'login.html';
            }
        });
    }

    async function checkPermission(user, uid, action) {
        if(mockUserStr) {
            if(action === 'approve_leave') return ['admin', 'manager'].includes(user.role);
            return true;
        }
        
        try {
            const overrideDoc = await getDoc(doc(db, "user_overrides", uid));
            if(overrideDoc.exists() && overrideDoc.data().overrides && overrideDoc.data().overrides[action]) {
                const override = overrideDoc.data().overrides[action];
                if(override === 'deny') return false;
                if(override === 'allow') return true;
            }
            
            // Fallback to Role
            const roleDefaults = {
                'admin': ['approve_leave', 'manage_users', 'create_project', 'approve_project'],
                'manager': ['approve_leave', 'create_project'],
                'secretary': ['create_project'],
                'staff': ['create_project']
            };
            return (roleDefaults[user.role] || []).includes(action);

        } catch (e) {
            console.error("Permission check error", e);
            return false;
        }
    }

    async function initLeaveSystem(user, uid) {
        document.getElementById('appBody').classList.remove('hidden');
        document.getElementById('userName').textContent = user.name;
        
        const roleDisplay = { 'admin': 'ผู้ดูแลระบบ', 'manager': 'หัวหน้างาน', 'secretary': 'เลขาฯ', 'staff': 'พนักงานทั่วไป' };
        document.getElementById('userRole').textContent = roleDisplay[user.role] || user.role;

        if (user.role === 'admin') {
            document.getElementById('adminMenu').classList.remove('hidden');
        }

        document.getElementById('logoutBtn').addEventListener('click', () => {
            if(mockUserStr) {
                localStorage.removeItem('mockUser');
                window.location.href = 'login.html';
            } else {
                signOut(auth).then(() => window.location.href = 'login.html');
            }
        });

        // Setup Quota Display
        document.getElementById('quotaAnnual').textContent = user.leave_quota?.annual ?? 10;
        document.getElementById('quotaSick').textContent = user.leave_quota?.sick ?? 30;

        // Check if user can approve leaves
        canApprove = await checkPermission(user, uid, 'approve_leave');
        
        if (canApprove) {
            document.getElementById('tabApprovals').classList.remove('hidden');
            loadPendingApprovals();
        }

        setupTabs();
        setupLeaveModal();
        loadMyLeaves(uid);
    }

    function setupTabs() {
        const tabMyLeaves = document.getElementById('tabMyLeaves');
        const tabApprovals = document.getElementById('tabApprovals');
        const viewMyLeaves = document.getElementById('viewMyLeaves');
        const viewApprovals = document.getElementById('viewApprovals');

        const activeClass = ['text-brand-600', 'dark:text-sky-400', 'border-brand-600', 'dark:border-sky-400'];
        const inactiveClass = ['text-slate-500', 'dark:text-slate-400', 'border-transparent', 'hover:text-slate-800', 'dark:hover:text-white'];

        tabMyLeaves.addEventListener('click', () => {
            viewMyLeaves.classList.remove('hidden');
            viewApprovals.classList.add('hidden');
            tabMyLeaves.classList.add(...activeClass);
            tabMyLeaves.classList.remove(...inactiveClass);
            tabApprovals.classList.add(...inactiveClass);
            tabApprovals.classList.remove(...activeClass);
        });

        tabApprovals.addEventListener('click', () => {
            viewMyLeaves.classList.add('hidden');
            viewApprovals.classList.remove('hidden');
            tabApprovals.classList.add(...activeClass);
            tabApprovals.classList.remove(...inactiveClass);
            tabMyLeaves.classList.add(...inactiveClass);
            tabMyLeaves.classList.remove(...activeClass);
        });
    }

    function setupLeaveModal() {
        const leaveModal = document.getElementById('leaveModal');
        const leaveModalContent = document.getElementById('leaveModalContent');
        const leaveForm = document.getElementById('leaveForm');

        function toggleModal(show) {
            if (show) {
                leaveModal.classList.remove('hidden');
                setTimeout(() => {
                    leaveModal.classList.remove('opacity-0');
                    leaveModalContent.classList.remove('scale-95');
                }, 10);
            } else {
                leaveModal.classList.add('opacity-0');
                leaveModalContent.classList.add('scale-95');
                setTimeout(() => leaveModal.classList.add('hidden'), 300);
                leaveForm.reset();
                document.getElementById('leaveModalError').classList.add('hidden');
            }
        }

        document.getElementById('requestLeaveBtn').addEventListener('click', () => toggleModal(true));
        document.getElementById('closeLeaveModalBtn').addEventListener('click', () => toggleModal(false));
        document.getElementById('cancelLeaveModalBtn').addEventListener('click', () => toggleModal(false));

        leaveForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const errorMsg = document.getElementById('leaveModalError');
            const saveBtn = document.getElementById('saveLeaveBtn');
            const spinner = document.getElementById('saveLeaveSpinner');
            
            errorMsg.classList.add('hidden');
            saveBtn.disabled = true;
            spinner.classList.remove('hidden');

            const type = document.getElementById('leaveType').value;
            const start = document.getElementById('leaveStart').value;
            const end = document.getElementById('leaveEnd').value;
            const reason = document.getElementById('leaveReason').value;

            const startDate = new Date(start);
            const endDate = new Date(end);
            
            if(endDate < startDate) {
                errorMsg.textContent = "วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่มต้น";
                errorMsg.classList.remove('hidden');
                saveBtn.disabled = false;
                spinner.classList.add('hidden');
                return;
            }

            const diffTime = Math.abs(endDate - startDate);
            const totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // Inclusive

            if (mockUserStr) {
                alert("Mock Mode: ส่งใบลาสำเร็จ (จำลอง)");
                toggleModal(false);
                saveBtn.disabled = false;
                spinner.classList.add('hidden');
                return;
            }

            try {
                await addDoc(collection(db, "leaves"), {
                    userId: currentUserUid,
                    userName: currentUser.name,
                    type: type,
                    startDate: Timestamp.fromDate(startDate),
                    endDate: Timestamp.fromDate(endDate),
                    totalDays: totalDays,
                    reason: reason,
                    status: 'pending',
                    createdAt: Timestamp.now()
                });

                toggleModal(false);
                loadMyLeaves(currentUserUid);

            } catch (error) {
                console.error("Save Leave Error:", error);
                errorMsg.textContent = "เกิดข้อผิดพลาดในการบันทึกข้อมูล";
                errorMsg.classList.remove('hidden');
            } finally {
                saveBtn.disabled = false;
                spinner.classList.add('hidden');
            }
        });
    }

    async function loadMyLeaves(uid) {
        const tbody = document.getElementById('myLeavesTableBody');
        
        if (mockUserStr) {
            tbody.innerHTML = `<tr><td colspan="4" class="py-6 text-center text-slate-500">Mock Data Mode</td></tr>`;
            return;
        }

        try {
            const q = query(collection(db, "leaves"), where("userId", "==", uid));
            const querySnapshot = await getDocs(q);
            
            tbody.innerHTML = '';
            
            if (querySnapshot.empty) {
                tbody.innerHTML = `<tr><td colspan="4" class="py-6 text-center text-slate-500">ไม่มีประวัติการลา</td></tr>`;
                return;
            }

            // Client side sort for simplicity
            const leaves = [];
            querySnapshot.forEach((doc) => leaves.push({ id: doc.id, ...doc.data() }));
            leaves.sort((a, b) => b.createdAt.toDate() - a.createdAt.toDate());

            leaves.forEach((data) => {
                const types = { 'annual': 'ลาพักร้อน', 'sick': 'ลาป่วย', 'personal': 'ลากิจ' };
                const statuses = {
                    'pending': '<span class="inline-block px-3 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-xs font-medium border border-amber-200 dark:border-amber-800/50">รออนุมัติ</span>',
                    'approved': '<span class="inline-block px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs font-medium border border-emerald-200 dark:border-emerald-800/50">อนุมัติแล้ว</span>',
                    'rejected': '<span class="inline-block px-3 py-1 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-xs font-medium border border-red-200 dark:border-red-800/50">ไม่อนุมัติ</span>'
                };

                const startStr = data.startDate.toDate().toLocaleDateString('th-TH');
                const endStr = data.endDate.toDate().toLocaleDateString('th-TH');
                const dateDisplay = startStr === endStr ? startStr : `${startStr} - ${endStr}`;

                const tr = document.createElement('tr');
                tr.className = "border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors";
                tr.innerHTML = `
                    <td class="py-4 px-4 font-medium">${types[data.type] || data.type}</td>
                    <td class="py-4 px-4 text-slate-500 dark:text-slate-400">${dateDisplay}</td>
                    <td class="py-4 px-4 text-center">${data.totalDays}</td>
                    <td class="py-4 px-4 text-center">${statuses[data.status] || data.status}</td>
                `;
                tbody.appendChild(tr);
            });

        } catch (error) {
            console.error("Error loading leaves:", error);
            tbody.innerHTML = `<tr><td colspan="4" class="py-6 text-center text-red-500">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>`;
        }
    }

    async function loadPendingApprovals() {
        if(mockUserStr) return;
        const tbody = document.getElementById('approvalsTableBody');
        const badge = document.getElementById('pendingBadge');

        try {
            const q = query(collection(db, "leaves"), where("status", "==", "pending"));
            const querySnapshot = await getDocs(q);
            
            tbody.innerHTML = '';
            
            if (querySnapshot.empty) {
                tbody.innerHTML = `<tr><td colspan="4" class="py-6 text-center text-slate-500">ไม่มีรายการรออนุมัติ</td></tr>`;
                badge.classList.add('hidden');
                return;
            }

            badge.textContent = querySnapshot.size;
            badge.classList.remove('hidden');

            querySnapshot.forEach((docSnap) => {
                const data = docSnap.data();
                const types = { 'annual': 'ลาพักร้อน', 'sick': 'ลาป่วย', 'personal': 'ลากิจ' };
                const startStr = data.startDate.toDate().toLocaleDateString('th-TH');
                const endStr = data.endDate.toDate().toLocaleDateString('th-TH');
                const dateDisplay = startStr === endStr ? startStr : `${startStr} - ${endStr}`;

                const tr = document.createElement('tr');
                tr.className = "border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors";
                tr.innerHTML = `
                    <td class="py-4 px-4 font-medium">${data.userName || 'Unknown'}</td>
                    <td class="py-4 px-4">
                        <div class="font-medium text-slate-800 dark:text-white">${types[data.type] || data.type} (${data.totalDays} วัน)</div>
                        <div class="text-xs text-slate-500 dark:text-slate-400">${dateDisplay}</div>
                    </td>
                    <td class="py-4 px-4 text-sm">${data.reason}</td>
                    <td class="py-4 px-4 text-right">
                        <button class="approve-btn bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50 px-3 py-1.5 rounded-lg text-xs font-medium mr-2 transition-colors" data-id="${docSnap.id}">อนุมัติ</button>
                        <button class="reject-btn bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors" data-id="${docSnap.id}">ปฏิเสธ</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });

            // Bind Actions
            document.querySelectorAll('.approve-btn').forEach(btn => {
                btn.addEventListener('click', (e) => handleApproval(e.target.getAttribute('data-id'), 'approved'));
            });
            document.querySelectorAll('.reject-btn').forEach(btn => {
                btn.addEventListener('click', (e) => handleApproval(e.target.getAttribute('data-id'), 'rejected'));
            });

        } catch (error) {
            console.error("Error loading approvals:", error);
            tbody.innerHTML = `<tr><td colspan="4" class="py-6 text-center text-red-500">เกิดข้อผิดพลาด</td></tr>`;
        }
    }

    async function handleApproval(leaveId, newStatus) {
        if(confirm(`ยืนยันการ${newStatus === 'approved' ? 'อนุมัติ' : 'ปฏิเสธ'}ใบลา?`)) {
            try {
                await updateDoc(doc(db, "leaves", leaveId), {
                    status: newStatus,
                    approverId: currentUserUid,
                    updatedAt: Timestamp.now()
                });
                // Deduct quota if approved (Simulated logic - should ideally run in Cloud Functions)
                if(newStatus === 'approved') {
                    const leaveDoc = await getDoc(doc(db, "leaves", leaveId));
                    if(leaveDoc.exists()) {
                        const lData = leaveDoc.data();
                        const uDocRef = doc(db, "users", lData.userId);
                        const uDoc = await getDoc(uDocRef);
                        if(uDoc.exists()) {
                            const uData = uDoc.data();
                            if(lData.type === 'annual' && uData.leave_quota?.annual) {
                                await updateDoc(uDocRef, { "leave_quota.annual": uData.leave_quota.annual - lData.totalDays });
                            } else if (lData.type === 'sick' && uData.leave_quota?.sick) {
                                await updateDoc(uDocRef, { "leave_quota.sick": uData.leave_quota.sick - lData.totalDays });
                            }
                        }
                    }
                }
                
                loadPendingApprovals();
            } catch (e) {
                console.error("Error updating status", e);
                alert("เกิดข้อผิดพลาดในการอัปเดตสถานะ");
            }
        }
    }

});
