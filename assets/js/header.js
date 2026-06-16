// assets/js/header.js

async function loadHeader() {
    const layoutRoot = document.getElementById('layoutRoot');

    if (!layoutRoot) return;

    const response = await fetch('components/header.html');
    const html = await response.text();

    layoutRoot.insertAdjacentHTML('afterbegin', html);

    initHeaderEvents();
    setActiveMenu();
    setPageInfo();
    loadUserInfo();

    const appBody = document.getElementById('appBody');
    if (appBody) {
        appBody.classList.remove('hidden');
    }
}

function initHeaderEvents() {
    const sidebar = document.getElementById('sidebar');
    const mobileOverlay = document.getElementById('mobileOverlay');
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const closeSidebarBtn = document.getElementById('closeSidebarBtn');
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    function openSidebar() {
        if (!sidebar || !mobileOverlay) return;

        sidebar.classList.remove('-translate-x-full');
        mobileOverlay.classList.remove('hidden');

        setTimeout(() => {
            mobileOverlay.classList.remove('opacity-0');
        }, 10);
    }

    function closeSidebar() {
        if (!sidebar || !mobileOverlay) return;

        sidebar.classList.add('-translate-x-full');
        mobileOverlay.classList.add('opacity-0');

        setTimeout(() => {
            mobileOverlay.classList.add('hidden');
        }, 300);
    }

    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', openSidebar);
    }

    if (closeSidebarBtn) {
        closeSidebarBtn.addEventListener('click', closeSidebar);
    }

    if (mobileOverlay) {
        mobileOverlay.addEventListener('click', closeSidebar);
    }

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const html = document.documentElement;

            if (html.classList.contains('dark')) {
                html.classList.remove('dark');
                localStorage.setItem('color-theme', 'light');
            } else {
                html.classList.add('dark');
                localStorage.setItem('color-theme', 'dark');
            }
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('user_name');
            localStorage.removeItem('user_role');
            window.location.href = 'login.html';
        });
    }
}

function setActiveMenu() {
    const path = window.location.pathname;
    const fileName = path.substring(path.lastIndexOf('/') + 1) || 'dashboard.html';

    const pageMap = {
        'dashboard.html': 'dashboard',
        'leave.html': 'leave',
        'projects.html': 'projects',
        'admin.html': 'admin'
    };

    const currentPage = pageMap[fileName] || 'dashboard';
    const navItems = document.querySelectorAll('.nav-item');

    navItems.forEach(item => {
        const itemPage = item.dataset.page;

        item.classList.remove(
            'active',
            'text-white',
            'bg-brand-600',
            'dark:bg-sky-600',
            'font-medium',
            'shadow-sm'
        );

        item.classList.add(
            'text-slate-400',
            'hover:text-white',
            'hover:bg-slate-800'
        );

        if (itemPage === currentPage) {
            item.classList.add(
                'active',
                'text-white',
                'bg-brand-600',
                'dark:bg-sky-600',
                'font-medium',
                'shadow-sm'
            );

            item.classList.remove(
                'text-slate-400',
                'hover:text-white',
                'hover:bg-slate-800'
            );
        }
    });
}

function setPageInfo() {
    const pageTitle = document.body.dataset.title || 'ภาพรวมระบบ';
    const pageSubtitle = document.body.dataset.subtitle || 'ข้อมูลสรุปการทำงานและสถานะปัจจุบัน';

    const titleEl = document.getElementById('pageTitle');
    const subtitleEl = document.getElementById('pageSubtitle');

    if (titleEl) titleEl.textContent = pageTitle;
    if (subtitleEl) subtitleEl.textContent = pageSubtitle;
}

function loadUserInfo() {
    const userName = document.getElementById('userName');
    const userRole = document.getElementById('userRole');
    const adminMenu = document.getElementById('adminMenu');

    const currentUser = {
        name: localStorage.getItem('user_name') || 'ผู้ใช้งานระบบ',
        role: localStorage.getItem('user_role') || 'employee'
    };

    const roleText = {
        admin: 'ผู้ดูแลระบบ',
        manager: 'ผู้จัดการ',
        secretary: 'เลขานุการ',
        employee: 'พนักงาน'
    };

    if (userName) {
        userName.textContent = currentUser.name;
    }

    if (userRole) {
        userRole.textContent = roleText[currentUser.role] || currentUser.role;
    }

    if (adminMenu && currentUser.role === 'admin') {
        adminMenu.classList.remove('hidden');
    }
}

document.addEventListener('DOMContentLoaded', loadHeader);