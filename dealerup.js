// ── Dark Mode ─────────────────────────────────────────
function initDarkMode() {
    // Check if user has saved preference, otherwise check system preference
    const savedMode = localStorage.getItem('darkMode');
    const systemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedMode === 'true' || (savedMode === null && systemDark)) {
        enableDarkMode();
    }
}

function toggleDarkMode() {
    if (document.body.classList.contains('dark-mode')) {
        disableDarkMode();
    } else {
        enableDarkMode();
    }
}

function enableDarkMode() {
    document.body.classList.add('dark-mode');
    localStorage.setItem('darkMode', 'true');
}

function disableDarkMode() {
    document.body.classList.remove('dark-mode');
    localStorage.setItem('darkMode', 'false');
}

// Initialize dark mode on page load
window.addEventListener('DOMContentLoaded', initDarkMode);

// ── Session Persistence ────────────────────────────────
function saveSession(user) {
    sessionStorage.setItem('currentUser', JSON.stringify(user));
}

function loadSession() {
    const saved = sessionStorage.getItem('currentUser');
    return saved ? JSON.parse(saved) : null;
}

function clearSession() {
    sessionStorage.removeItem('currentUser');
}

function restoreSessionIfExists() {
    const user = loadSession();
    if (user) {
        currentUser = user;
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('app').classList.add('visible');
        const badge = document.getElementById('headerRoleBadge');
        badge.textContent = currentUser.role;
        badge.className = 'role-badge role-' + getRoleCssClass(currentUser.role);
        document.getElementById('headerUserName').textContent = currentUser.username;
        if (isAdminRole(currentUser.role)) {
            document.getElementById('actionsHeader').textContent = 'Actions';
            document.getElementById('addVehicleBtn').style.display = 'flex';
            document.getElementById('usersTabBtn').style.display = 'inline-block';
            document.getElementById('customersTabBtn').style.display = 'inline-block';
        }
        loadInventory();
        switchTab(localStorage.getItem('activeTab') || 'dashboard');
    }
}

// Restore session on page load
window.addEventListener('DOMContentLoaded', restoreSessionIfExists);

// ── Auth ──────────────────────────────────────────────
let currentUser = null;
let saleFormLoadedDraftSnapshot = null;
let approvingAcquisition = null;
let acquisitionResultHideTimer = null;
let saleResultHideTimer = null;
let acquisitionLoading = { id: null, action: null };

// Maps DB role values to CSS class names used in styles.css
const ROLE_CSS = {
    admin: 'admin',
    employee: 'employee',
    'sales rep': 'employee',
    salesrep: 'employee',
};
const TRANSACTION_STATES = [ 'In Progress', 'Finalized' ];
const TRANSACTION_FLOW = {'In Progress': ['Finalized'], 'Finalized': [] };

function normalizeRole(role) {
    return String(role ?? '').trim().toLowerCase();
}

function isAdminRole(role) {
    return normalizeRole(role) === 'admin';
}

function getRoleCssClass(role) {
    return ROLE_CSS[normalizeRole(role)] ?? 'employee';
}

async function doLogin() {
    const u = document.getElementById('loginUser').value.trim().toLowerCase();
    const p = document.getElementById('loginPass').value;
    try {
        const user = await db.users.login(u, p);
        if (user) {
            // Show loader as soon as credentials are confirmed
            document.getElementById('loadingScreen').style.display = 'flex';
            window.__dismissLoader?.();

            currentUser = user;
            saveSession(user);
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('app').classList.add('visible');
            
            // Set role-based UI visibility FIRST, before switching tabs
            const badge = document.getElementById('headerRoleBadge');
            badge.textContent = currentUser.role;
            badge.className = 'role-badge role-' + getRoleCssClass(currentUser.role);
            document.getElementById('headerUserName').textContent = currentUser.username;
            
            const usersTab = document.getElementById('usersTabBtn');
            const customersTab = document.getElementById('customersTabBtn');
            if (isAdminRole(currentUser.role)) {
                usersTab.style.display = 'inline-flex';
                customersTab.style.display = 'inline-flex';
                document.getElementById('actionsHeader').textContent = 'Actions';
                document.getElementById('addVehicleBtn').style.display = 'flex';
            } else {
                usersTab.style.display = 'none';
                customersTab.style.display = 'none';
            }
            
            // Now load data and switch tabs
            await loadInventory();
            switchTab(localStorage.getItem('activeTab') || 'dashboard');
        } else {
            document.getElementById('loginError').style.display = 'block';
        }
    } catch (err) {
        console.error('Login error:', err.message);
        document.getElementById('loginError').style.display = 'block';
    }
}

function doLogout() {
    currentUser = null;
    clearSession(); // Clear from sessionStorage
    document.getElementById('app').classList.remove('visible');
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('loginUser').value = '';
    document.getElementById('loginPass').value = '';
    document.getElementById('loginError').style.display = 'none';
    document.getElementById('actionsHeader').textContent = '';
    document.getElementById('customersTabBtn').style.display = 'none';
    localStorage.removeItem('activeTab'); 
}

function generateVin() {
    const chars = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
    let vin = '';
    for (let i = 0; i < 17; i++) vin += chars[Math.floor(Math.random() * chars.length)];
    document.getElementById('fVin').value = vin;
}

document.getElementById('loginPass').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
});

// ── Inventory data ────────────────────────────────────
// Populated from Supabase on login via loadInventory()
let inventory = [];
let editingVin = null;
let sortCol = null;
let sortDir = 'asc';
let acquisitionsCache = [];
let acquisitionScope = 'mine';
let acquisitionRequestFormVisible = false;

function sortInventory(col) {
    if (sortCol === col) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
        sortCol = col;
        sortDir = 'asc';
    }
    renderTable();
}

function getSortValue(v, col) {
    switch (col) {
        case 'vehicle': return `${v.year ?? 0} ${v.make ?? ''} ${v.model ?? ''}`.toLowerCase();
        case 'vin':     return (v.vin ?? '').toLowerCase();
        case 'liscplate':     return (v.license_plate ?? '').toLowerCase();
        case 'mileage': return v.mileage ?? -1;
        case 'price':   return v.listed_sale ?? -1;
        case 'status':  return (v.status ?? '').toLowerCase();
        default:        return '';
    }
}

function updateSortArrows() {
    ['vehicle', 'vin', 'mileage', 'price','liscplate', 'status'].forEach(col => {
        const el = document.getElementById('sort-' + col);
        if (!el) return;
        if (sortCol === col) {
            el.textContent = sortDir === 'asc' ? ' ▲' : ' ▼';
        } else {
            el.textContent = ' ⇅';
        }
    });
}

async function loadInventory() {
    try {
        inventory = await db.inventory.getAll();
        renderTable();
        renderStats();
    } catch (err) {
        console.error('Failed to load inventory:', err.message);
    }
}

async function loadUsers() {
    console.log("loadUsers fired");
    try {
        const users = await db.users.getAll();
        console.log("Users fetched:", users);

        const body = document.getElementById('usersBody');
        if (!body) {
            console.error('usersBody element not found');
            return;
        }
        body.innerHTML = '';

        if (!users || users.length === 0) {
            body.innerHTML = '<tr><td colspan="3">No users found</td></tr>';
            return;
        }

        let hasUsers = false;
        users.forEach(user => {
            const isCurrentUser = user.username === currentUser?.username;
            const row = document.createElement('tr');
            const usernameDisplay = isCurrentUser ? `${user.username} <span style="color:var(--muted); font-size:12px;">(You)</span>` : user.username;
            const deleteButton = isCurrentUser 
                ? '<span style="color:var(--muted); font-size:12px;">—</span>'
                : `<button class="btn-sm danger" onclick="deleteUser('${user.user_id}')">Delete</button>`;
            
            row.innerHTML = `
                <td>${usernameDisplay}</td>
                <td>${user.role}</td>
                <td>
                    ${deleteButton}
                </td>
            `;
            body.appendChild(row);
            hasUsers = true;
        });

        if (!hasUsers) {
            body.innerHTML = '<tr><td colspan="3">No users found</td></tr>';
        }

    } catch (err) {
        console.error('Failed to load users:', err.message);
        const body = document.getElementById('usersBody');
        if (body) {
            body.innerHTML = `<tr><td colspan="3"><div style="color:red;">Error loading users: ${err.message}</div></td></tr>`;
        }
    }
}

function renderStats() {
    const active = inventory.filter(v => v.status !== 'Sold');
    document.getElementById('statTotal').textContent = active.length;
    document.getElementById('statAvailable').textContent = active.filter(v => v.status === 'Available').length;
    document.getElementById('statSold').textContent = inventory.filter(v => v.status === 'Sold').length;
}


function renderTable() {
  const q = document.getElementById('searchInput')?.value?.toLowerCase() || '';
  const statusF = document.getElementById('statusFilter')?.value || '';

    const filtered = inventory.filter(v => {
    if (v.status === 'Sold') return false;
    const matchSearch = !q || (v.make ?? '').toLowerCase().includes(q) ||
        (v.model ?? '').toLowerCase().includes(q) ||
        (v.vin ?? '').toLowerCase().includes(q) ||
        (v.license_plate ?? '').toLowerCase().includes(q);

    const matchStatus = !statusF || v.status === statusF;
    return matchSearch && matchStatus;
});

if (sortCol) {
    filtered.sort((a, b) => {
        const aVal = getSortValue(a, sortCol);
        const bVal = getSortValue(b, sortCol);

        if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
        return 0;
    });
}

  updateSortArrows();

  const tbody = document.getElementById('inventoryBody');
  tbody.innerHTML = '';

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7">No vehicles found</td></tr>`;
    return;
  }

  const isAdmin = isAdminRole(currentUser?.role);

  filtered.forEach(v => {
    const row = document.createElement('tr');

    row.innerHTML = `
      <td>${v.year} ${v.make} ${v.model}</td>
      <td>${v.vin}</td>
      <td>${v.license_plate ?? '—'}</td>
      <td>${v.mileage?.toLocaleString() ?? '—'}</td>
      <td>$${(v.listed_sale ?? 0).toLocaleString()}</td>
      <td><span class="status s-${v.status?.toLowerCase()}">${v.status ?? '—'}</span></td>
      <td>${isAdmin ? `
        <div class="action-btns">
          <button class="btn-sm" onclick="openEditModal('${v.vin}')">Edit</button>
          <button class="btn-sm danger" onclick="deleteVehicle('${v.vin}')">Delete</button>
        </div>` : ''}
      </td>
    `;

    tbody.appendChild(row);
  });
}

// ── Modal ─────────────────────────────────────────────
function openAddModal() {
    editingVin = null;
    approvingAcquisition = null;
    document.getElementById('modalTitle').textContent = 'Add vehicle';
    ['fYear', 'fMake', 'fModel', 'fMileage', 'fPrice', 'fLicensePlate'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('fStatus').value = 'Available';
    // Auto-generate VIN silently
    const chars = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
    let vin = '';
    for (let i = 0; i < 17; i++) vin += chars[Math.floor(Math.random() * chars.length)];
    document.getElementById('fVin').value = vin;
    document.getElementById('modal').classList.add('open');
}

async function openAcquisitionApprovalModal(acquisitionId) {
    try {
        const acq = await db.acquisitions.getById(acquisitionId);
        approvingAcquisition = acq;
        editingVin = null;

        document.getElementById('modalTitle').textContent = 'Approve acquisition';
        document.getElementById('modalSaveBtn').textContent = 'Approve & Add to Inventory';

        const existingVehicle = await db.inventory.getMaybeByVin(acq.vin);
        const isPending = existingVehicle?.model === 'Pending Acquisition';

        document.getElementById('fYear').value = existingVehicle?.year ?? '';
        document.getElementById('fMake').value = existingVehicle?.make ?? '';
        document.getElementById('fModel').value = (!isPending && existingVehicle?.model) ? existingVehicle.model : '';
        document.getElementById('fVin').value = acq.vin ?? '';
        document.getElementById('fMileage').value = existingVehicle?.mileage ?? '';
        document.getElementById('fPrice').value = acq.purchase_price ?? existingVehicle?.listed_sale ?? '';
        document.getElementById('fStatus').value = 'Available';
        document.getElementById('fLicensePlate').value = existingVehicle?.license_plate ?? '';

        setAcquisitionModalLoading(false);
        document.getElementById('modal').classList.add('open');
    } catch (err) {
        alert('Failed to open approval form: ' + err.message);
    }
}

function openEditModal(vin) {
    const v = inventory.find(x => x.vin === vin);
    if (!v) return;
    editingVin = vin;
    document.getElementById('modalTitle').textContent = 'Edit vehicle';
    document.getElementById('fYear').value = v.year;
    document.getElementById('fMake').value = v.make ?? '';
    document.getElementById('fModel').value = v.model;
    document.getElementById('fVin').value = v.vin;
    document.getElementById('fMileage').value = v.mileage ?? '';
    document.getElementById('fPrice').value = v.listed_sale ?? '';
    document.getElementById('fStatus').value = v.status;
    document.getElementById('fLicensePlate').value = v.license_plate ?? '';
    document.getElementById('modal').classList.add('open');
}

function closeModal() {
    approvingAcquisition = null;
    setAcquisitionModalLoading(false);
    document.getElementById('modal').classList.remove('open');
}

async function saveVehicle() {
    const year = parseInt(document.getElementById('fYear').value);
    const make = document.getElementById('fMake').value.trim();
    const model = document.getElementById('fModel').value.trim();
    const vin = document.getElementById('fVin').value.trim().toUpperCase();
    const mileage = parseInt(document.getElementById('fMileage').value) || 0;
    const listed_sale = parseFloat(document.getElementById('fPrice').value) || 0;
    const status = document.getElementById('fStatus').value;
    const license_plate = document.getElementById('fLicensePlate').value.trim().toUpperCase() || null;

    if (!year || !model || !vin) {
        alert('Please fill in year, model, and VIN.');
        return;
    }

    try {
        if (editingVin) {
            await db.inventory.update(editingVin, { year, make, model, mileage, listed_sale, status, license_plate });
        } else if (approvingAcquisition) {
            setAcquisitionModalLoading(true);
            const existingVehicle = await db.inventory.getMaybeByVin(vin);
            if (existingVehicle) {
                await db.inventory.update(vin, { year, make, model, mileage, listed_sale, status, license_plate });
            } else {
                await db.inventory.insert({ vin, year, make, model, mileage, listed_sale, status, license_plate });
            }
            try {
                await db.acquisitions.approve(approvingAcquisition.acquisition_id);
                
                // If this is a trade-in, create customer record with amount owed
                if (approvingAcquisition.notes && approvingAcquisition.notes.includes('Customer:')) {
                    const notes = approvingAcquisition.notes;
                    const customerMatch = notes.match(/Customer:\s*([^|]+)/);
                    const valueMatch = notes.match(/Value:\s*\$([\d,.]+)/);
                    if (customerMatch && valueMatch) {
                        const customerName = customerMatch[1].trim();
                        const value = parseFloat(valueMatch[1].replace(/,/g, ''));
                        await db.customers.insert({
                            customer_name: customerName,
                            phone: null,
                            amount_owed: -value,
                        });
                    }
                }
            } catch (approveErr) {
                try {
                    await db.inventory.delete(vin);
                } catch (rollbackErr) {
                    console.warn('Inventory rollback failed after approval error:', rollbackErr.message);
                }
                throw approveErr;
            }
            setAcquisitionModalLoading(false);
        } else {
            await db.inventory.insert({ vin, year, make, model, mileage, listed_sale, status, license_plate });
        }
        closeModal();
        await loadInventory();
        await loadAcquisitions();
    } catch (err) {
        setAcquisitionModalLoading(false);
        alert('Save failed: ' + err.message);
    }
}
async function deleteUser(userId) {
    if (!confirm("Delete this user?")) return;

    try {
        await db.users.delete(userId);
        await loadUsers();
    } catch (err) {
        alert('Failed to delete user: ' + err.message);
    }
}

async function deleteVehicle(vin) {
    if (!confirm('Remove this vehicle from inventory?')) return;
    try {
        await db.inventory.delete(vin);
        await loadInventory();
    } catch (err) {
        if (err.message?.includes('foreign key')) {
            alert('Cannot delete this vehicle — it is linked to an existing sales or acquisition record.');
        } else {
            alert('Delete failed: ' + err.message);
        }
    }
}


// ── Tab Navigation ──────────────────────────────────
async function switchTab(tab) {
  localStorage.setItem('activeTab', tab);
  const pages = {
    dashboard:    document.getElementById('dashboardPage'),
    inventory:    document.getElementById('inventoryPage'),
    acquisitions: document.getElementById('acquisitionsPage'),
    mysales:      document.getElementById('mysalesPage'),
    transactions: document.getElementById('transactionsPage'),
    tradein:      document.getElementById('tradeinPage'),
    users:        document.getElementById('usersPage'),
    customers:    document.getElementById('customersPage'),
  };
  const tabs = document.querySelectorAll('.tab-btn');
  const order = ['dashboard', 'inventory', 'acquisitions', 'mysales', 'transactions', 'tradein', 'users', 'customers'];

  // Hide sale form and messages when leaving My Sales tab
  if (tab !== 'mysales') {
    closeSaleForm();
    hideSaleStatusMessage();
  }

  Object.values(pages).forEach(p => p && (p.style.display = 'none'));
  tabs.forEach(t => t.classList.remove('active'));

  if (pages[tab]) pages[tab].style.display = 'block';
  const tabIndex = order.indexOf(tab);
  if (tabIndex >= 0 && tabs[tabIndex]) tabs[tabIndex].classList.add('active');

  if (tab === 'dashboard')    await loadDashboard();
  if (tab === 'acquisitions') await loadAcquisitions();
  if (tab === 'tradein')      generateTradeInVin();
  if (tab === 'transactions') await loadTransactions();
  if (tab === 'mysales')      await loadMySales();
  if (tab === 'users') {
    console.log("Switching to users tab");
    await loadUsers();
  }
  if (tab === 'customers')    await loadCustomers();
}

// ── Filters ──────────────────────────────────────────
function clearFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('statusFilter').value = '';
    renderTable();
}

function setEmployeeAcquisitionScope(scope) {
    acquisitionScope = scope;
    renderAcquisitionsEmployee();
}

function renderAcquisitionScopeButtons() {
    const mineBtn = document.getElementById('acqScopeMineBtn');
    const allBtn = document.getElementById('acqScopeAllBtn');
    if (mineBtn) mineBtn.classList.toggle('active', acquisitionScope === 'mine');
    if (allBtn) allBtn.classList.toggle('active', acquisitionScope === 'all');
}

function syncAcquisitionRequestFormVisibility() {
    const formWrap = document.getElementById('acqRequestFormWrap');
    const toggleBtn = document.getElementById('acqRequestToggleBtn');
    if (formWrap) formWrap.style.display = acquisitionRequestFormVisible ? 'block' : 'none';
    if (toggleBtn) {
        toggleBtn.style.display = acquisitionRequestFormVisible ? 'none' : 'inline-flex';
    }
}

function toggleAcquisitionRequestForm() {
    acquisitionRequestFormVisible = !acquisitionRequestFormVisible;
    syncAcquisitionRequestFormVisibility();
}

async function loadAcquisitions() {
    const roleLabel = document.getElementById('acqRoleLabel');
    const isAdmin = isAdminRole(currentUser?.role);

    if (roleLabel) {
        roleLabel.textContent = currentUser?.role ?? '';
        roleLabel.className = 'role-badge role-' + getRoleCssClass(currentUser?.role);
    }

    document.getElementById('acqAdminView').style.display = isAdmin ? 'block' : 'none';
    document.getElementById('acqEmployeeView').style.display = isAdmin ? 'none' : 'block';
    if (!isAdmin) syncAcquisitionRequestFormVisibility();

    try {
        acquisitionsCache = await db.acquisitions.getAll();
        if (isAdmin) {
            renderAcquisitionsAdmin();
        } else {
            renderAcquisitionsEmployee();
        }
    } catch (err) {
        console.error('Failed to load acquisitions:', err.message);
        const targetBodyId = isAdmin ? 'acqAdminBody' : 'acqEmployeeBody';
        const colspan = isAdmin ? 8 : 7;
        document.getElementById(targetBodyId).innerHTML = `<tr><td colspan="${colspan}"><div class="empty-state"><div class="empty-title">Failed to load</div><div class="empty-sub">${err.message}</div></div></td></tr>`;
    }
}

function renderAcquisitionsAdmin() {
    const acquisitions = acquisitionsCache;
    const pending = acquisitions.filter(a => a.status === 'Pending');
    const approved = acquisitions.filter(a => a.status === 'Approved');
    const denied = acquisitions.filter(a => a.status === 'Denied');

    document.getElementById('acqAdminSummary').innerHTML = `
        <div class="sum-card"><div class="sum-label">Pending Approval</div><div class="sum-val">${pending.length}</div></div>
        <div class="sum-card"><div class="sum-label">Approved</div><div class="sum-val">${approved.length}</div></div>
        <div class="sum-card"><div class="sum-label">Denied</div><div class="sum-val">${denied.length}</div></div>
    `;

    const pendingBody = document.getElementById('acqAdminBody');
    const approvedBody = document.getElementById('acqAdminApprovedBody');

    if (!pending.length) {
        pendingBody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">&#9723;</div><div class="empty-title">No pending approvals</div><div class="empty-sub">New employee requests will appear here.</div></div></td></tr>`;
    } else {
        pendingBody.innerHTML = pending.map(a => `
            <tr>
                <td>${a.acquisition_id}</td>
                <td class="vin">${a.vin ?? '—'}</td>
                <td>${a.purchase_price != null ? '$' + Number(a.purchase_price).toLocaleString() : '—'}</td>
                <td>${a.salesman_id ?? '—'}</td>
                <td style="max-width:240px; font-size:12px; color:var(--muted);">${a.notes ?? '—'}</td>
                <td>${a.created_at ? new Date(a.created_at).toLocaleDateString() : '—'}</td>
                <td><span class="status s-${a.status?.toLowerCase()}">${a.status ?? '—'}</span></td>
                <td>
                    <div class="action-btns">
                        <button class="btn-sm ${acquisitionLoading.id === a.acquisition_id && acquisitionLoading.action === 'approve' ? 'loading' : ''}" ${acquisitionLoading.id === a.acquisition_id ? 'disabled' : ''} onclick="openAcquisitionApprovalModal(${a.acquisition_id})">${acquisitionLoading.id === a.acquisition_id && acquisitionLoading.action === 'approve' ? '<span class=\"spinner\"></span> Approving' : 'Edit / Approve'}</button>
                        <button class="btn-sm danger ${acquisitionLoading.id === a.acquisition_id && acquisitionLoading.action === 'deny' ? 'loading' : ''}" ${acquisitionLoading.id === a.acquisition_id ? 'disabled' : ''} onclick="denyAcquisition(${a.acquisition_id})">${acquisitionLoading.id === a.acquisition_id && acquisitionLoading.action === 'deny' ? '<span class=\"spinner\"></span> Denying' : 'Deny'}</button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    if (!approved.length) {
        approvedBody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">&#9723;</div><div class="empty-title">No approved requests yet</div></div></td></tr>`;
    } else {
        approvedBody.innerHTML = approved.map(a => `
            <tr>
                <td>${a.acquisition_id}</td>
                <td class="vin">${a.vin ?? '—'}</td>
                <td>${a.purchase_price != null ? '$' + Number(a.purchase_price).toLocaleString() : '—'}</td>
                <td>${a.salesman_id ?? '—'}</td>
                <td style="max-width:240px; font-size:12px; color:var(--muted);">${a.notes ?? '—'}</td>
                <td>${a.created_at ? new Date(a.created_at).toLocaleDateString() : '—'}</td>
                <td><span class="status s-${a.status?.toLowerCase()}">${a.status ?? '—'}</span></td>
            </tr>
        `).join('');
    }
}

function getVisibleAcquisitionsForEmployee() {
    const all = acquisitionsCache;
    if (acquisitionScope === 'all') return all;
    return all.filter(a => String(a.salesman_id) === String(currentUser?.user_id));
}

function renderAcquisitionsEmployee() {
    const visible = getVisibleAcquisitionsForEmployee();
    const mine = acquisitionsCache.filter(a => String(a.salesman_id) === String(currentUser?.user_id));
    const pending = visible.filter(a => a.status === 'Pending').length;
    const approved = visible.filter(a => a.status === 'Approved').length;

    renderAcquisitionScopeButtons();

    document.getElementById('acqEmployeeSummary').innerHTML = `
        <div class="sum-card"><div class="sum-label">My Requests</div><div class="sum-val">${mine.length}</div></div>
        <div class="sum-card"><div class="sum-label">Pending</div><div class="sum-val">${pending}</div></div>
        <div class="sum-card"><div class="sum-label">Approved</div><div class="sum-val">${approved}</div></div>
    `;

    const body = document.getElementById('acqEmployeeBody');
    if (!visible.length) {
        body.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">&#9723;</div><div class="empty-title">No acquisition requests yet</div><div class="empty-sub">Create a request using the form above.</div></div></td></tr>`;
        return;
    }

    body.innerHTML = visible.map(a => `
        <tr>
            <td>${a.acquisition_id}</td>
            <td class="vin">${a.vin ?? '—'}</td>
            <td>${a.purchase_price != null ? '$' + Number(a.purchase_price).toLocaleString() : '—'}</td>
            <td>${a.salesman_id ?? '—'}</td>
            <td style="max-width:260px; font-size:12px; color:var(--muted);">${a.notes ?? '—'}</td>
            <td>${a.created_at ? new Date(a.created_at).toLocaleDateString() : '—'}</td>
            <td><span class="status s-${a.status?.toLowerCase()}">${a.status ?? '—'}</span></td>
        </tr>
    `).join('');
}

function clearAcquisitionRequestForm(hideResult = true) {
    ['acqVin', 'acqPurchasePrice', 'acqNotes'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    acquisitionRequestFormVisible = false;
    syncAcquisitionRequestFormVisibility();
    if (hideResult) document.getElementById('acqEmployeeResult').style.display = 'none';
}

function showAcquisitionRequestResult(type, message) {
    const el = document.getElementById('acqEmployeeResult');
    if (acquisitionResultHideTimer) {
        clearTimeout(acquisitionResultHideTimer);
        acquisitionResultHideTimer = null;
    }
    el.style.display = 'block';
    el.style.padding = '10px 14px';
    el.style.borderRadius = 'var(--radius)';
    el.style.fontSize = '13px';
    if (type === 'success') {
        el.style.background = 'var(--success-bg)';
        el.style.color = 'var(--success-text)';
        el.style.border = '1px solid #b7d98b';
    } else {
        el.style.background = 'var(--danger-bg)';
        el.style.color = 'var(--danger-text)';
        el.style.border = '1px solid #f7c1c1';
    }
    el.textContent = message;

    if (type === 'success') {
        acquisitionResultHideTimer = setTimeout(() => {
            el.style.display = 'none';
            acquisitionResultHideTimer = null;
        }, 2500);
    }
}

function setAcquisitionModalLoading(isLoading) {
    const btn = document.getElementById('modalSaveBtn');
    if (!btn) return;
    btn.disabled = isLoading;
    btn.classList.toggle('loading', isLoading);
    btn.innerHTML = isLoading
        ? '<span class="spinner"></span> Saving...'
        : (approvingAcquisition ? 'Approve & Add to Inventory' : 'Save');
}

async function submitAcquisitionRequest() {
    const vin = document.getElementById('acqVin').value.trim().toUpperCase();
    const purchasePrice = parseFloat(document.getElementById('acqPurchasePrice').value);
    const notes = document.getElementById('acqNotes').value.trim();

    if (!vin || Number.isNaN(purchasePrice)) {
        showAcquisitionRequestResult('error', 'Please fill in VIN and purchase price.');
        return;
    }

    try {
        const existingVehicle = await db.inventory.getMaybeByVin(vin);
        if (!existingVehicle) {
            await db.inventory.insert({
                vin,
                year: new Date().getFullYear(),
                make: null,
                model: 'Pending Acquisition',
                mileage: 0,
                listed_sale: purchasePrice,
                status: 'Pending',
                comments: notes || null,
            });
        }

        await db.acquisitions.insert({
            vin,
            purchase_price: purchasePrice,
            status: 'Pending',
            salesman_id: currentUser.user_id,
            notes: notes || null,
        });

        showAcquisitionRequestResult('success', `Request submitted for VIN ${vin}.`);
        clearAcquisitionRequestForm(false);
        await loadAcquisitions();
        await loadDashboard();
    } catch (err) {
        showAcquisitionRequestResult('error', 'Submission failed: ' + err.message);
    }
}

async function denyAcquisition(acquisitionId) {
    if (!confirm('Deny this acquisition request?')) return;
    try {
        const acquisition = await db.acquisitions.getById(acquisitionId);
        try {
            const vehicle = await db.inventory.getMaybeByVin(acquisition.vin);
            if (vehicle && vehicle.status === 'Pending' && vehicle.model === 'Pending Acquisition') {
                await db.inventory.delete(acquisition.vin);
            }
        } catch (_inventoryErr) {
            // If the placeholder inventory row is missing, there is nothing to clean up.
        }

        acquisitionLoading = { id: acquisitionId, action: 'deny' };
        renderAcquisitionsAdmin();
        await db.acquisitions.deny(acquisitionId);
        acquisitionLoading = { id: null, action: null };
        await loadAcquisitions();
        await loadInventory();
        await loadDashboard();
    } catch (err) {
        acquisitionLoading = { id: null, action: null };
        renderAcquisitionsAdmin();
        alert('Deny failed: ' + err.message);
    }
}

document.getElementById('statusFilter').addEventListener('change', () => renderTable());
document.getElementById('searchInput').addEventListener('input', () => renderTable());

// ── Transactions ─────────────────────────────────────
async function loadTransactions() {
    const tbody = document.getElementById('transactionsBody');
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">&#9723;</div><div class="empty-title">Loading...</div></div></td></tr>`;

    try {
        // fetch all three sources in parallel
        const [sales, acquisitions, transactions] = await Promise.all([
            db.sales.getAll(),
            db.acquisitions.getAll(),
            db.transactions.getAll(),
        ]);
        
        // normalize sales into a common shape
        const saleRows = sales.map(s => ({
            type: 'Sale',
            id: s.sale_id,
            vehicle: s.vehicle_inventory
                ? `${s.vehicle_inventory.year ?? ''} ${s.vehicle_inventory.make ?? ''} ${s.vehicle_inventory.model ?? ''}`.trim()
                : '—',
            vin: s.vin ?? '—',
            customerOrNotes: s.customer_records ? s.customer_records.customer_name : '—',
            amount: s.amount_sold,
            date: s.date_time,
            status: s.status ?? '—',
            typeCss: 'type-sale',
        }));

        // normalize acquisitions — trade-ins and regular acquisitions
        const acqRows = acquisitions.map(a => {
            const isTradeIn = a.notes && a.notes.includes('Value:');    
            return {
                type: isTradeIn ? 'Trade-In' : 'Acquisition',
                id: a.acquisition_id,
                vehicle: a.vehicle_inventory
                    ? `${a.vehicle_inventory.year ?? ''} ${a.vehicle_inventory.make ?? ''} ${a.vehicle_inventory.model ?? ''}`.trim()
                    : '—',
                vin: a.vin ?? '—',
                customerOrNotes: a.notes ? a.notes.substring(0, 60) + (a.notes.length > 60 ? '…' : '') : '—',
                amount: a.purchase_price,
                date: a.created_at,
                status: a.status ?? '—',
                typeCss: isTradeIn ? 'type-tradein' : 'type-acquisition',
            };
        });

        // merge and sort by date, newest first
        const transRows = transactions.map(t => ({
            type: t.transaction_type,
            id: t.transaction_id,
            vehicle: t.vehicle_id ?? '—',
            vin: t.vehicle_id ?? '—',
            customerOrNotes: '—',
            amount: null,
            date: t.transaction_date,
            status: t.transaction_status,
            typeCss: 'type-acquisition',
        }));

        const all = [...saleRows, ...acqRows, ...transRows].sort((a, b) => {
            return new Date(b.date ?? 0) - new Date(a.date ?? 0);
        });


        // update summary cards
        const totalRevenue = saleRows.reduce((sum, r) => sum + (r.amount ?? 0), 0);
        const totalSpend = acqRows.reduce((sum, r) => sum + (r.amount ?? 0), 0);
        document.getElementById('transSummary').innerHTML = `
            <div class="sum-card"><div class="sum-label">Total Records</div><div class="sum-val">${all.length}</div></div>
            <div class="sum-card"><div class="sum-label">Sales Revenue</div><div class="sum-val">$${totalRevenue.toLocaleString()}</div></div>
            <div class="sum-card"><div class="sum-label">Acquisitions / Trade-Ins</div><div class="sum-val">${acqRows.length}</div></div>
            <div class="sum-card"><div class="sum-label">Total Spend</div><div class="sum-val">$${totalSpend.toLocaleString()}</div></div>
        `;

        if (!all.length) {
            tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">&#9723;</div><div class="empty-title">No records yet</div><div class="empty-sub">Sales, acquisitions, and trade-ins will appear here.</div></div></td></tr>`;
            return;
        }

        tbody.innerHTML = all.map(r => `
            <tr>
                <td><span class="status ${r.typeCss}">${r.type}</span></td>
                <td>${r.id}</td>
                <td>${r.vehicle}</td>
                <td class="vin">${r.vin}</td>
                <td style="max-width:200px; font-size:12px; color:var(--muted);">${r.customerOrNotes}</td>
                <td>${r.amount != null ? '$' + r.amount.toLocaleString() : '—'}</td>
                <td>${r.date ? new Date(r.date).toLocaleDateString() : '—'}</td>
                <td><span class="status s-${r.status?.toLowerCase()}">${r.status}</span></td>
            </tr>
        `).join('');

    } catch (err) {
        console.error('Failed to load transactions:', err.message);
        tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-title">Failed to load</div><div class="empty-sub">${err.message}</div></div></td></tr>`;
    }
}

function updateTransactionStatus(transactionId, currentStatus, newStatus) {
  if (!TRANSACTION_STATES.includes(newStatus)) {
    throw new Error('Invalid transaction state');
  }

  const allowed = TRANSACTION_FLOW[currentStatus] || [];
  if (!allowed.includes(newStatus)) {
    throw new Error(`Cannot move from ${currentStatus} to ${newStatus}`);
  }

  return db.transactions.update(transactionId, {
    transaction_status: newStatus
  });
}

async function advanceTransaction(id, currentStatus, newStatus) {
  try {
    await updateTransactionStatus(id, currentStatus, newStatus);
    await loadTransactions(); //refreshes list for updated status
  } catch (err) {
    alert(err.message);
  }
}

// ── My Sales ──────────────────────────────────────────
async function loadMySales() {
    const tbody = document.getElementById('mysalesBody');
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">&#9723;</div><div class="empty-title">Loading...</div></div></td></tr>`;
    try {
        const sales = await db.sales.getAll();
        console.log('All sales:', sales);
        console.log('Current user id:', currentUser.user_id, typeof currentUser.user_id);
        console.log('First sale salesman_id:', sales[0]?.salesman_id, typeof sales[0]?.salesman_id);
        const mine = sales.filter(s => String(s.salesman_id) === String(currentUser.user_id));
        if (!mine.length) {
            tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">&#9723;</div><div class="empty-title">No sales yet</div><div class="empty-sub">Your sales will appear here once recorded.</div></div></td></tr>`;
            document.getElementById('mySalesSummary').innerHTML = `
                <div class="sum-card"><div class="sum-label">My Total Sales</div><div class="sum-val">0</div></div>
                <div class="sum-card"><div class="sum-label">My Revenue</div><div class="sum-val">$0</div></div>
                <div class="sum-card"><div class="sum-label">Finalized</div><div class="sum-val">0</div></div>
                <div class="sum-card"><div class="sum-label">Pending</div><div class="sum-val">0</div></div>
            `;
            return;
        }
        const total = mine.reduce((sum, s) => sum + (s.amount_sold ?? 0), 0);
        const finalized = mine.filter(s => s.status === 'Finalized').length;
        const pending = mine.filter(s => s.status === 'Pending').length;
        document.getElementById('mySalesSummary').innerHTML = `
            <div class="sum-card"><div class="sum-label">My Total Sales</div><div class="sum-val">${mine.length}</div></div>
            <div class="sum-card"><div class="sum-label">My Revenue</div><div class="sum-val">$${total.toLocaleString()}</div></div>
            <div class="sum-card"><div class="sum-label">Finalized</div><div class="sum-val">${finalized}</div></div>
            <div class="sum-card"><div class="sum-label">Pending</div><div class="sum-val">${pending}</div></div>
        `;
        tbody.innerHTML = mine.map(s => `
            <tr>
                <td>${s.sale_id}</td>
                <td>${s.vehicle_inventory ? s.vehicle_inventory.year + ' ' + (s.vehicle_inventory.make ?? '') + ' ' + s.vehicle_inventory.model : '—'}</td>
                <td class="vin">${s.vin ?? '—'}</td>
                <td>${s.customer_records ? s.customer_records.customer_name : '—'}</td>
                <td>${s.amount_sold != null ? '$' + s.amount_sold.toLocaleString() : '—'}</td>
                <td>${s.date_time ? new Date(s.date_time).toLocaleDateString() : '—'}</td>
                <td><span class="status s-${s.status?.toLowerCase()}">${s.status ?? '—'}</span></td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('Failed to load my sales:', err.message);
        tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-title">Failed to load sales</div><div class="empty-sub">${err.message}</div></div></td></tr>`;
    }
}

function clearTradeInForm() {
    ['tiCustomerName', 'tiYear', 'tiMake', 'tiModel',
     'tiMileage', 'tiCashValue', 'tiLicensePlate']
    .forEach(id => { document.getElementById(id).value = ''; });
    generateTradeInVin();
    document.getElementById('tiResult').style.display = 'none';
}

function hideSaleStatusMessage() {
    const status = document.getElementById('saleStatusMessage');
    if (status) status.style.display = 'none';
}

function showSaleStatusMessage(type, message) {
    const status = document.getElementById('saleStatusMessage');
    const text = document.getElementById('saleStatusText');
    if (!status || !text) return;
    status.style.display = 'block';
    text.textContent = message;
    text.style.color = type === 'success' ? 'var(--success-text)' : 'var(--danger-text)';
    text.style.background = type === 'success' ? 'var(--success-bg)' : 'var(--danger-bg)';
    text.style.border = type === 'success' ? '1px solid #b7d98b' : '1px solid #f7c1c1';
}

function clearSaleForm() {
    ['saleCustomerName', 'saleCustomerPhone', 'saleVin', 'salePrice', 'saleMileage', 'saleDate', 'saleNotes'].forEach(id => {
        document.getElementById(id).value = '';
    });
    document.getElementById('saleDraftId').value = '';
    const picker = document.getElementById('saleVehiclePicker');
    if (picker) picker.value = '';
    const info = document.getElementById('saleSelectedVehicleInfo');
    if (info) info.style.display = 'none';
    const result = document.getElementById('saleResult');
    if (result) result.style.display = 'none';
    hideSaleStatusMessage();
}

function getSaleFormData() {
    return {
        customerName: document.getElementById('saleCustomerName').value.trim(),
        customerPhone: document.getElementById('saleCustomerPhone').value.trim(),
        vin: document.getElementById('saleVin').value.trim().toUpperCase(),
        amount: document.getElementById('salePrice').value.trim(),
        mileage: document.getElementById('saleMileage').value.trim(),
        saleDate: document.getElementById('saleDate').value,
        notes: document.getElementById('saleNotes').value.trim(),
    };
}

function isSaleDraftDirty() {
    const draftId = document.getElementById('saleDraftId').value;
    if (!draftId || !saleFormLoadedDraftSnapshot) return false;
    const current = getSaleFormData();
    return Object.keys(current).some(key => current[key] !== saleFormLoadedDraftSnapshot[key]);
}

function openSaleForm() {
    saleFormLoadedDraftSnapshot = null;
    document.getElementById('saleDraftId').value = '';
    if (document.getElementById('saleFormSection').style.display === 'block' && isSaleDraftDirty()) {
        const save = confirm('You have unsaved draft changes. Press OK to save as a draft, or Cancel to discard them.');
        if (save) saveSaleDraft();
    }
    clearSaleForm();
    hideSaleStatusMessage();
    populateSaleVehiclePicker();
    const section = document.getElementById('saleFormSection');
    section.style.display = 'block';
    document.getElementById('saleDate').value = new Date().toISOString().slice(0, 10);
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function populateSaleVehiclePicker() {
    const picker = document.getElementById('saleVehiclePicker');
    const available = inventory.filter(v => v.status === 'Available');
    picker.innerHTML = `<option value="">— Select a vehicle —</option>` +
        available.map(v => `<option value="${v.vin}">${v.year ?? ''} ${v.make ?? ''} ${v.model ?? ''} — ${v.vin}</option>`).join('');
    picker.onchange = function() {
        const v = inventory.find(x => x.vin === this.value);
        if (!v) {
            document.getElementById('saleSelectedVehicleInfo').style.display = 'none';
            document.getElementById('saleVin').value = '';
            return;
        }
        document.getElementById('saleVin').value = v.vin;
        document.getElementById('saleSelectedVehicleInfo').innerHTML = `
            <div style="display:flex; gap:24px; flex-wrap:wrap;">
                <div><div class="sum-label">Vehicle</div><div style="font-weight:500;">${v.year ?? '—'} ${v.make ?? '—'} ${v.model ?? '—'}</div></div>
                <div><div class="sum-label">VIN</div><div style="font-family:var(--mono); font-size:12px;">${v.vin}</div></div>
                <div><div class="sum-label">Mileage</div><div>${v.mileage != null ? v.mileage.toLocaleString() + ' mi' : '—'}</div></div>
                <div><div class="sum-label">Listed Price</div><div>${v.listed_sale != null ? '$' + v.listed_sale.toLocaleString() : '—'}</div></div>
                <div><div class="sum-label">Status</div><div><span class="status s-${v.status?.toLowerCase()}">${v.status}</span></div></div>
            </div>
        `;
        document.getElementById('saleSelectedVehicleInfo').style.display = 'block';
        if (v.listed_sale) document.getElementById('salePrice').value = v.listed_sale;
        if (v.mileage != null) document.getElementById('saleMileage').value = v.mileage;
    };
}

function closeSaleForm() {
    document.getElementById('saleFormSection').style.display = 'none';
}

function showSaleResult(type, message) {
    const el = document.getElementById('saleResult');
    if (saleResultHideTimer) {
        clearTimeout(saleResultHideTimer);
        saleResultHideTimer = null;
    }
    el.style.display = 'block';
    el.style.padding = '10px 14px';
    el.style.borderRadius = 'var(--radius)';
    el.style.fontSize = '13px';
    if (type === 'success') {
        el.style.background = 'var(--success-bg)';
        el.style.color = 'var(--success-text)';
        el.style.border = '1px solid #b7d98b';
    } else {
        el.style.background = 'var(--danger-bg)';
        el.style.color = 'var(--danger-text)';
        el.style.border = '1px solid #f7c1c1';
    }
    el.textContent = message;

    if (type === 'success') {
        saleResultHideTimer = setTimeout(() => {
            el.style.display = 'none';
            saleResultHideTimer = null;
        }, 2500);
    }
}

function getSaleDrafts() {
    try {
        const key = `saleDrafts_${currentUser.user_id}`;
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : [];
    } catch (err) {
        return [];
    }
}

function saveSaleDrafts(drafts) {
    const key = `saleDrafts_${currentUser.user_id}`;
    localStorage.setItem(key, JSON.stringify(drafts));
}

function saveSaleDraft() {
    const customerName = document.getElementById('saleCustomerName').value.trim();
    const customerPhone = document.getElementById('saleCustomerPhone').value.trim();
    const vin = document.getElementById('saleVin').value.trim().toUpperCase();
    const amount = document.getElementById('salePrice').value.trim();
    const mileage = document.getElementById('saleMileage').value.trim();
    const saleDate = document.getElementById('saleDate').value;
    const notes = document.getElementById('saleNotes').value.trim();
    const draftId = document.getElementById('saleDraftId').value || `draft-${Date.now()}`;

    if (!customerName && !customerPhone && !vin && !amount && !mileage && !saleDate && !notes) {
        showSaleResult('error', 'Enter at least one field before saving a draft.');
        return;
    }

    const vehicle = inventory.find(v => v.vin === vin);
    const vehicleLabel = vehicle ? `${vehicle.year ?? ''} ${vehicle.make ?? ''} ${vehicle.model ?? ''}`.trim() : '';

    if (vehicle && vehicle.status === 'Sold') {
        showSaleResult('error', 'Cannot save a draft for a vehicle that is already sold.');
        return;
    }

    const drafts = getSaleDrafts();
    const existingIndex = drafts.findIndex(d => d.id === draftId);
    const draft = {
        id: draftId,
        createdAt: Date.now(),
        customerName,
        customerPhone,
        vin,
        vehicleLabel,
        amount,
        mileage,
        saleDate,
        notes,
    };

    if (existingIndex >= 0) {
        drafts[existingIndex] = draft;
        document.getElementById('saleDraftId').value = draftId; // keep for further edits
    } else {
        drafts.unshift(draft);
        document.getElementById('saleDraftId').value = ''; // clear for new drafts
    }

    saveSaleDrafts(drafts);
    saleFormLoadedDraftSnapshot = getSaleFormData();
    document.getElementById('saleDraftId').value = draftId;
    renderDraftsList();
    clearSaleForm();
    closeSaleForm();
    showSaleStatusMessage('success', 'Draft saved successfully!');
}

function openDraftsModal() {
    renderDraftsList();
    document.getElementById('draftsModal').classList.add('open');
}

function closeDraftsModal() {
    document.getElementById('draftsModal').classList.remove('open');
}

function openSubmitSaleConfirmModal() {
    document.getElementById('submitSaleConfirmModal').classList.add('open');
}

function closeSubmitSaleConfirmModal() {
    document.getElementById('submitSaleConfirmModal').classList.remove('open');
}

function renderDraftsList() {
    const drafts = getSaleDrafts();
    const container = document.getElementById('draftsList');
    if (!drafts.length) {
        container.innerHTML = `
            <div class="empty-state" style="padding:24px; text-align:left;">
              <div class="empty-icon">&#9723;</div>
              <div class="empty-title">No saved drafts</div>
              <div class="empty-sub">Save sale drafts and return to them later.</div>
            </div>
        `;
        return;
    }

    container.innerHTML = `
      <table style="width:100%; border-collapse:collapse;">
        <thead>
          <tr>
            <th style="padding:10px; text-align:left; border-bottom:1px solid var(--border);">Draft</th>
            <th style="padding:10px; text-align:left; border-bottom:1px solid var(--border);">Amount</th>
            <th style="padding:10px; text-align:left; border-bottom:1px solid var(--border);">Vehicle</th>
            <th style="padding:10px; text-align:left; border-bottom:1px solid var(--border);">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${drafts.map(d => `
            <tr>
              <td style="padding:10px; border-bottom:1px solid var(--border);">${d.customerName || 'Untitled draft'}</td>
              <td style="padding:10px; border-bottom:1px solid var(--border);">${d.amount ? '$' + Number(d.amount).toLocaleString() : '—'}</td>
              <td style="padding:10px; border-bottom:1px solid var(--border);">${d.vehicleLabel || d.vin || '—'}</td>
              <td style="padding:10px; border-bottom:1px solid var(--border);">
                <button class="btn-sm" onclick="editDraft('${d.id}')">Edit</button>
                <button class="btn-sm" style="color:var(--danger-text); border-color:#f7c1c1;" onclick="deleteDraft('${d.id}')">Delete</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
}

function editDraft(id) {
    const drafts = getSaleDrafts();
    const draft = drafts.find(d => d.id === id);
    if (!draft) return;

    openSaleForm();
    document.getElementById('saleDraftId').value = draft.id;
    document.getElementById('saleCustomerName').value = draft.customerName;
    document.getElementById('saleCustomerPhone').value = draft.customerPhone;

    const picker = document.getElementById('saleVehiclePicker');
    if (picker && draft.vin) {
        picker.value = draft.vin;
        picker.dispatchEvent(new Event('change'));
    } else {
        document.getElementById('saleVin').value = draft.vin || '';
    }

    document.getElementById('salePrice').value = draft.amount;
    document.getElementById('saleMileage').value = draft.mileage || '';
    document.getElementById('saleDate').value = draft.saleDate || '';
    document.getElementById('saleNotes').value = draft.notes;
    saleFormLoadedDraftSnapshot = getSaleFormData();
    closeDraftsModal();
}

function deleteDraft(id) {
    const drafts = getSaleDrafts().filter(d => d.id !== id);
    saveSaleDrafts(drafts);
    renderDraftsList();
}

async function submitSale() {
    const customerName = document.getElementById('saleCustomerName').value.trim();
    const customerPhone = document.getElementById('saleCustomerPhone').value.trim();
    const vin = document.getElementById('saleVin').value.trim().toUpperCase();
    const amount = Number(document.getElementById('salePrice').value);
    const mileage = parseInt(document.getElementById('saleMileage').value, 10);
    const saleDate = document.getElementById('saleDate').value;
    const notes = document.getElementById('saleNotes').value.trim();
    const draftId = document.getElementById('saleDraftId').value;

    if (!customerName || !vin || !amount || !saleDate) {
        showSaleResult('error', 'Please select a vehicle, enter customer name, price, and date.');
        return;
    }

    let vehicle;
    try {
        vehicle = await db.inventory.getByVin(vin);
    } catch (err) {
        showSaleResult('error', 'No vehicle found with that VIN in inventory. Please verify the VIN.');
        return;
    }

    if (!vehicle) {
        showSaleResult('error', 'No vehicle found with that VIN in inventory. Please verify the VIN.');
        return;
    }

    if (vehicle.status === 'Sold') {
        showSaleResult('error', 'This vehicle is already marked as sold in inventory.');
        return;
    }

    let inventoryUpdated = false;

    try {
        const previousStatus = vehicle.status;
        const updatePayload = { status: 'Sold' };
        if (!Number.isNaN(mileage)) {
            updatePayload.mileage = mileage;
        }
        await db.inventory.update(vin, updatePayload);
        inventoryUpdated = true;

        const customer = await db.customers.insert({
            customer_name: customerName,
            phone: customerPhone || null,
        });

        await db.sales.insert({
            vin: vin,
            customer_id: customer.customer_id,
            salesman_id: currentUser.user_id,
            amount_sold: amount,
            status: 'Finalized',
            date_time: saleDate,
            notes: notes || null,
        });

        if (draftId) {
            const drafts = getSaleDrafts().filter(d => d.id !== draftId);
            saveSaleDrafts(drafts);
            renderDraftsList();
        }

        await loadInventory();
        const v = inventory.find(x => x.vin === vin);
        const label = v ? `${v.year ?? ''} ${v.make ?? ''} ${v.model ?? ''}`.trim() : vin;
        clearSaleForm();
        closeSaleForm();
        showSaleStatusMessage('success', 'Sale submitted successfully!');
        loadMySales();
    } catch (err) {
        if (inventoryUpdated) {
            try {
                await db.inventory.update(vin, { status: previousStatus });
            } catch (rollbackErr) {
                console.error('Failed to revert inventory status:', rollbackErr.message);
            }
        }
        console.error('Sale submission failed:', err.message);
        showSaleResult('error', 'Submission failed: ' + err.message);
    }
}

function generateTradeInVin() {
    const chars = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
    let vin = 'TI'; // prefix so trade-ins are identifiable
    for (let i = 0; i < 15; i++) vin += chars[Math.floor(Math.random() * chars.length)];
    document.getElementById('tiVin').value = vin;
}

async function submitTradeIn() {
    const customerName = document.getElementById('tiCustomerName').value.trim();
    const year = parseInt(document.getElementById('tiYear').value);
    const make = document.getElementById('tiMake').value.trim();
    const model = document.getElementById('tiModel').value.trim();
    const mileage = parseInt(document.getElementById('tiMileage').value) || 0;
    const value = parseFloat(document.getElementById('tiCashValue').value) || 0;
    const license_plate = document.getElementById('tiLicensePlate').value.trim().toUpperCase() || null;
    const notes = '';
    const vin = document.getElementById('tiVin').value.trim();

    if (!customerName || !year || !model || !vin) {
        showTradeInResult('error', 'Please fill in customer name, year, and model.');
        return;
    }

    const fullNotes = `Customer: ${customerName} | Value: $${value.toLocaleString()}${notes ? ' | Notes: ' + notes : ''}`;

    const vinField = document.getElementById('tiVin');
        if (!vinField.value) {
        vinField.value = generateVin();
    }
    try {
        let vehicleExists = false;
        const existingVehicle = await db.inventory.getMaybeByVin(vin);
        vehicleExists = !!existingVehicle;

        if (!vehicleExists) {
            await db.inventory.insert({
                vin, year, make: make || null, model, mileage,
                listed_sale: value, status: 'Pending', license_plate,
            });
        }

        await db.acquisitions.insert({
            vin, purchase_price: value, status: 'Pending',
            salesman_id: currentUser.user_id, notes: fullNotes,
        });

        await db.log.write(currentUser.user_id,
            `Trade-in submitted: ${year} ${make} ${model} (${vin}) by ${customerName}`, null);

        showTradeInResult('success', `Trade-in submitted for ${year} ${make} ${model}.`);
        clearTradeInForm();
    } catch (err) {
        console.error('Trade-in submission failed:', err.message);
        showTradeInResult('error', 'Submission failed: ' + err.message);
    }
}

function showTradeInResult(type, message) {
    const el = document.getElementById('tiResult');
    el.style.display = 'block';
    el.style.padding = '10px 14px';
    el.style.borderRadius = 'var(--radius)';
    el.style.fontSize = '13px';
    if (type === 'success') {
        el.style.background = 'var(--success-bg)';
        el.style.color = 'var(--success-text)';
        el.style.border = '1px solid #b7d98b';
    } else {
        el.style.background = 'var(--danger-bg)';
        el.style.color = 'var(--danger-text)';
        el.style.border = '1px solid #f7c1c1';
    }
    el.textContent = message;
}

function getTimeFilterRange() {
    const val = document.getElementById('dashTimeFilter')?.value ?? 'all';
    if (val === 'all') return null;
    const now = new Date();
    const start = new Date();
    if (val === 'week') {
        const day = now.getDay();
        start.setDate(now.getDate() - day);
    } else if (val === 'month') {
        start.setDate(1);
    } else if (val === 'quarter') {
        const q = Math.floor(now.getMonth() / 3);
        start.setMonth(q * 3, 1);
    } else if (val === 'year') {
        start.setMonth(0, 1);
    }
    start.setHours(0, 0, 0, 0);
    return start;
}

// ── Dashboard ─────────────────────────────────────────
async function loadDashboard() {
    try {
        const [inventoryData, sales, acquisitions, logEntries] = await Promise.all([
            db.inventory.getAll(),
            db.sales.getAll(),
            db.acquisitions.getAll(),
            db.log.getAll(),
        ]);

        const filterStart = getTimeFilterRange();
        const filterSales = filterStart
            ? sales.filter(s => s.date_time && new Date(s.date_time) >= filterStart)
            : sales;
        const filterAcq = filterStart
            ? acquisitions.filter(a => a.created_at && new Date(a.created_at) >= filterStart)
            : acquisitions;

        document.getElementById('dashTotal').textContent = inventoryData.filter(v => v.status !== 'Sold').length;
        document.getElementById('dashAvailable').textContent = inventoryData.filter(v => v.status === 'Available').length;
        document.getElementById('dashSales').textContent = filterSales.length;
        const revenue = filterSales.reduce((sum, s) => sum + (s.amount_sold ?? 0), 0);
        document.getElementById('dashRevenue').textContent = '$' + revenue.toLocaleString();

        document.getElementById('dashPending').textContent = inventoryData.filter(v => v.status === 'Pending').length;
        const tradeIns = filterAcq.filter(a => a.notes && a.notes.includes('Value:'));
        const regularAcq = filterAcq.filter(a => !a.notes || !a.notes.includes('Value:'));
        document.getElementById('dashAcquisitions').textContent = regularAcq.length;
        document.getElementById('dashTradeIns').textContent = tradeIns.length;

        document.getElementById('dashBreakAvailable').textContent = inventoryData.filter(v => v.status === 'Available').length;
        document.getElementById('dashBreakPending').textContent = inventoryData.filter(v => v.status === 'Pending').length;
        document.getElementById('dashBreakSold').textContent = inventoryData.filter(v => v.status === 'Sold').length;

        const recentSales = filterSales.slice(0, 5);
        document.getElementById('dashRecentSales').innerHTML = recentSales.length ? recentSales.map(s => `
            <tr>
                <td style="font-size:12px;">${s.vehicle_inventory ? s.vehicle_inventory.year + ' ' + (s.vehicle_inventory.make ?? '') + ' ' + s.vehicle_inventory.model : s.vin}</td>
                <td>${s.amount_sold != null ? '$' + s.amount_sold.toLocaleString() : '—'}</td>
                <td style="font-size:12px; color:var(--muted);">${s.date_time ? new Date(s.date_time).toLocaleDateString() : '—'}</td>
                <td><span class="status s-${s.status?.toLowerCase()}">${s.status ?? '—'}</span></td>
            </tr>
        `).join('') : `<tr><td colspan="4"><div class="empty-state" style="padding:24px;"><div class="empty-title" style="font-size:13px;">No sales yet</div></div></td></tr>`;

        const recentAcq = filterAcq.slice(0, 5);
        document.getElementById('dashRecentAcquisitions').innerHTML = recentAcq.length ? recentAcq.map(a => {
            const isTradeIn = a.notes && a.notes.includes('Value:');
            return `<tr>
                <td class="vin" style="font-size:11px;">${a.vin ?? '—'}</td>
                <td><span class="status ${isTradeIn ? 'type-tradein' : 'type-acquisition'}">${isTradeIn ? 'Trade-In' : 'Acquisition'}</span></td>
                <td style="font-size:12px; color:var(--muted);">${a.created_at ? new Date(a.created_at).toLocaleDateString() : '—'}</td>
                <td><span class="status s-${a.status?.toLowerCase()}">${a.status ?? '—'}</span></td>
            </tr>`;
        }).join('') : `<tr><td colspan="4"><div class="empty-state" style="padding:24px;"><div class="empty-title" style="font-size:13px;">No acquisitions yet</div></div></td></tr>`;

        // Charts
        renderRevenueChart(filterSales);
        renderStatusChart(inventoryData);

        // Activity log
        const logEl = document.getElementById('dashActivityLog');
        if (logEl) {
            const recent = logEntries.slice(0, 10);
            logEl.innerHTML = recent.length ? recent.map(e => `
                <tr>
                    <td style="font-size:12px; color:var(--muted);">${e.timestamp ? new Date(e.timestamp).toLocaleString() : '—'}</td>
                    <td style="font-size:12px;">${e.users?.username ?? 'System'}</td>
                    <td style="font-size:12px;">${e.message}</td>
                </tr>
            `).join('') : `<tr><td colspan="3"><div class="empty-state" style="padding:24px;"><div class="empty-title" style="font-size:13px;">No activity yet</div></div></td></tr>`;
        }

    } catch (err) {
        console.error('Failed to load dashboard:', err.message);
    }
}


// ── Dashboard Charts ──────────────────────────────────
let _revenueChart = null;
let _statusChart = null;

function renderRevenueChart(sales) {
    const ctx = document.getElementById('dashRevenueChart');
    if (!ctx) return;
    if (_revenueChart) { _revenueChart.destroy(); _revenueChart = null; }

    const recent = sales.slice(0, 10).reverse();
    const labels = recent.map(s => {
        const d = s.date_time ? new Date(s.date_time) : null;
        return d ? (d.getMonth() + 1) + '/' + d.getDate() : s.sale_id;
    });
    const data = recent.map(s => s.amount_sold ?? 0);

    _revenueChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Sale Amount',
                data,
                backgroundColor: '#1a3fa6',
                borderRadius: 4,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => '$' + ctx.parsed.y.toLocaleString()
                    }
                }
            },
            scales: {
                x: { ticks: { font: { size: 11 }, autoSkip: false, maxRotation: 45 }, grid: { display: false } },
                y: {
                    ticks: { font: { size: 11 }, callback: v => '$' + v.toLocaleString() },
                    beginAtZero: true
                }
            }
        }
    });
}

function renderStatusChart(inventoryData) {
    const ctx = document.getElementById('dashStatusChart');
    if (!ctx) return;
    if (_statusChart) { _statusChart.destroy(); _statusChart = null; }

    const available = inventoryData.filter(v => v.status === 'Available').length;
    const pending = inventoryData.filter(v => v.status === 'Pending').length;

    _statusChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Available', 'Pending'],
            datasets: [{ data: [available, pending], backgroundColor: ['#3b6d11', '#854f0b'], borderWidth: 0 }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: {
                    position: 'right',
                    labels: { font: { size: 11 }, boxWidth: 10, padding: 12 }
                }
            }
        }
    });
}

function openCreateUserModal() {
  document.getElementById("createUserModal").style.display = "flex";
}

function closeCreateUserModal() {
  document.getElementById("createUserModal").style.display = "none";
}

async function createUser() {
  const username = document.getElementById("newUsername").value.trim().toLowerCase();
  const password = document.getElementById("newPassword").value;
  let role = document.getElementById("newUserRole").value;

  if (!username || !password) {
    alert("Missing username or password");
    return;
  }

  // Capitalize role for database constraint
  role = role.charAt(0).toUpperCase() + role.slice(1);

  try {
    await db.users.create(username, password, role);

    closeCreateUserModal();

    // refresh table
    if (typeof loadUsers === "function") loadUsers();

    alert("User created!");
  } catch (err) {
    console.error(err);
    alert("Failed to create user");
  }
}

// ── Customers ─────────────────────────────────────────
let customersCache = [];

async function loadCustomers() {
    const tbody = document.getElementById('customersBody');
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">&#9723;</div><div class="empty-title">Loading...</div></div></td></tr>`;
    try {
        const data = await db.customers.getAll();
        customersCache = data ?? [];
        renderCustomersStats();
        renderCustomersTable();
    } catch (err) {
        console.error('Failed to load customers:', err.message);
        tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-title">Failed to load</div><div class="empty-sub">${err.message}</div></div></td></tr>`;
    }
}

function renderCustomersStats() {
    const total = customersCache.length;
    const withOwed = customersCache.filter(c => c.amount_owed && c.amount_owed !== 0).length;
    const withPhone = customersCache.filter(c => c.phone).length;
    document.getElementById('statCustomersTotal').textContent = total;
    document.getElementById('statCustomersOwed').textContent = withOwed;
    document.getElementById('statCustomersPhone').textContent = withPhone;
}

function renderCustomersTable() {
    const q = document.getElementById('customerSearchInput')?.value?.toLowerCase() || '';
    const filtered = customersCache.filter(c =>
        !q ||
        (c.customer_name ?? '').toLowerCase().includes(q) ||
        (c.phone ?? '').toLowerCase().includes(q)
    );

    const tbody = document.getElementById('customersBody');
    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">&#9723;</div><div class="empty-title">No customers found</div></div></td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(c => {
        const owed = c.amount_owed ?? 0;
        const owedDisplay = owed === 0
            ? '<span style="color:var(--muted);">—</span>'
            : `<span style="color:${owed < 0 ? 'var(--success-text)' : 'var(--danger-text)'}; font-weight:500;">${owed < 0 ? '-' : ''}$${Math.abs(owed).toLocaleString()}</span>`;
        return `
            <tr>
                <td style="color:var(--muted); font-size:12px;">${c.customer_id}</td>
                <td>${c.customer_name ?? '—'}</td>
                <td style="color:var(--muted);">${c.phone ?? '—'}</td>
                <td>${owedDisplay}</td>
                <td class="vin">${c.vin ?? '—'}</td>
            </tr>
        `;
    }).join('');
}
