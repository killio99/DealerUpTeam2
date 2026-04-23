// ── Auth ──────────────────────────────────────────────
const USERS = {
    admin: { password: 'admin123', role: 'admin', displayName: 'Admin' },
    employee: { password: 'emp123', role: 'employee', displayName: 'Employee' }
};

// Maps DB role values → CSS classes
const ROLE_CSS = { 'Admin': 'admin', 'Employee': 'employee' };

let currentUser = null;

// ✅ SINGLE login function (merged local + DB)
async function doLogin() {
    const u = document.getElementById('loginUser').value.trim().toLowerCase();
    const p = document.getElementById('loginPass').value;

    try {
        // Try DB login first
        let user = null;
        if (typeof db !== "undefined") {
            user = await db.users.login(u, p);
        }

        // Fallback to local demo users
        if (!user && USERS[u] && USERS[u].password === p) {
            user = {
                username: u,
                role: USERS[u].role === 'admin' ? 'Admin' : 'Employee'
            };
        }

        if (user) {
            currentUser = user;

            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('app').classList.add('visible');

            const badge = document.getElementById('headerRoleBadge');
            badge.textContent = currentUser.role;
            badge.className = 'role-badge role-' + (ROLE_CSS[currentUser.role] ?? 'employee');

            document.getElementById('headerUserName').textContent =
                user.displayName || user.username;

            if ((currentUser.role === 'Admin') || (currentUser.role === 'admin')) {
                document.getElementById('actionsHeader').textContent = 'Actions';
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
}

// Enter key login (safe after DOM loads)
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById('loginPass').addEventListener('keydown', e => {
        if (e.key === 'Enter') doLogin();
    });
});


// ── Inventory ─────────────────────────────────────────

// ✅ SINGLE source of truth
let inventory = [];
let editingVin = null;

// Load from DB OR fallback demo data
async function loadInventory() {
    try {
        if (typeof db !== "undefined") {
            inventory = await db.inventory.getAll();
        } else {
            // fallback demo data
            inventory = [
                { id: 1, year: 2023, make: 'Ford', model: 'F-150', vin: '1FTFW1E80NFA12345', mileage: 12400, listed_sale: 38900, status: 'Available' },
                { id: 2, year: 2022, make: 'Toyota', model: 'Camry', vin: '4T1BF1FK5NU123456', mileage: 28100, listed_sale: 24500, status: 'Available' },
                { id: 3, year: 2024, make: 'Honda', model: 'CR-V', vin: '2HKRM4H77RH123456', mileage: 3200, listed_sale: 31200, status: 'Pending' }
            ];
        }

        renderTable();
        renderStats();

    } catch (err) {
        console.error('Failed to load inventory:', err.message);
    }
}


// ── Render ────────────────────────────────────────────

function renderStats() {
    document.getElementById('statTotal').textContent = inventory.length;

    document.getElementById('statAvailable').textContent =
        inventory.filter(v => v.status === 'Available').length;

    document.getElementById('statSold').textContent =
        inventory.filter(v => v.status === 'Sold').length;
}

function renderTable() {
    const tbody = document.getElementById("inventoryBody");
    const search = document.getElementById("searchInput")?.value.toLowerCase() || "";

    const filtered = inventory.filter(v =>
        `${v.year} ${v.make} ${v.model} ${v.vin}`.toLowerCase().includes(search)
    );

    tbody.innerHTML = "";

    if (inventory.length === 0) {
        tbody.innerHTML = `
        <tr><td colspan="6">
            <div class="empty-state">
                <div class="empty-title">No vehicles in inventory</div>
            </div>
        </td></tr>`;
        return;
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `
        <tr><td colspan="6">
            <div class="empty-state empty-filter">
                <div class="empty-title">No matching vehicles</div>
            </div>
        </td></tr>`;
        return;
    }

    filtered.forEach(v => {
        const row = document.createElement("tr");

        row.innerHTML = `
            <td><strong>${v.year} ${v.make} ${v.model}</strong></td>
            <td class="vin">${v.vin}</td>
            <td>${v.mileage.toLocaleString()} mi</td>
            <td>$${(v.listed_sale ?? v.price ?? 0).toLocaleString()}</td>
            <td><span class="status s-${v.status.toLowerCase()}">${v.status}</span></td>
            <td>
                ${(currentUser?.role === 'Admin') ? `
                    <div class="action-btns">
                        <button class="btn-sm" onclick="openEditModal('${v.vin}')">Edit</button>
                        <button class="btn-sm danger" onclick="deleteVehicle('${v.vin}')">Remove</button>
                    </div>
                ` : ''}
            </td>
        `;

        tbody.appendChild(row);
    });
}


// ── Modal ─────────────────────────────────────────────

function openAddModal() {
    editingVin = null;
    document.getElementById('modalTitle').textContent = 'Add vehicle';
    ['fYear','fMake','fModel','fVin','fMileage','fPrice'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('fStatus').value = 'Available';
    document.getElementById('modal').classList.add('open');
}

function openEditModal(vin) {
    const v = inventory.find(x => x.vin === vin);
    if (!v) return;

    editingVin = vin;

    document.getElementById('modalTitle').textContent = 'Edit vehicle';
    document.getElementById('fYear').value = v.year ?? '';
    document.getElementById('fMake').value = v.make ?? '';
    document.getElementById('fModel').value = v.model ?? '';
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
        alert('Please fill in required fields.');
        return;
    }

    try {
        if (typeof db !== "undefined") {
            if (editingVin) {
                await db.inventory.update(editingVin, { year, make, model, mileage, listed_sale, status });
            } else {
                await db.inventory.insert({ vin, year, make, model, mileage, listed_sale, status });
            }
            await loadInventory();
        } else {
            // fallback local mode
            inventory.push({ vin, year, make, model, mileage, listed_sale, status });
            renderTable();
            renderStats();
        }

        closeModal();

    } catch (err) {
        alert('Save failed: ' + err.message);
    }
}

async function deleteVehicle(vin) {
    if (!confirm('Remove this vehicle?')) return;

    try {
        if (typeof db !== "undefined") {
            await db.inventory.delete(vin);
            await loadInventory();
        } else {
            inventory = inventory.filter(v => v.vin !== vin);
            renderTable();
            renderStats();
        }
    } catch (err) {
        alert('Delete failed: ' + err.message);
    }
}
