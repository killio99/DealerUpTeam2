// ── Auth ──────────────────────────────────────────────
let currentUser = null;

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
            }
            await loadInventory();
        } else {
            document.getElementById('loginError').style.display = 'block';
        }
        renderTable();
        renderStats();
    } else {
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

async function loadInventory() {
    try {
        inventory = await db.inventory.getAll();
        renderTable();
        renderStats();
    } catch (err) {
        console.error('Failed to load inventory:', err.message);
    }
}

// ── Render ────────────────────────────────────────────
// TODO: implement this function to update the three summary stat cards
// using the `inventory` array above. Hint: use inventory.length,
// and Array.filter() to count by status.
function renderStats() {
    document.getElementById('statTotal').textContent = inventory.length;
    document.getElementById('statAvailable').textContent = inventory.filter(v => v.status === 'Available').length;
    document.getElementById('statSold').textContent = inventory.filter(v => v.status === 'Sold').length;
}

// TODO: implement this function to render rows into #inventoryBody.
// It should read from the `inventory` array, apply the search input
// and status filter, and build a <tr> for each vehicle.
// For admin users, include Edit and Remove action buttons per row.
function renderTable() {
    const q = document.getElementById('searchInput').value.toLowerCase();
    const statusF = document.getElementById('statusFilter').value;
    const isAdmin = currentUser && currentUser.role === 'admin';

    const filtered = inventory.filter(v => {
        const matchSearch = !q || v.make.toLowerCase().includes(q) || v.model.toLowerCase().includes(q) || v.vin.toLowerCase().includes(q);
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
            <td>${v.year} ${v.make} ${v.model}</td>
            <td class="vin">${v.vin}</td>
            <td>${v.mileage.toLocaleString()} mi</td>
            <td>$${v.price.toLocaleString()}</td>
            <td><span class="status s-${v.status.toLowerCase()}">${v.status}</span></td>
            <td>${isAdmin ? `<div class="action-btns"><button class="btn-sm" onclick="openEditModal(${v.id})">Edit</button><button class="btn-sm danger" onclick="deleteVehicle(${v.id})">Remove</button></div>` : ''}</td>
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
function switchTab(tab) {
  const pages = {
    dashboard: document.getElementById('dashboardPage'),
    inventory: document.querySelector('main'),
    mysales: document.getElementById('mysalesPage'),
    transactions: document.getElementById('transactionsPage'),
  };
  const tabs = document.querySelectorAll('.tab-btn');
  const order = ['dashboard', 'inventory', 'mysales', 'transactions'];

  Object.values(pages).forEach(p => p.style.display = 'none');
  tabs.forEach(t => t.classList.remove('active'));

  pages[tab].style.display = 'block';
  tabs[order.indexOf(tab)].classList.add('active');
}

// ── Filters ──────────────────────────────────────────
function clearFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('statusFilter').value = '';
    renderTable();
}