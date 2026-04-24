// ── Auth ──────────────────────────────────────────────
let currentUser = null;

// Maps DB role values to CSS class names used in styles.css
const ROLE_CSS = {
    admin: 'admin',
    employee: 'employee',
    'sales rep': 'employee',
    salesrep: 'employee',
};

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
            currentUser = user; // { user_id, username, role }
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('app').classList.add('visible');
            const badge = document.getElementById('headerRoleBadge');
            badge.textContent = currentUser.role;
            badge.className = 'role-badge role-' + getRoleCssClass(currentUser.role);
            document.getElementById('headerUserName').textContent = currentUser.username;
            if (isAdminRole(currentUser.role)) {
                document.getElementById('actionsHeader').textContent = 'Actions';
                document.getElementById('addVehicleBtn').style.display = 'flex';
            }
            await loadInventory();
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
    document.getElementById('app').classList.remove('visible');
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('loginUser').value = '';
    document.getElementById('loginPass').value = '';
    document.getElementById('loginError').style.display = 'none';
    document.getElementById('actionsHeader').textContent = '';
}

document.getElementById('loginPass').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
});

// ── Inventory data ────────────────────────────────────
// Populated from Supabase on login via loadInventory()
let inventory = [];
let editingVin = null;
let editingAcquisitionId = null;
let employeeAcquisitionScope = 'mine';
let approvingAcquisition = null;

async function loadInventory() {
    try {
        inventory = await db.inventory.getAll();
        renderTable();
        renderStats();
    } catch (err) {
        console.error('Failed to load inventory:', err.message);
    }
}

function renderStats() {
    document.getElementById('statTotal').textContent = inventory.length;
    document.getElementById('statAvailable').textContent = inventory.filter(v => v.status === 'Available').length;
    document.getElementById('statSold').textContent = inventory.filter(v => v.status === 'Sold').length;
}

function renderTable() {
    const q = document.getElementById('searchInput').value.toLowerCase();
    const statusF = document.getElementById('statusFilter').value;
    const isAdmin = isAdminRole(currentUser?.role);

    const filtered = inventory.filter(v => {
        const matchSearch = !q || (v.make ?? '').toLowerCase().includes(q) || (v.model ?? '').toLowerCase().includes(q) || (v.vin ?? '').toLowerCase().includes(q);
        const matchStatus = !statusF || v.status === statusF;
        return matchSearch && matchStatus;
    });

    const tbody = document.getElementById('inventoryBody');

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">&#9723;</div><div class="empty-title">No vehicles found</div><div class="empty-sub">Try adjusting your search or filters.</div></div></td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(v => `
        <tr>
            <td>${v.year ?? '—'} ${v.make ?? '—'} ${v.model ?? '—'}</td>
            <td class="vin">${v.vin}</td>
            <td>${v.mileage != null ? v.mileage.toLocaleString() + ' mi' : '—'}</td>
            <td>${v.listed_sale != null ? '$' + v.listed_sale.toLocaleString() : '—'}</td>
            <td><span class="status s-${v.status?.toLowerCase()}">${v.status ?? '—'}</span></td>
            <td>${isAdmin ? `<div class="action-btns"><button class="btn-sm" onclick="openEditModal('${v.vin}')">Edit</button><button class="btn-sm danger" onclick="deleteVehicle('${v.vin}')">Remove</button></div>` : ''}</td>
        </tr>
    `).join('');
}

// ── Modal ─────────────────────────────────────────────
function openAddModal() {
    editingVin = null;
    approvingAcquisition = null;
    document.getElementById('modalTitle').textContent = 'Add vehicle';
    document.getElementById('modalSaveBtn').textContent = 'Save';
    ['fYear', 'fMake', 'fModel', 'fVin', 'fMileage', 'fPrice'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('fStatus').value = 'Available';
    document.getElementById('modal').classList.add('open');
}

async function openAcquisitionApprovalModal(acquisitionId) {
    try {
        const acq = await db.acquisitions.getById(acquisitionId);
        approvingAcquisition = acq;
        editingVin = null;

        document.getElementById('modalTitle').textContent = 'Approve acquisition';
        document.getElementById('modalSaveBtn').textContent = 'Approve & Add to Inventory';

        document.getElementById('fYear').value = '';
        document.getElementById('fMake').value = '';
        document.getElementById('fModel').value = '';
        document.getElementById('fVin').value = acq.vin ?? '';
        document.getElementById('fMileage').value = '';
        document.getElementById('fPrice').value = acq.purchase_price ?? '';
        document.getElementById('fStatus').value = 'Available';

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
    document.getElementById('modal').classList.add('open');
}

function closeModal() {
    approvingAcquisition = null;
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

    if (!year || !model || !vin) {
        alert('Please fill in year, model, and VIN.');
        return;
    }

    try {
        if (editingVin) {
            await db.inventory.update(editingVin, { year, make, model, mileage, listed_sale, status });
        } else if (approvingAcquisition) {
            await db.inventory.insert({ vin, year, make, model, mileage, listed_sale, status });
            try {
                await db.acquisitions.approve(approvingAcquisition.acquisition_id);
            } catch (approveErr) {
                try {
                    await db.inventory.delete(vin);
                } catch (rollbackErr) {
                    console.warn('Inventory rollback failed after approval error:', rollbackErr.message);
                }
                throw approveErr;
            }
        } else {
            await db.inventory.insert({ vin, year, make, model, mileage, listed_sale, status });
        }
        closeModal();
        await loadInventory();
        await loadAcquisitions();
    } catch (err) {
        alert('Save failed: ' + err.message);
    }
}

async function deleteVehicle(vin) {
    if (!confirm('Remove this vehicle from inventory?')) return;
    try {
        await db.inventory.delete(vin);
        await loadInventory();
    } catch (err) {
        alert('Delete failed: ' + err.message);
    }
}

// Close modal on backdrop click
document.getElementById('modal').addEventListener('click', function (e) {
    if (e.target === this) closeModal();
});

document.getElementById('acqModal').addEventListener('click', function (e) {
    if (e.target === this) closeAcquisitionEditModal();
});

// ── Tab Navigation ──────────────────────────────────
async function switchTab(tab) {
  const pages = {
    dashboard: document.getElementById('dashboardPage'),
    inventory: document.getElementById('inventoryPage'),
        acquisitions: document.getElementById('acquisitionsPage'),
    mysales: document.getElementById('mysalesPage'),
    transactions: document.getElementById('transactionsPage'),
    tradein: document.getElementById('tradeinPage'),
  };
  const tabs = document.querySelectorAll('.tab-btn');
    const order = ['dashboard', 'inventory', 'acquisitions', 'mysales', 'transactions', 'tradein'];

  Object.values(pages).forEach(p => p.style.display = 'none');
  tabs.forEach(t => t.classList.remove('active'));

  pages[tab].style.display = 'block';
  tabs[order.indexOf(tab)].classList.add('active');

  if (tab === 'dashboard') await loadDashboard();
    if (tab === 'acquisitions') await loadAcquisitions();
  if (tab === 'transactions') await loadTransactions();
  if (tab === 'mysales') await loadMySales();
}

// ── Filters ──────────────────────────────────────────
function clearFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('statusFilter').value = '';
    renderTable();
}

// ── Acquisitions ─────────────────────────────────────
async function loadAcquisitions() {
    const roleLabel = document.getElementById('acqRoleLabel');
    roleLabel.textContent = currentUser?.role ?? '';
    roleLabel.className = 'role-badge role-' + getRoleCssClass(currentUser?.role);

    const isAdmin = isAdminRole(currentUser?.role);
    document.getElementById('acqAdminView').style.display = isAdmin ? 'block' : 'none';
    document.getElementById('acqEmployeeView').style.display = isAdmin ? 'none' : 'block';

    try {
        const acquisitions = await db.acquisitions.getAll();
        if (isAdmin) {
            renderAcquisitionsAdmin(acquisitions);
        } else {
            renderAcquisitionsEmployee(acquisitions);
        }
    } catch (err) {
        console.error('Failed to load acquisitions:', err.message);
        const targetBodyId = isAdmin ? 'acqAdminBody' : 'acqEmployeeBody';
        const colspan = isAdmin ? 8 : 7;
        document.getElementById(targetBodyId).innerHTML = `<tr><td colspan="${colspan}"><div class="empty-state"><div class="empty-title">Failed to load</div><div class="empty-sub">${err.message}</div></div></td></tr>`;
    }
}

function setEmployeeAcquisitionScope(scope) {
    if (scope !== 'mine' && scope !== 'all') return;
    employeeAcquisitionScope = scope;
    loadAcquisitions();
}

function renderAcquisitionsAdmin(acquisitions) {
    const pending = acquisitions.filter(a => a.status === 'Pending').length;
    const approved = acquisitions.filter(a => a.status === 'Approved').length;
    const denied = acquisitions.filter(a => a.status === 'Denied').length;
    const pendingRows = acquisitions.filter(a => a.status === 'Pending');
    const approvedRows = acquisitions.filter(a => a.status === 'Approved');
    document.getElementById('acqAdminSummary').innerHTML = `
        <div class="sum-card"><div class="sum-label">Pending Approval</div><div class="sum-val">${pending}</div></div>
        <div class="sum-card"><div class="sum-label">Approved</div><div class="sum-val">${approved}</div></div>
        <div class="sum-card"><div class="sum-label">Denied</div><div class="sum-val">${denied}</div></div>
    `;

    const body = document.getElementById('acqAdminBody');
    if (!pendingRows.length) {
        body.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">&#9723;</div><div class="empty-title">No pending approvals</div><div class="empty-sub">New employee acquisition requests will appear here.</div></div></td></tr>`;
    } else {
        body.innerHTML = pendingRows.map(a => `
        <tr>
            <td>${a.acquisition_id}</td>
            <td class="vin">${a.vin ?? '—'}</td>
            <td>${a.purchase_price != null ? '$' + Number(a.purchase_price).toLocaleString() : '—'}</td>
            <td>${a.salesman_id ?? '—'}</td>
            <td style="max-width:240px; font-size:12px; color:var(--muted);">${a.notes ? a.notes.substring(0, 80) + (a.notes.length > 80 ? '…' : '') : '—'}</td>
            <td>${a.created_at ? new Date(a.created_at).toLocaleDateString() : '—'}</td>
            <td><span class="status s-${a.status?.toLowerCase()}">${a.status ?? '—'}</span></td>
            <td>
                <div class="action-btns">
                    <button class="btn-sm" onclick="openAcquisitionEditModal(${a.acquisition_id})">Edit</button>
                    <button class="btn-sm" onclick="openAcquisitionApprovalModal(${a.acquisition_id})">Approve</button>
                    <button class="btn-sm danger" onclick="denyAcquisition(${a.acquisition_id})">Deny</button>
                </div>
            </td>
        </tr>
    `).join('');
    }

    const approvedBody = document.getElementById('acqAdminApprovedBody');
    if (!approvedRows.length) {
        approvedBody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">&#9723;</div><div class="empty-title">No approved requests</div><div class="empty-sub">Approved acquisitions will appear here.</div></div></td></tr>`;
        return;
    }

    approvedBody.innerHTML = approvedRows.map(a => `
        <tr>
            <td>${a.acquisition_id}</td>
            <td class="vin">${a.vin ?? '—'}</td>
            <td>${a.purchase_price != null ? '$' + Number(a.purchase_price).toLocaleString() : '—'}</td>
            <td>${a.salesman_id ?? '—'}</td>
            <td style="max-width:240px; font-size:12px; color:var(--muted);">${a.notes ? a.notes.substring(0, 80) + (a.notes.length > 80 ? '…' : '') : '—'}</td>
            <td>${a.created_at ? new Date(a.created_at).toLocaleDateString() : '—'}</td>
            <td><span class="status s-${a.status?.toLowerCase()}">${a.status ?? '—'}</span></td>
        </tr>
    `).join('');
}

function renderAcquisitionsEmployee(acquisitions) {
    const mine = acquisitions.filter(a => a.salesman_id === currentUser.user_id);
    const shown = employeeAcquisitionScope === 'all' ? acquisitions : mine;
    const total = shown.length;
    const pending = shown.filter(a => a.status === 'Pending').length;
    const approved = shown.filter(a => a.status === 'Approved').length;
    const summaryLabel = employeeAcquisitionScope === 'all' ? 'All Requests' : 'My Requests';

    const mineBtn = document.getElementById('acqScopeMineBtn');
    const allBtn = document.getElementById('acqScopeAllBtn');
    mineBtn.style.background = employeeAcquisitionScope === 'mine' ? 'var(--accent)' : '';
    mineBtn.style.color = employeeAcquisitionScope === 'mine' ? '#fff' : '';
    mineBtn.style.borderColor = employeeAcquisitionScope === 'mine' ? 'var(--accent)' : '';
    allBtn.style.background = employeeAcquisitionScope === 'all' ? 'var(--accent)' : '';
    allBtn.style.color = employeeAcquisitionScope === 'all' ? '#fff' : '';
    allBtn.style.borderColor = employeeAcquisitionScope === 'all' ? 'var(--accent)' : '';

    document.getElementById('acqEmployeeSummary').innerHTML = `
        <div class="sum-card"><div class="sum-label">${summaryLabel}</div><div class="sum-val">${total}</div></div>
        <div class="sum-card"><div class="sum-label">Pending</div><div class="sum-val">${pending}</div></div>
        <div class="sum-card"><div class="sum-label">Approved</div><div class="sum-val">${approved}</div></div>
    `;

    const body = document.getElementById('acqEmployeeBody');
    if (!shown.length) {
        const emptySub = employeeAcquisitionScope === 'all'
            ? 'No acquisition requests found yet.'
            : 'Submit your first acquisition request above.';
        body.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">&#9723;</div><div class="empty-title">No requests yet</div><div class="empty-sub">${emptySub}</div></div></td></tr>`;
        return;
    }

    body.innerHTML = shown.map(a => `
        <tr>
            <td>${a.acquisition_id}</td>
            <td class="vin">${a.vin ?? '—'}</td>
            <td>${a.purchase_price != null ? '$' + Number(a.purchase_price).toLocaleString() : '—'}</td>
            <td>${a.salesman_id === currentUser.user_id ? 'You' : (a.salesman_id ?? '—')}</td>
            <td style="max-width:260px; font-size:12px; color:var(--muted);">${a.notes ?? '—'}</td>
            <td>${a.created_at ? new Date(a.created_at).toLocaleDateString() : '—'}</td>
            <td><span class="status s-${a.status?.toLowerCase()}">${a.status ?? '—'}</span></td>
        </tr>
    `).join('');
}

function clearAcquisitionRequestForm(hideResult = true) {
    document.getElementById('acqVin').value = '';
    document.getElementById('acqPurchasePrice').value = '';
    document.getElementById('acqNotes').value = '';
    if (hideResult) document.getElementById('acqEmployeeResult').style.display = 'none';
}

function showAcquisitionRequestResult(type, message) {
    const el = document.getElementById('acqEmployeeResult');
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

async function submitAcquisitionRequest() {
    const vin = document.getElementById('acqVin').value.trim().toUpperCase();
    const purchasePrice = parseFloat(document.getElementById('acqPurchasePrice').value);
    const notes = document.getElementById('acqNotes').value.trim();

    if (!vin || Number.isNaN(purchasePrice)) {
        showAcquisitionRequestResult('error', 'Please fill in VIN and purchase price.');
        return;
    }

    try {
        await db.acquisitions.insert({
            vin,
            purchase_price: purchasePrice,
            status: 'Pending',
            salesman_id: currentUser.user_id,
            notes,
        });
        clearAcquisitionRequestForm(false);
        showAcquisitionRequestResult('success', `Request submitted for VIN ${vin}.`);
        await loadAcquisitions();
    } catch (err) {
        showAcquisitionRequestResult('error', 'Submission failed: ' + err.message);
    }
}

async function denyAcquisition(acquisitionId) {
    try {
        await db.acquisitions.deny(acquisitionId);
        await loadAcquisitions();
    } catch (err) {
        const msg = String(err?.message ?? '').toLowerCase();
        const schemaDoesNotAllowDenied = msg.includes('acquisition_forms_status_check') || msg.includes('invalid input value for enum');

        if (schemaDoesNotAllowDenied) {
            try {
                await db.acquisitions.delete(acquisitionId);
                await loadAcquisitions();
                alert('Request denied and removed.');
                return;
            } catch (deleteErr) {
                alert('Deny failed: ' + deleteErr.message);
                return;
            }
        }

        alert('Deny failed: ' + err.message);
    }
}

async function openAcquisitionEditModal(acquisitionId) {
    try {
        const acq = await db.acquisitions.getById(acquisitionId);
        editingAcquisitionId = acquisitionId;
        document.getElementById('acqEditVin').value = acq.vin ?? '';
        document.getElementById('acqEditPrice').value = acq.purchase_price ?? '';
        document.getElementById('acqEditStatus').value = acq.status ?? 'Pending';
        document.getElementById('acqEditNotes').value = acq.notes ?? '';
        document.getElementById('acqModal').classList.add('open');
    } catch (err) {
        alert('Failed to open acquisition edit: ' + err.message);
    }
}

function closeAcquisitionEditModal() {
    editingAcquisitionId = null;
    document.getElementById('acqModal').classList.remove('open');
}

async function saveAcquisitionEdit() {
    if (!editingAcquisitionId) return;

    const vin = document.getElementById('acqEditVin').value.trim().toUpperCase();
    const purchase_price = parseFloat(document.getElementById('acqEditPrice').value);
    const status = document.getElementById('acqEditStatus').value;
    const notes = document.getElementById('acqEditNotes').value.trim();

    if (!vin || Number.isNaN(purchase_price)) {
        alert('VIN and purchase price are required.');
        return;
    }

    try {
        await db.acquisitions.update(editingAcquisitionId, {
            vin,
            purchase_price,
            status,
            notes,
        });
        closeAcquisitionEditModal();
        await loadAcquisitions();
    } catch (err) {
        alert('Save failed: ' + err.message);
    }
}

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
            const isTradeIn = a.notes && a.notes.includes('Mode: cash') || (a.notes && a.notes.includes('Mode: discount'));
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
            vehicle: t.vehicle_details,
            vin: '—',
            customerOrNotes: t.customer_info,
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

// ── My Sales ──────────────────────────────────────────
async function loadMySales() {
    const tbody = document.getElementById('mysalesBody');
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">&#9723;</div><div class="empty-title">Loading...</div></div></td></tr>`;
    try {
        const sales = await db.sales.getAll();
        const mine = sales.filter(s => s.salesman_id === currentUser.user_id);
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

// ── Trade-In ──────────────────────────────────────────
let tradeInMode = 'cash';

function setTradeInMode(mode) {
    tradeInMode = mode;

    document.getElementById('modeCashBtn').classList.toggle('active', mode === 'cash');
    document.getElementById('modeDiscountBtn').classList.toggle('active', mode === 'discount');

    document.getElementById('cashFields').style.display = mode === 'cash' ? 'block' : 'none';
    document.getElementById('discountFields').style.display = mode === 'discount' ? 'block' : 'none';

    const descText = mode === 'cash'
        ? 'Cash / Credit mode: the trade-in value will be paid out or credited directly to the customer.'
        : 'Discount mode: the trade-in value will be applied as a discount toward a new vehicle purchase.';
    document.getElementById('modeDescriptionText').textContent = descText;

    document.getElementById('tiResult').style.display = 'none';
}

function clearTradeInForm() {
    ['tiCustomerName', 'tiYear', 'tiMake', 'tiModel', 'tiVin', 'tiCashValue', 'tiPurchaseVin', 'tiDiscountValue', 'tiNotes'].forEach(id => {
        document.getElementById(id).value = '';
    });
    document.getElementById('tiCondition').value = 'Good';
    document.getElementById('tiResult').style.display = 'none';
}

async function submitTradeIn() {
    const customerName = document.getElementById('tiCustomerName').value.trim();
    const year = parseInt(document.getElementById('tiYear').value);
    const make = document.getElementById('tiMake').value.trim();
    const model = document.getElementById('tiModel').value.trim();
    const vin = document.getElementById('tiVin').value.trim().toUpperCase();
    const condition = document.getElementById('tiCondition').value;
    const notes = document.getElementById('tiNotes').value.trim();

    if (!customerName || !year || !model || !vin) {
        showTradeInResult('error', 'Please fill in customer name, year, model, and VIN.');
        return;
    }

    let purchasePrice = 0;
    let fullNotes = `Customer: ${customerName} | Condition: ${condition} | Mode: ${tradeInMode}`;

    if (tradeInMode === 'cash') {
        purchasePrice = parseFloat(document.getElementById('tiCashValue').value) || 0;
        fullNotes += ` | Cash Value: $${purchasePrice.toLocaleString()}`;
    } else {
        const purchaseVin = document.getElementById('tiPurchaseVin').value.trim().toUpperCase();
        const discountValue = parseFloat(document.getElementById('tiDiscountValue').value) || 0;
        purchasePrice = discountValue;
        fullNotes += ` | Applied as discount on VIN: ${purchaseVin} | Discount: $${discountValue.toLocaleString()}`;
    }

    if (notes) fullNotes += ` | Notes: ${notes}`;

    try {
        await db.acquisitions.insert({
            vin,
            purchase_price: purchasePrice,
            status: 'Pending',
            salesman_id: currentUser.user_id,
            notes: fullNotes,
        });

        showTradeInResult('success', `Trade-in submitted successfully for ${year} ${make} ${model} (${vin}).`);
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

// ── Dashboard ─────────────────────────────────────────
async function loadDashboard() {
    try {
        const [inventory, sales, acquisitions] = await Promise.all([
            db.inventory.getAll(),
            db.sales.getAll(),
            db.acquisitions.getAll(),
        ]);

        // top stats
        document.getElementById('dashTotal').textContent = inventory.length;
        document.getElementById('dashAvailable').textContent = inventory.filter(v => v.status === 'Available').length;
        document.getElementById('dashSales').textContent = sales.length;
        const revenue = sales.reduce((sum, s) => sum + (s.amount_sold ?? 0), 0);
        document.getElementById('dashRevenue').textContent = '$' + revenue.toLocaleString();

        // second row
        document.getElementById('dashPending').textContent = sales.filter(s => s.status === 'Pending').length;
        const tradeIns = acquisitions.filter(a => a.notes && (a.notes.includes('Mode: cash') || a.notes.includes('Mode: discount')));
        const regularAcq = acquisitions.filter(a => !a.notes || (!a.notes.includes('Mode: cash') && !a.notes.includes('Mode: discount')));
        document.getElementById('dashAcquisitions').textContent = regularAcq.length;
        document.getElementById('dashTradeIns').textContent = tradeIns.length;

        // inventory breakdown
        document.getElementById('dashBreakAvailable').textContent = inventory.filter(v => v.status === 'Available').length;
        document.getElementById('dashBreakPending').textContent = inventory.filter(v => v.status === 'Pending').length;
        document.getElementById('dashBreakOnWay').textContent = inventory.filter(v => v.status === 'On The Way').length;
        document.getElementById('dashBreakSold').textContent = inventory.filter(v => v.status === 'Sold').length;

        // recent sales table (last 5)
        const recentSales = sales.slice(0, 5);
        document.getElementById('dashRecentSales').innerHTML = recentSales.length ? recentSales.map(s => `
            <tr>
                <td style="font-size:12px;">${s.vehicle_inventory ? s.vehicle_inventory.year + ' ' + (s.vehicle_inventory.make ?? '') + ' ' + s.vehicle_inventory.model : s.vin}</td>
                <td>${s.amount_sold != null ? '$' + s.amount_sold.toLocaleString() : '—'}</td>
                <td><span class="status s-${s.status?.toLowerCase()}">${s.status ?? '—'}</span></td>
            </tr>
        `).join('') : `<tr><td colspan="3"><div class="empty-state" style="padding:24px;"><div class="empty-title" style="font-size:13px;">No sales yet</div></div></td></tr>`;

        // recent acquisitions table (last 5)
        const recentAcq = acquisitions.slice(0, 5);
        document.getElementById('dashRecentAcquisitions').innerHTML = recentAcq.length ? recentAcq.map(a => {
            const isTradeIn = a.notes && (a.notes.includes('Mode: cash') || a.notes.includes('Mode: discount'));
            return `
            <tr>
                <td class="vin" style="font-size:11px;">${a.vin ?? '—'}</td>
                <td><span class="status ${isTradeIn ? 'type-tradein' : 'type-acquisition'}">${isTradeIn ? 'Trade-In' : 'Acquisition'}</span></td>
                <td><span class="status s-${a.status?.toLowerCase()}">${a.status ?? '—'}</span></td>
            </tr>
        `}).join('') : `<tr><td colspan="3"><div class="empty-state" style="padding:24px;"><div class="empty-title" style="font-size:13px;">No acquisitions yet</div></div></td></tr>`;

    } catch (err) {
        console.error('Failed to load dashboard:', err.message);
    }
}