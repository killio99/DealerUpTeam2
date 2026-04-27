const { createClient } = supabase;
const _client = createClient(
    window.SUPABASE_CONFIG.SUPABASE_URL,
    window.SUPABASE_CONFIG.SUPABASE_ANON_KEY
);

window.db = {

    // ── VEHICLE_INVENTORY ─────────────────────────────────────────────────────

    inventory: {
        async getAll() {
            const { data, error } = await _client
                .from('vehicle_inventory')
                .select('*')
                .order('year', { ascending: false });
            if (error) throw error;
            return data;
        },

        async getByVin(vin) {
            const { data, error } = await _client
                .from('vehicle_inventory')
                .select('*')
                .eq('vin', vin)
                .single();
            if (error) throw error;
            return data;
        },

        async getByStatus(status) {
            const { data, error } = await _client
                .from('vehicle_inventory')
                .select('*')
                .eq('status', status)
                .order('year', { ascending: false });
            if (error) throw error;
            return data;
        },

        async insert(vehicle) {
            const { data, error } = await _client
                .from('vehicle_inventory')
                .insert([vehicle])
                .select()
                .single();
            if (error) throw error;
            return data;
        },

        async update(vin, updates) {
            const { data, error } = await _client
                .from('vehicle_inventory')
                .update(updates)
                .eq('vin', vin)
                .select()
                .single();
            if (error) throw error;
            return data;
        },

        async delete(vin) {
            const { error } = await _client
                .from('vehicle_inventory')
                .delete()
                .eq('vin', vin);
            if (error) throw error;
        }
    },

    // ── CUSTOMER_RECORDS ──────────────────────────────────────────────────────

    customers: {
        async getAll() {
            const { data, error } = await _client
                .from('customer_records')
                .select('*')
                .order('customer_name');
            if (error) throw error;
            return data;
        },

        async getById(customerId) {
            const { data, error } = await _client
                .from('customer_records')
                .select('*')
                .eq('customer_id', customerId)
                .single();
            if (error) throw error;
            return data;
        },

        // Search by name or phone number
        async search(query) {
            const { data, error } = await _client
                .from('customer_records')
                .select('*')
                .or(`customer_name.ilike.%${query}%,phone.ilike.%${query}%`)
                .order('customer_name');
            if (error) throw error;
            return data;
        },

        async insert(customer) {
            const { data, error } = await _client
                .from('customer_records')
                .insert([customer])
                .select()
                .single();
            if (error) throw error;
            return data;
        },

        async update(customerId, updates) {
            const { data, error } = await _client
                .from('customer_records')
                .update(updates)
                .eq('customer_id', customerId)
                .select()
                .single();
            if (error) throw error;
            return data;
        },

        async delete(customerId) {
            const { error } = await _client
                .from('customer_records')
                .delete()
                .eq('customer_id', customerId);
            if (error) throw error;
        }
    },

    // ── SALES_FORMS ───────────────────────────────────────────────────────────

    sales: {
        // Returns all sales with joined vehicle and customer data
        async getAll() {
            const { data, error } = await _client
                .from('sales_forms')
                .select('*, vehicle_inventory(*), customer_records(*)')
                .order('date_time', { ascending: false });
            if (error) throw error;
            return data;
        },

        async getById(saleId) {
            const { data, error } = await _client
                .from('sales_forms')
                .select('*, vehicle_inventory(*), customer_records(*)')
                .eq('sale_id', saleId)
                .single();
            if (error) throw error;
            return data;
        },

        async getByCustomer(customerId) {
            const { data, error } = await _client
                .from('sales_forms')
                .select('*, vehicle_inventory(*)')
                .eq('customer_id', customerId)
                .order('date_time', { ascending: false });
            if (error) throw error;
            return data;
        },

        async getByVehicle(vin) {
            const { data, error } = await _client
                .from('sales_forms')
                .select('*, customer_records(*)')
                .eq('vin', vin)
                .single();
            if (error) throw error;
            return data;
        },

        async insert(sale) {
            const { data, error } = await _client
                .from('sales_forms')
                .insert([sale])
                .select()
                .single();
            if (error) throw error;
            return data;
        },

        // status must be 'Pending' or 'Finalized'
        async updateStatus(saleId, status) {
            const { data, error } = await _client
                .from('sales_forms')
                .update({ status })
                .eq('sale_id', saleId)
                .select()
                .single();
            if (error) throw error;
            return data;
        }
    },

    // ── ACQUISITION_FORMS ─────────────────────────────────────────────────────

    acquisitions: {
        async getAll() {
            const { data, error } = await _client
                .from('sales_forms')
                .select('*, vehicle_inventory(*), customer_records(*)')
                .order('sale_id', { ascending: false });
            if (error) throw error;
            return data;
        },

        async getById(acquisitionId) {
            const { data, error } = await _client
                .from('acquisition_forms')
                .select('*, vehicle_inventory(*)')
                .eq('acquisition_id', acquisitionId)
                .single();
            if (error) throw error;
            return data;
        },

        async getByVehicle(vin) {
            const { data, error } = await _client
                .from('acquisition_forms')
                .select('*')
                .eq('vin', vin)
                .single();
            if (error) throw error;
            return data;
        },

        async insert(acquisition) {
            const { data, error } = await _client
                .from('acquisition_forms')
                .insert([acquisition])
                .select()
                .single();
            if (error) throw error;
            return data;
        },

        async approve(acquisitionId) {
            const { data, error } = await _client
                .from('acquisition_forms')
                .update({ status: 'Approved' })
                .eq('acquisition_id', acquisitionId)
                .select()
                .single();
            if (error) throw error;
            return data;
        }
    },

    // ── USERS ─────────────────────────────────────────────────────────────────

    users: {
        // Returns { user_id, username, role } on success, null on wrong credentials.
        // Password hash never leaves the DB — comparison is done server-side via pgcrypto.
        async login(username, password) {
            const { data, error } = await _client
                .rpc('verify_login', { p_username: username, p_password: password });
            if (error) throw error;
            return data[0] ?? null;
        },

        // role must be 'Admin' or 'Sales Rep'
        async create(username, password, role) {
            const { data, error } = await _client
                .rpc('create_user', { p_username: username, p_password: password, p_role: role });
            if (error) throw error;
            return data[0];
        },

        async getAll() {
            const { data, error } = await _client
                .from('business_log')
                .select('log_id, user_id, message, record_id, timestamp, users(username, role)')
                .order('timestamp', { ascending: false });
            if (error) throw error;
            return data;
        },

        // Admin only — change a user's role
        async updateRole(userId, role) {
            const { data, error } = await _client
                .from('users')
                .update({ role })
                .eq('user_id', userId)
                .select('user_id, username, role')
                .single();
            if (error) throw error;
            return data;
        },

        async delete(userId) {
            const { error } = await _client
                .from('users')
                .delete()
                .eq('user_id', userId);
            if (error) throw error;
        }
    },

    // ── BUSINESS_LOG ──────────────────────────────────────────────────────────

    log: {
        async write(userId, message, recordId = null) {
            const { error } = await _client
                .from('business_log')
                .insert([{ user_id: userId, message, record_id: recordId }]);
            if (error) throw error;
        },

        async getAll() {
            const { data, error } = await _client
                .from('business_log')
                .select('*, users(username, role)')
                .order('timestamp', { ascending: false });
            if (error) throw error;
            return data;
        },

        async getByUser(userId) {
            const { data, error } = await _client
                .from('business_log')
                .select('*')
                .eq('user_id', userId)
                .order('timestamp', { ascending: false });
            if (error) throw error;
            return data;
        }
    },

    // ── TRANSACTIONS ──────────────────────────────────────────────────────────

    transactions: {
        async getAll() {
            const { data, error } = await _client
                .from('transactions')
                .select('*')
                .order('transaction_date', { ascending: false });
            if (error) throw error;
            return data;
        },

        async getById(transactionId) {
            const { data, error } = await _client
                .from('transactions')
                .select('*')
                .eq('transaction_id', transactionId)
                .single();
            if (error) throw error;
            return data;
        },

        async insert(transaction) {
            const { data, error } = await _client
                .from('transactions')
                .insert([transaction])
                .select()
                .single();
            if (error) throw error;
            return data;
        },

        async updateStatus(transactionId, status) {
            const { data, error } = await _client
                .from('transactions')
                .update({ transaction_status: status })
                .eq('transaction_id', transactionId)
                .select()
                .single();
            if (error) throw error;
            return data;
        },

        async delete(transactionId) {
            const { error } = await _client
                .from('transactions')
                .delete()
                .eq('transaction_id', transactionId);
            if (error) throw error;
        }
    },  
};
