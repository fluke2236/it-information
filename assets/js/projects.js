// assets/js/projects.js
import { db, auth } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, getDocs, doc, getDoc, addDoc, updateDoc, query, orderBy, Timestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let totalBudgetLimit = 1500000;
let lastApprovedBudgetTotal = 0;

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
        initProjectSystem(currentUser);
    } else {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    const userDoc = await getDoc(doc(db, "users", user.uid));
                    if (userDoc.exists()) {
                        currentUser = userDoc.data();
                        currentUserUid = user.uid;
                        await initProjectSystem(currentUser, user.uid);
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
            if(action === 'approve_project') return user.role === 'admin';
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
                'admin': ['approve_project', 'create_project'],
                'manager': ['create_project'],
                'secretary': ['create_project'],
                'staff': ['create_project']
            };
            return (roleDefaults[user.role] || []).includes(action);

        } catch (e) {
            console.error("Permission check error", e);
            return false;
        }
    }

    async function initProjectSystem(user, uid) {
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

        const canCreate = await checkPermission(user, uid, 'create_project');
        if(canCreate) {
            document.getElementById('createProjectBtn').classList.remove('hidden');
        }

        canApprove = await checkPermission(user, uid, 'approve_project');

        setupProjectModal();
        setupActionModal();
        loadProjects();
    }

    function setupProjectModal() {
        const modal = document.getElementById('projectModal');
        const content = document.getElementById('projectModalContent');
        const form = document.getElementById('projectForm');

        function toggleModal(show) {
            if (show) {
                modal.classList.remove('hidden');
                setTimeout(() => {
                    modal.classList.remove('opacity-0');
                    content.classList.remove('scale-95');
                }, 10);
            } else {
                modal.classList.add('opacity-0');
                content.classList.add('scale-95');
                setTimeout(() => modal.classList.add('hidden'), 300);
                form.reset();
                document.getElementById('projectModalError').classList.add('hidden');
            }
        }

        document.getElementById('createProjectBtn').addEventListener('click', () => toggleModal(true));
        document.getElementById('closeProjectModalBtn').addEventListener('click', () => toggleModal(false));
        document.getElementById('cancelProjectModalBtn').addEventListener('click', () => toggleModal(false));

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const errorMsg = document.getElementById('projectModalError');
            const saveBtn = document.getElementById('saveProjectBtn');
            const spinner = document.getElementById('saveProjectSpinner');
            
            errorMsg.classList.add('hidden');
            saveBtn.disabled = true;
            spinner.classList.remove('hidden');

            const title = document.getElementById('projTitle').value;
            const desc = document.getElementById('projDesc').value;
            const budget = parseInt(document.getElementById('projBudget').value);

            if (mockUserStr) {
                alert("Mock Mode: เสนอโครงการสำเร็จ (จำลอง)");
                toggleModal(false);
                saveBtn.disabled = false;
                spinner.classList.add('hidden');
                return;
            }

            try {
                await addDoc(collection(db, "projects"), {
                    title: title,
                    description: desc,
                    budgetAllocated: budget,
                    budgetSpent: 0,
                    status: 'pending',
                    createdBy: currentUserUid,
                    creatorName: currentUser.name,
                    createdAt: Timestamp.now()
                });

                toggleModal(false);
                loadProjects();

            } catch (error) {
                console.error("Save Project Error:", error);
                errorMsg.textContent = "เกิดข้อผิดพลาดในการบันทึกข้อมูล";
                errorMsg.classList.remove('hidden');
            } finally {
                saveBtn.disabled = false;
                spinner.classList.add('hidden');
            }
        });
    }

    let currentActionProjectId = null;
    function setupActionModal() {
        const modal = document.getElementById('actionModal');
        const content = document.getElementById('actionModalContent');

        window.openActionModal = (id, title) => {
            currentActionProjectId = id;
            document.getElementById('actionProjName').textContent = title;
            modal.classList.remove('hidden');
            setTimeout(() => {
                modal.classList.remove('opacity-0');
                content.classList.remove('scale-95');
            }, 10);
        };

        const closeModal = () => {
            modal.classList.add('opacity-0');
            content.classList.add('scale-95');
            setTimeout(() => modal.classList.add('hidden'), 300);
            currentActionProjectId = null;
        };

        document.getElementById('closeActionModal').addEventListener('click', closeModal);

        document.getElementById('btnApproveProj').addEventListener('click', () => processAction('approved', closeModal));
        document.getElementById('btnRejectProj').addEventListener('click', () => processAction('rejected', closeModal));
    }

    async function processAction(newStatus, closeCb) {
        if(!currentActionProjectId || mockUserStr) {
            alert("Mock Mode Action");
            closeCb();
            return;
        }

        try {
            await updateDoc(doc(db, "projects", currentActionProjectId), {
                status: newStatus,
                approverId: currentUserUid,
                updatedAt: Timestamp.now()
            });
            closeCb();
            loadProjects();
        } catch(e) {
            console.error("Error updating project", e);
            alert("อัปเดตไม่สำเร็จ");
        }
    }

    async function loadProjects() {
        const grid = document.getElementById('projectsGrid');
        
        if (mockUserStr) {
            grid.innerHTML = `<div class="col-span-full py-12 text-center text-slate-500">Mock Data Mode</div>`;
            return;
        }

        try {
            const q = query(collection(db, "projects"), orderBy("createdAt", "desc"));
            const querySnapshot = await getDocs(q);
            
            grid.innerHTML = '';
            let totalSpent = 0;
            
            if (querySnapshot.empty) {
                grid.innerHTML = `<div class="col-span-full py-12 text-center text-slate-500">ยังไม่มีโครงการในระบบ</div>`;
            }

            querySnapshot.forEach((docSnap) => {
                const data = docSnap.data();
                
                // Calculate budget if approved
                if(data.status === 'approved') {
                    totalSpent += data.budgetAllocated; // Assuming all allocated is "spent" from the global budget pool for now
                }

                const statusMap = {
                    'pending': { label: 'รอพิจารณา', class: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800/50' },
                    'approved': { label: 'อนุมัติแล้ว', class: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50' },
                    'rejected': { label: 'ไม่อนุมัติ', class: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800/50' },
                };
                const statusInfo = statusMap[data.status] || statusMap['pending'];
                
                const dateStr = data.createdAt ? data.createdAt.toDate().toLocaleDateString('th-TH') : '';
                const budgetFormatted = new Intl.NumberFormat('th-TH').format(data.budgetAllocated);

                let actionHtml = '';
                if(data.status === 'pending' && canApprove) {
                    actionHtml = `
                        <div class="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/50">
                            <button onclick="window.openActionModal('${docSnap.id}', '${data.title}')" class="w-full py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-white text-sm font-medium rounded-lg transition-colors">พิจารณาโครงการ</button>
                        </div>
                    `;
                }

                const cardHtml = `
                    <div class="border border-slate-200 dark:border-slate-700 rounded-xl p-5 bg-white dark:bg-slate-800 shadow-sm hover:shadow-md transition-shadow flex flex-col h-full">
                        <div class="flex justify-between items-start mb-3">
                            <span class="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold border ${statusInfo.class}">${statusInfo.label}</span>
                            <span class="text-xs text-slate-400">${dateStr}</span>
                        </div>
                        <h4 class="text-base font-bold text-slate-800 dark:text-white mb-2 line-clamp-2">${data.title}</h4>
                        <p class="text-sm text-slate-500 dark:text-slate-400 mb-4 line-clamp-3 flex-grow">${data.description}</p>
                        
                        <div class="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3 mt-auto">
                            <div class="text-xs text-slate-500 dark:text-slate-400 mb-1">งบประมาณที่ขอ</div>
                            <div class="text-lg font-bold text-brand-600 dark:text-sky-400">${budgetFormatted} <span class="text-xs font-normal">THB</span></div>
                            <div class="text-xs text-slate-400 mt-1">ผู้เสนอ: ${data.creatorName || 'Unknown'}</div>
                        </div>
                        ${actionHtml}
                    </div>
                `;
                
                grid.innerHTML += cardHtml;
            });

            updateGlobalBudget(totalSpent);

        } catch (error) {
            console.error("Error loading projects:", error);
            grid.innerHTML = `<div class="col-span-full py-12 text-center text-red-500">เกิดข้อผิดพลาดในการโหลดข้อมูล</div>`;
        }
    }

    function updateGlobalBudget(spent) {
        const remaining = TOTAL_BUDGET - spent;
        const percent = (spent / TOTAL_BUDGET) * 100;
        
        document.getElementById('globalSpent').textContent = new Intl.NumberFormat('th-TH').format(spent);
        document.getElementById('globalRemaining').textContent = new Intl.NumberFormat('th-TH').format(remaining);
        
        const bar = document.getElementById('budgetProgressBar');
        bar.style.width = `${Math.min(percent, 100)}%`;
        
        if(percent > 90) {
            bar.className = "bg-gradient-to-r from-red-500 to-orange-400 h-3 rounded-full transition-all duration-1000";
        } else if (percent > 70) {
            bar.className = "bg-gradient-to-r from-amber-500 to-yellow-400 h-3 rounded-full transition-all duration-1000";
        }
        
        document.getElementById('budgetPercent').textContent = percent.toFixed(1);
    }
});
