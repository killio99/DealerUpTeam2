// ── Auth ──────────────────────────────────────────────
let currentUser = null;
let saleFormLoadedDraftSnapshot = null;

// Maps DB role values to CSS class names used in styles.css
const ROLE_CSS = { 'Admin': 'admin', 'Employee': 'employee' };

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
            badge.className = 'role-badge role-' + (ROLE_CSS[currentUser.role] ?? 'employee');
            document.getElementById('headerUserName').textContent = currentUser.username;
            if (currentUser.role === 'Admin') {
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
let sortCol = null;
let sortDir = 'asc';

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
        case 'mileage': return v.mileage ?? -1;
        case 'price':   return v.listed_sale ?? -1;
        case 'status':  return (v.status ?? '').toLowerCase();
        default:        return '';
    }
}

function updateSortArrows() {
    ['vehicle', 'vin', 'mileage', 'price', 'status'].forEach(col => {
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

function renderStats() {
    document.getElementById('statTotal').textContent = inventory.length;
    document.getElementById('statAvailable').textContent = inventory.filter(v => v.status === 'Available').length;
    document.getElementById('statSold').textContent = inventory.filter(v => v.status === 'Sold').length;
}

function renderTable() {
    const q = document.getElementById('searchInput').value.toLowerCase();
    const statusF = document.getElementById('statusFilter').value;
    const isAdmin = currentUser && currentUser.role === 'Admin';

    const filtered = inventory.filter(v => {
        const matchSearch = !q || (v.make ?? '').toLowerCase().includes(q) || (v.model ?? '').toLowerCase().includes(q) || (v.vin ?? '').toLowerCase().includes(q);
        const matchStatus = !statusF || v.status === statusF;
        return matchSearch && matchStatus;
    });

    if (sortCol) {
        filtered.sort((a, b) => {
            const av = getSortValue(a, sortCol);
            const bv = getSortValue(b, sortCol);
            const cmp = typeof av === 'number' ? av - bv : av.localeCompare(bv);
            return sortDir === 'asc' ? cmp : -cmp;
        });
    }

    updateSortArrows();

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
    document.getElementById('modalTitle').textContent = 'Add vehicle';
    ['fYear', 'fMake', 'fModel', 'fVin', 'fMileage', 'fPrice'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('fStatus').value = 'Available';
    document.getElementById('modal').classList.add('open');
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
        } else {
            await db.inventory.insert({ vin, year, make, model, mileage, listed_sale, status });
        }
        closeModal();
        await loadInventory();
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

// ── Tab Navigation ──────────────────────────────────
async function switchTab(tab) {
  const pages = {
    dashboard: document.getElementById('dashboardPage'),
    inventory: document.getElementById('inventoryPage'),
    mysales: document.getElementById('mysalesPage'),
    transactions: document.getElementById('transactionsPage'),
    tradein: document.getElementById('tradeinPage'),
  };
  const tabs = document.querySelectorAll('.tab-btn');
  const order = ['dashboard', 'inventory', 'mysales', 'transactions', 'tradein'];

  Object.values(pages).forEach(p => p.style.display = 'none');
  tabs.forEach(t => t.classList.remove('active'));

  pages[tab].style.display = 'block';
  tabs[order.indexOf(tab)].classList.add('active');

  if (tab === 'dashboard') await loadDashboard();
  if (tab === 'tradein') generateTradeInVin();
  if (tab === 'transactions') await loadTransactions();
  if (tab === 'mysales') await loadMySales();
}

// ── Filters ──────────────────────────────────────────
function clearFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('statusFilter').value = '';
    renderTable();
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
    ['tiCustomerName', 'tiYear', 'tiMake', 'tiModel',
     'tiMileage', 'tiCashValue', 'tiNotes']
    .forEach(id => { document.getElementById(id).value = ''; });
    generateTradeInVin();
    document.getElementById('tiResult').style.display = 'none';
}

function clearSaleForm() {
    ['saleCustomerName', 'saleCustomerPhone', 'saleVin', 'salePrice', 'saleDate', 'saleNotes'].forEach(id => {
        document.getElementById(id).value = '';
    });
    const picker = document.getElementById('saleVehiclePicker');
    if (picker) picker.value = '';
    const info = document.getElementById('saleSelectedVehicleInfo');
    if (info) info.style.display = 'none';
}

function getSaleFormData() {
    return {
        customerName: document.getElementById('saleCustomerName').value.trim(),
        customerPhone: document.getElementById('saleCustomerPhone').value.trim(),
        vin: document.getElementById('saleVin').value.trim().toUpperCase(),
        amount: document.getElementById('salePrice').value.trim(),
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
    if (document.getElementById('saleFormSection').style.display === 'block' && isSaleDraftDirty()) {
        const save = confirm('You have unsaved draft changes. Press OK to save as a draft, or Cancel to discard them.');
        if (save) saveSaleDraft();
    }
    clearSaleForm();
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
    };
}

function closeSaleForm() {
    document.getElementById('saleFormSection').style.display = 'none';
}

function showSaleResult(type, message) {
    const el = document.getElementById('saleResult');
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

function getSaleDrafts() {
    try {
        const raw = localStorage.getItem('saleDrafts');
        return raw ? JSON.parse(raw) : [];
    } catch (err) {
        return [];
    }
}

function saveSaleDrafts(drafts) {
    localStorage.setItem('saleDrafts', JSON.stringify(drafts));
}

function saveSaleDraft() {
    const customerName = document.getElementById('saleCustomerName').value.trim();
    const customerPhone = document.getElementById('saleCustomerPhone').value.trim();
    const year = document.getElementById('saleYear').value.trim();
    const make = document.getElementById('saleMake').value.trim();
    const model = document.getElementById('saleModel').value.trim();
    const vin = document.getElementById('saleVin').value.trim().toUpperCase();
    const amount = document.getElementById('salePrice').value.trim();
    const saleDate = document.getElementById('saleDate').value;
    const notes = document.getElementById('saleNotes').value.trim();
    const draftId = document.getElementById('saleDraftId').value || `draft-${Date.now()}`;

    if (!customerName && !customerPhone && !year && !make && !model && !vin && !amount && !saleDate && !notes) {
        showSaleResult('error', 'Enter at least one field before saving a draft.');
        return;
    }

    const drafts = getSaleDrafts();
    const existingIndex = drafts.findIndex(d => d.id === draftId);
    const draft = {
        id: draftId,
        createdAt: Date.now(),
        customerName,
        customerPhone,
        year,
        make,
        model,
        vin,
        amount,
        saleDate,
        notes,
    };

    if (existingIndex >= 0) {
        drafts[existingIndex] = draft;
    } else {
        drafts.unshift(draft);
    }

    saveSaleDrafts(drafts);
    document.getElementById('saleDraftId').value = draftId;
    saleFormLoadedDraftSnapshot = getSaleFormData();
    showSaleResult('success', 'Draft saved. Open View and Edit Drafts to continue later.');
}

function openDraftsModal() {
    renderDraftsList();
    document.getElementById('draftsModal').classList.add('open');
}

function closeDraftsModal() {
    document.getElementById('draftsModal').classList.remove('open');
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
              <td style="padding:10px; border-bottom:1px solid var(--border);">${d.year || ''} ${d.make || ''} ${d.model || ''}</td>
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
    document.getElementById('saleYear').value = draft.year;
    document.getElementById('saleMake').value = draft.make;
    document.getElementById('saleModel').value = draft.model;
    document.getElementById('saleVin').value = draft.vin;
    document.getElementById('salePrice').value = draft.amount;
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
    const year = parseInt(document.getElementById('saleYear').value);
    const make = document.getElementById('saleMake').value.trim();
    const model = document.getElementById('saleModel').value.trim();
    const vin = document.getElementById('saleVin').value.trim().toUpperCase();
    const amount = parseFloat(document.getElementById('salePrice').value);
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

    const previousStatus = vehicle.status;
    let inventoryUpdated = false;

    try {
        await db.inventory.update(vin, { status: 'Sold' });
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
            status: 'Pending',
            date_time: saleDate,
            notes: notes || null,
        });

        if (draftId) {
            const drafts = getSaleDrafts().filter(d => d.id !== draftId);
            saveSaleDrafts(drafts);
        }

        const v = inventory.find(x => x.vin === vin);
        const label = v ? `${v.year ?? ''} ${v.make ?? ''} ${v.model ?? ''}`.trim() : vin;
        showSaleResult('success', `Sale recorded successfully for ${label} (${vin}).`);
        clearSaleForm();
        loadMySales();
    } catch (err) {
        if (inventoryUpdated) {
            try {
                await db.inventory.update(vin, { status: previousStatus });
            } catch (rollbackErr) {
                console.error('Failed to revert inventory status after sale submission error:', rollbackErr.message);
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
    const notes = document.getElementById('tiNotes').value.trim();
    const vin = document.getElementById('tiVin').value.trim();

    if (!customerName || !year || !model || !vin) {
        showTradeInResult('error', 'Please fill in customer name, year, and model.');
        return;
    }

    const fullNotes = `Customer: ${customerName} | Value: $${value.toLocaleString()}${notes ? ' | Notes: ' + notes : ''}`;

    try {
        let vehicleExists = false;
        try { await db.inventory.getByVin(vin); vehicleExists = true; } catch (_) {}

        if (!vehicleExists) {
            await db.inventory.insert({
                vin, year, make: make || null, model, mileage,
                listed_sale: value, status: 'Pending',
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

// ── Dashboard ─────────────────────────────────────────
async function loadDashboard() {
    try {
        const [inventoryData, sales, acquisitions, logEntries] = await Promise.all([
            db.inventory.getAll(),
            db.sales.getAll(),
            db.acquisitions.getAll(),
            db.log.getAll(),
        ]);

        document.getElementById('dashTotal').textContent = inventoryData.length;
        document.getElementById('dashAvailable').textContent = inventoryData.filter(v => v.status === 'Available').length;
        document.getElementById('dashSales').textContent = sales.length;
        const revenue = sales.reduce((sum, s) => sum + (s.amount_sold ?? 0), 0);
        document.getElementById('dashRevenue').textContent = '$' + revenue.toLocaleString();

        document.getElementById('dashPending').textContent = sales.filter(s => s.status === 'Pending').length;
        const tradeIns = acquisitions.filter(a => a.notes && a.notes.includes('Value:'));
        const regularAcq = acquisitions.filter(a => !a.notes || !a.notes.includes('Value:'));
        document.getElementById('dashAcquisitions').textContent = regularAcq.length;
        document.getElementById('dashTradeIns').textContent = tradeIns.length;

        document.getElementById('dashBreakAvailable').textContent = inventoryData.filter(v => v.status === 'Available').length;
        document.getElementById('dashBreakPending').textContent = inventoryData.filter(v => v.status === 'Pending').length;
        document.getElementById('dashBreakOnWay').textContent = inventoryData.filter(v => v.status === 'On The Way').length;
        document.getElementById('dashBreakSold').textContent = inventoryData.filter(v => v.status === 'Sold').length;

        const recentSales = sales.slice(0, 5);
        document.getElementById('dashRecentSales').innerHTML = recentSales.length ? recentSales.map(s => `
            <tr>
                <td style="font-size:12px;">${s.vehicle_inventory ? s.vehicle_inventory.year + ' ' + (s.vehicle_inventory.make ?? '') + ' ' + s.vehicle_inventory.model : s.vin}</td>
                <td>${s.amount_sold != null ? '$' + s.amount_sold.toLocaleString() : '—'}</td>
                <td><span class="status s-${s.status?.toLowerCase()}">${s.status ?? '—'}</span></td>
            </tr>
        `).join('') : `<tr><td colspan="3"><div class="empty-state" style="padding:24px;"><div class="empty-title" style="font-size:13px;">No sales yet</div></div></td></tr>`;

        const recentAcq = acquisitions.slice(0, 5);
        document.getElementById('dashRecentAcquisitions').innerHTML = recentAcq.length ? recentAcq.map(a => {
            const isTradeIn = a.notes && a.notes.includes('Value:');
            return `<tr>
                <td class="vin" style="font-size:11px;">${a.vin ?? '—'}</td>
                <td><span class="status ${isTradeIn ? 'type-tradein' : 'type-acquisition'}">${isTradeIn ? 'Trade-In' : 'Acquisition'}</span></td>
                <td><span class="status s-${a.status?.toLowerCase()}">${a.status ?? '—'}</span></td>
            </tr>`;
        }).join('') : `<tr><td colspan="3"><div class="empty-state" style="padding:24px;"><div class="empty-title" style="font-size:13px;">No acquisitions yet</div></div></td></tr>`;

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