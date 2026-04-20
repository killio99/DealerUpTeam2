// ── Auth ──────────────────────────────────────────────
const USERS = {
    admin: { password: 'admin123', role: 'admin', displayName: 'Admin' },
    employee: { password: 'emp123', role: 'employee', displayName: 'Employee' }
};

let currentUser = null;

function doLogin() {
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
        // TODO: call renderTable() and renderStats() here once implemented
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
 //here
// ── Inventory data ────────────────────────────────────
let inventory = [
    { id: 1, year: 2023, make: 'Ford', model: 'F-150', vin: '1FTFW1E80NFA12345', mileage: 12400, price: 38900, status: 'Available' },
    { id: 2, year: 2022, make: 'Toyota', model: 'Camry', vin: '4T1BF1FK5NU123456', mileage: 28100, price: 24500, status: 'Available' },
    { id: 3, year: 2024, make: 'Honda', model: 'CR-V', vin: '2HKRM4H77RH123456', mileage: 3200, price: 31200, status: 'Pending' },
    { id: 4, year: 2021, make: 'Chevrolet', model: 'Silverado', vin: '3GCUYDEDXMG123456', mileage: 44700, price: 29800, status: 'Available' },
    { id: 5, year: 2023, make: 'Hyundai', model: 'Tucson', vin: '5NMJBCDE3PH123456', mileage: 9800, price: 26700, status: 'Sold' },
];
let nextId = 6;
let editingId = null;

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
    editingId = null;
    document.getElementById('modalTitle').textContent = 'Add vehicle';
    ['fYear', 'fMake', 'fModel', 'fVin', 'fMileage', 'fPrice'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('fStatus').value = 'Available';
    document.getElementById('modal').classList.add('open');
}

function openEditModal(id) {
    const v = inventory.find(x => x.id === id);
    if (!v) return;
    editingId = id;
    document.getElementById('modalTitle').textContent = 'Edit vehicle';
    document.getElementById('fYear').value = v.year;
    document.getElementById('fMake').value = v.make;
    document.getElementById('fModel').value = v.model;
    document.getElementById('fVin').value = v.vin;
    document.getElementById('fMileage').value = v.mileage;
    document.getElementById('fPrice').value = v.price;
    document.getElementById('fStatus').value = v.status;
    document.getElementById('modal').classList.add('open');
}

function closeModal() {
    document.getElementById('modal').classList.remove('open');
}

function saveVehicle() {
    const year = parseInt(document.getElementById('fYear').value);
    const make = document.getElementById('fMake').value.trim();
    const model = document.getElementById('fModel').value.trim();
    const vin = document.getElementById('fVin').value.trim().toUpperCase();
    const mileage = parseInt(document.getElementById('fMileage').value) || 0;
    const price = parseInt(document.getElementById('fPrice').value) || 0;
    const status = document.getElementById('fStatus').value;

    if (!year || !make || !model || !vin) {
        alert('Please fill in year, make, model, and VIN.');
        return;
    }

    if (editingId) {
        const v = inventory.find(x => x.id === editingId);
        if (v) Object.assign(v, { year, make, model, vin, mileage, price, status });
    } else {
        inventory.push({ id: nextId++, year, make, model, vin, mileage, price, status });
    }

    closeModal();
    renderTable();
    renderStats();
}

function deleteVehicle(id) {
    if (!confirm('Remove this vehicle from inventory?')) return;
    inventory = inventory.filter(v => v.id !== id);
    renderTable();
    renderStats();
}

// Close modal on backdrop click
document.getElementById('modal').addEventListener('click', function (e) {
    if (e.target === this) closeModal();
});