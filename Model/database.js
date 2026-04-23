// Supabase client — initialized from config.js (loaded before this file)
const { createClient } = supabase;
const _db = createClient(
    window.SUPABASE_CONFIG.SUPABASE_URL,
    window.SUPABASE_CONFIG.SUPABASE_ANON_KEY
);

// window.db exposes one namespace per schema table
window.db = {

    // ── VEHICLE_INVENTORY ─────────────────────────────────
    inventory: {
        async getAll() {
            const { data, error } = await _db
                .from('vehicle_inventory')
                .select('*')
                .order('year', { ascending: false });
            if (error) throw error;
            return data;
        },
        async insert(vehicle) {
            const { data, error } = await _db
                .from('vehicle_inventory')
                .insert([vehicle])
                .select()
                .single();
            if (error) throw error;
            return data;
        },
        async update(vin, updates) {
            const { data, error } = await _db
                .from('vehicle_inventory')
                .update(updates)
                .eq('vin', vin)
                .select()
                .single();
            if (error) throw error;
            return data;
        },
        async delete(vin) {
            const { error } = await _db
                .from('vehicle_inventory')
                .delete()
                .eq('vin', vin);
            if (error) throw error;
        }
    },

    // ── CUSTOMER_RECORDS ──────────────────────────────────
    customers: {
        async getAll() {
            const { data, error } = await _db
                .from('customer_records')
                .select('*')
                .order('customer_name');
            if (error) throw error;
            return data;
        },
        async insert(customer) {
            const { data, error } = await _db
                .from('customer_records')
                .insert([customer])
                .select()
                .single();
            if (error) throw error;
            return data;
        },
        async update(id, updates) {
            const { data, error } = await _db
                .from('customer_records')
                .update(updates)
                .eq('customer_id', id)
                .select()
                .single();
            if (error) throw error;
            return data;
        }
    },

    // ── SALES_FORMS ───────────────────────────────────────
    sales: {
        async getAll() {
            const { data, error } = await _db
                .from('sales_forms')
                .select('*, vehicle_inventory(*), customer_records(*)')
                .order('date_time', { ascending: false });
            if (error) throw error;
            return data;
        },
        async insert(sale) {
            const { data, error } = await _db
                .from('sales_forms')
                .insert([sale])
                .select()
                .single();
            if (error) throw error;
            return data;
        }
    },

    // ── ACQUISITION_FORMS ─────────────────────────────────
    acquisitions: {
        async getAll() {
            const { data, error } = await _db
                .from('acquisition_forms')
                .select('*, vehicle_inventory(*)')
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data;
        },
        async insert(acquisition) {
            const { data, error } = await _db
                .from('acquisition_forms')
                .insert([acquisition])
                .select()
                .single();
            if (error) throw error;
            return data;
        }
    },

    // ── USERS ─────────────────────────────────────────────
    users: {
        // Never select the password column
        async getAll() {
            const { data, error } = await _db
                .from('users')
                .select('user_id, username, role');
            if (error) throw error;
            return data;
        }
    },

    // ── BUSINESS_LOG ──────────────────────────────────────
    log: {
        async write(userId, message, recordId = null) {
            const { error } = await _db
                .from('business_log')
                .insert([{ user_id: userId, message, record_id: recordId }]);
            if (error) throw error;
        },
        async getAll() {
            const { data, error } = await _db
                .from('business_log')
                .select('*')
                .order('timestamp', { ascending: false });
            if (error) throw error;
            return data;
        }
    }
};
