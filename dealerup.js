// ── Auth ──────────────────────────────────────────────
const USERS = {
    admin: { password: 'admin123', role: 'admin', displayName: 'Admin' },
    employee: { password: 'emp123', role: 'employee', displayName: 'Employee' }
};

let currentUser = null;

async function doLogin() {
    const u = document.getElementById('loginUser').value.trim().toLowerCase();
    const p = document.getElementById('loginPass').value;
    const user = USERS[u];
    if (user && user.password === p) {
        currentUser = { username: u, ...user };
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('app').classList.add('visible');
        const badge = document.getElementById('headerRoleBadge');
        badge.textContent = currentUser.role;
        badge.className = 'role-badge role-' + currentUser.role;
        document.getElementById('headerUserName').textContent = currentUser.displayName;
        if (currentUser.role === 'admin') {
            document.getElementById('actionsHeader').textContent = 'Actions';
        }
        await loadInventory();
    } else {
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
    // document.getElementById('statTotal').textContent = ...
    // document.getElementById('statAvailable').textContent = ...
    // document.getElementById('statSold').textContent = ...
}

// TODO: implement this function to render rows into #inventoryBody.
// It should read from the `inventory` array, apply the search input
// and status filter, and build a <tr> for each vehicle.
// For admin users, include Edit and Remove action buttons per row.
function renderTable() {
    // const q = document.getElementById('searchInput').value.toLowerCase();
    // const statusF = document.getElementById('statusFilter').value;
    // const isAdmin = currentUser && currentUser.role === 'admin';
    // ...
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