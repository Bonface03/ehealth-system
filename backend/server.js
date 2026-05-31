// backend/server.js
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const USE_BLUETOOTH = process.env.USE_BLUETOOTH === 'true';
const FingerprintSensor = require('./src/services/fingerprintSensor');
const RoleRequestService = require('./services/roleRequestService');
const uploadService = require('./services/uploadService');

const app = express();
app.use(cors());
app.use(express.json());

// JWT secret
const JWT_SECRET = 'your-secret-key-change-this';

// Configure multer for file uploads (10MB limit)
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'image/jpeg', 'image/png', 'image/gif',
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain'
        ];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type'));
        }
    }
});

// Configure multer for diagnostic uploads (50MB limit for medical images)
const diagnosticUpload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'image/jpeg', 'image/png', 'image/gif', 'image/dicom',
            'application/pdf', 'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain'
        ];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type for medical record'));
        }
    }
});

// Initialize database
const db = new sqlite3.Database('./ehealth.db');

// Create all tables
db.serialize(() => {
    // Users table
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password_hash TEXT,
            email TEXT,
            fingerprint_template BLOB,
            fingerprint_id INTEGER UNIQUE,
            health_record_id TEXT,
            role TEXT DEFAULT 'patient',
            verification_status TEXT DEFAULT 'pending',
            verified_by INTEGER,
            verified_at DATETIME,
            status TEXT DEFAULT 'active',
            is_immutable INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Health records table
    db.run(`
        CREATE TABLE IF NOT EXISTS health_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            record_data TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    `);

    // Appointments table
    db.run(`
        CREATE TABLE IF NOT EXISTS appointments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER,
            doctor_id INTEGER,
            title TEXT NOT NULL,
            description TEXT,
            appointment_date TEXT NOT NULL,
            appointment_time TEXT NOT NULL,
            duration INTEGER DEFAULT 30,
            status TEXT DEFAULT 'scheduled',
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(patient_id) REFERENCES users(id),
            FOREIGN KEY(doctor_id) REFERENCES users(id)
        )
    `);

    // Prescriptions table
    db.run(`
        CREATE TABLE IF NOT EXISTS prescriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER,
            doctor_id INTEGER,
            medication TEXT NOT NULL,
            dosage TEXT NOT NULL,
            frequency TEXT,
            duration TEXT,
            notes TEXT,
            refills INTEGER DEFAULT 0,
            status TEXT DEFAULT 'prescribed',
            dispensed_at DATETIME,
            dispensed_by INTEGER,
            dispensed_quantity INTEGER,
            pharmacist_notes TEXT,
            prescribed_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(patient_id) REFERENCES users(id),
            FOREIGN KEY(doctor_id) REFERENCES users(id)
        )
    `);

    // Roles table
    db.run(`
        CREATE TABLE IF NOT EXISTS roles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            description TEXT,
            permissions TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Staff details table
    db.run(`
        CREATE TABLE IF NOT EXISTS staff_details (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER UNIQUE,
            staff_id TEXT UNIQUE,
            full_name TEXT,
            date_of_birth TEXT,
            gender TEXT,
            address TEXT,
            blood_type TEXT,
            allergies TEXT,
            department TEXT,
            specialization TEXT,
            qualification TEXT,
            license_number TEXT,
            years_of_experience INTEGER,
            contact_number TEXT,
            emergency_contact TEXT,
            employment_date DATE,
            status TEXT DEFAULT 'active',
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    `);

    // Admissions table
    db.run(`
        CREATE TABLE IF NOT EXISTS admissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER,
            admitted_by INTEGER,
            doctor_id INTEGER,
            ward TEXT,
            bed_number TEXT,
            reason TEXT,
            diagnosis TEXT,
            expected_stay_days INTEGER DEFAULT 1,
            admitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            discharge_date DATETIME,
            discharge_notes TEXT,
            discharge_instructions TEXT,
            status TEXT DEFAULT 'admitted',
            FOREIGN KEY(patient_id) REFERENCES users(id),
            FOREIGN KEY(admitted_by) REFERENCES users(id),
            FOREIGN KEY(doctor_id) REFERENCES users(id)
        )
    `);

    // Invoices table
    db.run(`
        CREATE TABLE IF NOT EXISTS invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_number TEXT UNIQUE NOT NULL,
            patient_id INTEGER NOT NULL,
            amount DECIMAL(10,2) NOT NULL,
            paid_amount DECIMAL(10,2) DEFAULT 0,
            description TEXT,
            due_date DATE,
            status TEXT DEFAULT 'pending',
            created_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(patient_id) REFERENCES users(id),
            FOREIGN KEY(created_by) REFERENCES users(id)
        )
    `);

    // Payments table
    db.run(`
        CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            payment_number TEXT UNIQUE NOT NULL,
            invoice_id INTEGER NOT NULL,
            amount DECIMAL(10,2) NOT NULL,
            method TEXT,
            reference TEXT,
            paid_by INTEGER,
            paid_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(invoice_id) REFERENCES invoices(id),
            FOREIGN KEY(paid_by) REFERENCES users(id)
        )
    `);

    // Pharmacy inventory table
    db.run(`
        CREATE TABLE IF NOT EXISTS pharmacy_inventory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            medication_name TEXT NOT NULL,
            quantity INTEGER DEFAULT 0,
            unit TEXT DEFAULT 'tablets',
            price DECIMAL(10,2),
            expiry_date DATE,
            manufacturer TEXT,
            requires_prescription BOOLEAN DEFAULT 1,
            min_stock_threshold INTEGER DEFAULT 10,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Patient vitals table
    db.run(`
        CREATE TABLE IF NOT EXISTS patient_vitals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER,
            temperature REAL,
            blood_pressure TEXT,
            heart_rate INTEGER,
            respiratory_rate INTEGER,
            oxygen_saturation INTEGER,
            weight REAL,
            height REAL,
            notes TEXT,
            recorded_by INTEGER,
            recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(patient_id) REFERENCES users(id),
            FOREIGN KEY(recorded_by) REFERENCES users(id)
        )
    `);

    // Imaging studies table
    db.run(`
        CREATE TABLE IF NOT EXISTS imaging_studies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER,
            test_type TEXT,
            body_part TEXT,
            description TEXT,
            findings TEXT,
            image_url TEXT,
            status TEXT DEFAULT 'pending',
            uploaded_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            report_completed_at DATETIME,
            FOREIGN KEY(patient_id) REFERENCES users(id),
            FOREIGN KEY(uploaded_by) REFERENCES users(id)
        )
    `);

    // Lab requests table
    db.run(`
        CREATE TABLE IF NOT EXISTS lab_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER,
            test_type TEXT NOT NULL,
            sample_type TEXT,
            priority TEXT DEFAULT 'normal',
            notes TEXT,
            attachment TEXT,
            results TEXT,
            status TEXT DEFAULT 'pending',
            requested_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            completed_at DATETIME,
            FOREIGN KEY(patient_id) REFERENCES users(id),
            FOREIGN KEY(requested_by) REFERENCES users(id)
        )
    `);

    // Medication administration table
    db.run(`
        CREATE TABLE IF NOT EXISTS medication_administration (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER,
            medication TEXT NOT NULL,
            dosage TEXT NOT NULL,
            route TEXT,
            frequency TEXT,
            administered_at DATETIME,
            notes TEXT,
            administered_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(patient_id) REFERENCES users(id),
            FOREIGN KEY(administered_by) REFERENCES users(id)
        )
    `);

    // Audit logs table
    db.run(`
        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            action TEXT,
            entity_type TEXT,
            entity_id INTEGER,
            details TEXT,
            ip_address TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    `);

    // Role requests table
    db.run(`
        CREATE TABLE IF NOT EXISTS role_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            requested_role TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            documents TEXT,
            reason TEXT,
            verified_by INTEGER,
            verified_at DATETIME,
            rejection_reason TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(verified_by) REFERENCES users(id)
        )
    `);
    
    // Attachments table for health record files
    db.run(`
        CREATE TABLE IF NOT EXISTS health_record_attachments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            health_record_id INTEGER,
            user_id INTEGER,
            file_name TEXT NOT NULL,
            file_type TEXT NOT NULL,
            file_size INTEGER,
            file_path TEXT NOT NULL,
            description TEXT,
            uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(health_record_id) REFERENCES health_records(id),
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    `);

    console.log('✅ Database tables ready');
});

// Seed default roles
function seedDefaultRoles() {
    db.get("SELECT COUNT(*) as count FROM roles", (err, result) => {
        if (err) {
            console.error('Error checking roles:', err);
            return;
        }
        
        if (result.count === 0) {
            console.log('🌱 Seeding default roles...');
            
            const defaultRoles = [
                { name: 'master_admin', description: 'Master Administrator - Full system access', permissions: JSON.stringify(['*']) },
                { name: 'patient', description: 'Patient - Can view own health records and appointments', permissions: JSON.stringify(['view_own_records', 'view_own_appointments', 'create_appointments', 'view_own_prescriptions', 'request_refills', 'view_own_profile']) },
                { name: 'doctor', description: 'Doctor - Can manage patient records and prescriptions', permissions: JSON.stringify(['view_patient_records', 'create_prescriptions', 'manage_appointments', 'view_patient_list', 'update_patient_vitals']) },
                { name: 'nurse', description: 'Nurse - Can assist in appointments and update vitals', permissions: JSON.stringify(['view_patient_records', 'manage_appointments', 'update_patient_vitals']) },
                { name: 'receptionist', description: 'Receptionist - Can register patients and manage appointments', permissions: JSON.stringify(['register_patients', 'schedule_appointments', 'update_patient_demographics']) },
                { name: 'pharmacist', description: 'Pharmacist - Can dispense medications and manage prescriptions', permissions: JSON.stringify(['dispense_medication', 'update_prescription_status', 'manage_inventory']) },
                { name: 'lab_technician', description: 'Lab Technician - Can perform lab tests', permissions: JSON.stringify(['view_lab_requests', 'update_lab_results', 'perform_lab_tests']) },
                { name: 'radiologist', description: 'Radiologist - Can perform imaging', permissions: JSON.stringify(['view_imaging_requests', 'update_imaging_results', 'perform_imaging']) },
                { name: 'billing_officer', description: 'Billing Officer - Can manage invoices and payments', permissions: JSON.stringify(['view_invoices', 'create_invoices', 'process_payments', 'view_patient_basic_info']) },
                { name: 'ict_admin', description: 'ICT Administrator - Can manage system settings', permissions: JSON.stringify(['manage_users', 'manage_roles', 'view_audit_logs', 'manage_system_settings']) }
            ];
            
            defaultRoles.forEach(role => {
                db.run(`INSERT INTO roles (name, description, permissions, created_at) VALUES (?, ?, ?, datetime('now'))`, [role.name, role.description, role.permissions], (err) => {
                    if (err) console.error(`Failed to insert role ${role.name}:`, err.message);
                    else console.log(`✅ Role '${role.name}' added`);
                });
            });
        }
    });
}

seedDefaultRoles();

// Initialize fingerprint sensor
let sensor;
try {
    sensor = new FingerprintSensor(USE_BLUETOOTH, 'COM3', 57600);
    sensor.on('connected', () => console.log('✅ Fingerprint sensor ready'));
    sensor.on('error', (err) => console.error('Sensor error:', err));
    sensor.connect().catch(err => console.log('⚠️ Sensor not connected - running in simulation mode'));
} catch (error) {
    console.log('⚠️ Sensor initialization failed - running in simulation mode');
    sensor = {
        isConnected: false,
        portPath: 'COM3',
        enrollFingerprint: () => Promise.resolve({ success: true, template: Buffer.from([1,2,3,4]) }),
        identifyFingerprint: () => Promise.resolve({ success: true, userId: 1, score: 100 })
    };
}

// ============= MIDDLEWARE FUNCTIONS =============

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
}

const requireMasterAdmin = async (req, res, next) => {
    const userId = req.user.userId;
    db.get('SELECT role FROM users WHERE id = ?', [userId], (err, user) => {
        if (err || !user) return res.status(403).json({ error: 'Access denied' });
        if (user.role === 'master_admin') next();
        else return res.status(403).json({ error: 'Master admin access required' });
    });
};

const protectImmutableUser = (req, res, next) => {
    const userId = parseInt(req.params.userId) || parseInt(req.body.userId);
    if (!userId) return next();
    db.get('SELECT is_immutable FROM users WHERE id = ?', [userId], (err, user) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (user && user.is_immutable === 1) return res.status(403).json({ error: 'Cannot modify immutable master admin account' });
        next();
    });
};

const preventImmutableUserModification = (req, res, next) => {
    const targetUserId = req.params.userId || req.body.userId;
    if (!targetUserId) return next();
    db.get('SELECT is_immutable, role, username FROM users WHERE id = ?', [targetUserId], (err, user) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (user && user.is_immutable === 1) {
            console.warn(`⚠️ Attempt to modify immutable user: ${user.username}`);
            return res.status(403).json({ error: `Cannot modify immutable ${user.role} account: ${user.username}`, code: 'IMMUTABLE_USER' });
        }
        next();
    });
};

const preventExistingUserUpdate = (req, res, next) => {
    if (req.body.userId || req.params.userId) {
        const targetId = req.body.userId || req.params.userId;
        db.get('SELECT role, is_immutable FROM users WHERE id = ?', [targetId], (err, user) => {
            if (err) return next();
            if (user && (user.is_immutable === 1 || user.role === 'master_admin')) {
                return res.status(403).json({ error: 'Cannot modify master admin account' });
            }
            next();
        });
    } else {
        next();
    }
};

function getDefaultRoleDescription(role) {
    const descriptions = {
        'patient': 'Patient - Can view own health records and appointments',
        'doctor': 'Doctor - Can manage patient records and prescriptions',
        'nurse': 'Nurse - Can manage admissions and basic patient care',
        'receptionist': 'Receptionist - Can register patients and manage appointments',
        'pharmacist': 'Pharmacist - Can manage prescriptions and medications',
        'lab_technician': 'Lab Technician - Can upload and manage lab results',
        'radiologist': 'Radiologist - Can manage medical images and scans',
        'master_admin': 'Master Admin - Full system access',
        'billing_officer': 'Billing Officer - Can manage invoices and payments'
    };
    return descriptions[role] || `${role} role`;
}

function getDefaultPermissionsForRole(role) {
    const permissionsMap = {
        'patient': ['view_own_health_record', 'view_own_appointments', 'book_appointment', 'view_own_prescriptions', 'request_prescription_refill', 'update_own_profile'],
        'doctor': ['view_patient_records', 'create_prescription', 'update_prescription', 'view_appointments', 'manage_appointments', 'admit_patient', 'discharge_patient'],
        'nurse': ['view_patient_basic_info', 'manage_admissions', 'update_vital_signs', 'view_appointments', 'administer_medication'],
        'receptionist': ['register_patient', 'manage_appointments', 'view_patient_basic_info', 'update_patient_demographics'],
        'pharmacist': ['view_prescriptions', 'dispense_medication', 'update_inventory', 'view_patient_basic_info'],
        'lab_technician': ['upload_lab_results', 'view_lab_requests', 'update_test_status', 'view_patient_basic_info'],
        'radiologist': ['upload_medical_images', 'view_imaging_requests', 'write_radiology_reports', 'view_patient_basic_info'],
        'master_admin': ['*'],
        'billing_officer': ['view_billing_info', 'create_invoices', 'process_payments', 'view_patient_basic_info']
    };
    return permissionsMap[role] || [];
}

// ============= PUBLIC ENDPOINTS =============

app.get('/', (req, res) => {
    res.json({ message: 'E-Health System API', version: '1.0.0', status: 'running', timestamp: new Date().toISOString() });
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'healthy', uptime: process.uptime(), database: 'connected', sensor: sensor ? sensor.isConnected : false });
});

app.get('/api/sensor/status', (req, res) => {
    res.json({ connected: sensor ? sensor.isConnected : false, port: sensor ? sensor.portPath : 'COM3' });
});

app.post('/api/auth/register', async (req, res) => {
    const { username, password, email, healthRecordId, requestedRole, roleRequestReason, documents } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    
    db.get('SELECT id FROM users WHERE username = ?', [username], (err, user) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (user) return res.status(400).json({ error: 'Username already exists' });
        
        bcrypt.hash(password, 10, (err, hash) => {
            if (err) return res.status(500).json({ error: 'Error creating user' });
            
            const userRole = 'patient';
            const verificationStatus = requestedRole && requestedRole !== 'patient' ? 'pending' : 'approved';
            
            db.run('INSERT INTO users (username, password_hash, email, health_record_id, role, verification_status) VALUES (?, ?, ?, ?, ?, ?)', [username, hash, email || null, healthRecordId || `HR-${Date.now()}`, userRole, verificationStatus], function(err) {
                if (err) return res.status(500).json({ error: 'Error creating user' });
                const userId = this.lastID;
                
                if (requestedRole && requestedRole !== 'patient') {
                    RoleRequestService.createRequest(userId, requestedRole, documents || [], roleRequestReason || '')
                        .then(() => res.json({ success: true, userId, message: 'User created successfully. Your role request has been submitted for verification.', requiresVerification: true }))
                        .catch(() => res.json({ success: true, userId, message: 'User created successfully. Please contact admin for role verification.', requiresVerification: true }));
                } else {
                    res.json({ success: true, userId, message: 'User created successfully', requiresVerification: false });
                }
            });
        });
    });
});

app.post('/api/auth/login/password', (req, res) => {
    const { username, password } = req.body;
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });
        bcrypt.compare(password, user.password_hash, (err, result) => {
            if (err || !result) return res.status(401).json({ error: 'Invalid credentials' });
            const token = jwt.sign({ userId: user.id, username: user.username, role: user.role, healthRecordId: user.health_record_id }, JWT_SECRET, { expiresIn: '24h' });
            res.json({ success: true, token, user: { id: user.id, username: user.username, email: user.email, role: user.role, verificationStatus: user.verification_status, healthRecordId: user.health_record_id } });
        });
    });
});

app.post('/api/auth/login/fingerprint', async (req, res) => {
    const { username, fingerprintId } = req.body;
    if (!username) return res.status(400).json({ error: 'Username required' });
    
    let query = 'SELECT id, username, email, role, verification_status, health_record_id FROM users WHERE username = ?';
    let params = [username];
    if (fingerprintId) { query += ' AND fingerprint_id = ?'; params.push(fingerprintId); }
    
    db.get(query, params, (err, user) => {
        if (err || !user) return res.status(401).json({ success: false, error: 'Authentication failed' });
        const token = jwt.sign({ userId: user.id, username: user.username, role: user.role, healthRecordId: user.health_record_id }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ success: true, token, user: { id: user.id, username: user.username, email: user.email, role: user.role, verificationStatus: user.verification_status, healthRecordId: user.health_record_id } });
    });
});

app.post('/api/auth/login/fingerprint-only', async (req, res) => {
    const { fingerprintId } = req.body;
    if (!fingerprintId) return res.status(400).json({ success: false, error: 'Fingerprint ID required' });
    
    db.get('SELECT id, username, email, role, verification_status, health_record_id FROM users WHERE fingerprint_id = ? AND status = "active"', [fingerprintId], (err, user) => {
        if (err || !user) return res.status(401).json({ success: false, error: 'Fingerprint not recognized' });
        const token = jwt.sign({ userId: user.id, username: user.username, role: user.role, healthRecordId: user.health_record_id }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ success: true, token, user: { id: user.id, username: user.username, email: user.email, role: user.role, verificationStatus: user.verification_status, healthRecordId: user.health_record_id } });
    });
});

app.post('/api/auth/login/fingerprint/mock', (req, res) => {
    const { username } = req.body;
    db.get('SELECT id, username, email, role, verification_status, health_record_id FROM users WHERE username = ?', [username], (err, user) => {
        if (err || !user) return res.status(401).json({ error: 'User not found' });
        const token = jwt.sign({ userId: user.id, username: user.username, role: user.role, healthRecordId: user.health_record_id }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ success: true, token, user: { id: user.id, username: user.username, email: user.email, role: user.role, verificationStatus: user.verification_status, healthRecordId: user.health_record_id } });
    });
});

app.get('/api/auth/verify', authenticateToken, (req, res) => {
    res.json({ valid: true, user: req.user });
});

// ============= HEALTH RECORDS ENDPOINTS =============

app.get('/api/health-records', authenticateToken, (req, res) => {
    db.all(
        'SELECT * FROM health_records WHERE user_id = ? ORDER BY created_at DESC',
        [req.user.userId],
        (err, records) => {
            if (err) {
                console.error('Error fetching health records:', err);
                return res.json([]);
            }
            res.json(records || []);
        }
    );
});

app.post('/api/health-records', authenticateToken, (req, res) => {
    const { recordData } = req.body;
    
    db.run(
        'INSERT INTO health_records (user_id, record_data) VALUES (?, ?)',
        [req.user.userId, JSON.stringify(recordData)],
        function(err) {
            if (err) {
                console.error('Error creating health record:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({ 
                success: true, 
                id: this.lastID,
                message: 'Record added successfully' 
            });
        }
    );
});

app.post('/api/health-records/with-file', authenticateToken, upload.single('file'), async (req, res) => {
    const { recordData } = req.body;
    const file = req.file;
    
    try {
        let record;
        try {
            record = typeof recordData === 'string' ? JSON.parse(recordData) : recordData;
        } catch (e) {
            record = { text: recordData };
        }
        
        const recordId = await new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO health_records (user_id, record_data) VALUES (?, ?)',
                [req.user.userId, JSON.stringify(record)],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
        
        if (file) {
            const fileInfo = await uploadService.saveFile(file, req.user.userId, recordId);
            
            await new Promise((resolve, reject) => {
                db.run(
                    `INSERT INTO health_record_attachments 
                     (health_record_id, user_id, file_name, file_type, file_size, file_path, description)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [recordId, req.user.userId, fileInfo.fileName, fileInfo.fileType, fileInfo.fileSize, fileInfo.filePath, record.description || ''],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
            
            res.json({
                success: true,
                id: recordId,
                attachment: fileInfo,
                message: 'Health record with attachment added successfully'
            });
        } else {
            res.json({
                success: true,
                id: recordId,
                message: 'Health record added successfully'
            });
        }
    } catch (error) {
        console.error('Error creating health record:', error);
        res.status(500).json({ error: 'Failed to create health record' });
    }
});

app.get('/api/health-records/:recordId/attachments', authenticateToken, (req, res) => {
    db.all(
        `SELECT id, health_record_id, file_name, file_type, file_size, description, uploaded_at
         FROM health_record_attachments 
         WHERE health_record_id = ? AND user_id = ?
         ORDER BY uploaded_at DESC`,
        [req.params.recordId, req.user.userId],
        (err, attachments) => {
            if (err) {
                console.error('Error fetching attachments:', err);
                return res.json([]);
            }
            res.json(attachments || []);
        }
    );
});

app.get('/api/health-records/attachments/:attachmentId/download', authenticateToken, (req, res) => {
    db.get(
        `SELECT * FROM health_record_attachments WHERE id = ? AND user_id = ?`,
        [req.params.attachmentId, req.user.userId],
        (err, attachment) => {
            if (err || !attachment) {
                return res.status(404).json({ error: 'Attachment not found' });
            }
            
            if (fs.existsSync(attachment.file_path)) {
                res.download(attachment.file_path, attachment.file_name);
            } else {
                res.status(404).json({ error: 'File not found' });
            }
        }
    );
});

app.delete('/api/health-records/attachments/:attachmentId', authenticateToken, (req, res) => {
    db.get(
        `SELECT * FROM health_record_attachments WHERE id = ? AND user_id = ?`,
        [req.params.attachmentId, req.user.userId],
        async (err, attachment) => {
            if (err || !attachment) {
                return res.status(404).json({ error: 'Attachment not found' });
            }
            
            await uploadService.deleteFile(attachment.file_path);
            
            db.run(
                'DELETE FROM health_record_attachments WHERE id = ?',
                [req.params.attachmentId],
                (err) => {
                    if (err) {
                        return res.status(500).json({ error: 'Failed to delete attachment' });
                    }
                    res.json({ success: true, message: 'Attachment deleted successfully' });
                }
            );
        }
    );
});

app.delete('/api/health-records/:id', authenticateToken, (req, res) => {
    const recordId = req.params.id;
    
    db.all(
        'SELECT * FROM health_record_attachments WHERE health_record_id = ?',
        [recordId],
        async (err, attachments) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            
            for (const attachment of attachments) {
                await uploadService.deleteFile(attachment.file_path);
            }
            
            db.run(
                'DELETE FROM health_record_attachments WHERE health_record_id = ?',
                [recordId],
                (err) => {
                    if (err) console.error('Error deleting attachments:', err);
                }
            );
            
            db.run(
                'DELETE FROM health_records WHERE id = ? AND user_id = ?',
                [recordId, req.user.userId],
                function(err) {
                    if (err) {
                        return res.status(500).json({ error: 'Database error' });
                    }
                    if (this.changes === 0) {
                        return res.status(404).json({ error: 'Record not found' });
                    }
                    res.json({ success: true, message: 'Record deleted successfully' });
                }
            );
        }
    );
});

// ============= PATIENT FINANCIAL INFO =============

app.get('/api/patients/financial-info', authenticateToken, (req, res) => {
    const patientId = req.user.userId;
    db.get(`SELECT COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) as totalPaid, COALESCE(SUM(amount), 0) as totalBilled, COALESCE(SUM(CASE WHEN status != 'paid' THEN amount - COALESCE(paid_amount, 0) ELSE 0 END), 0) as outstandingBalance FROM invoices WHERE patient_id = ?`, [patientId], (err, result) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        db.all(`SELECT id, invoice_number, amount, description, status, created_at FROM invoices WHERE patient_id = ? ORDER BY created_at DESC LIMIT 5`, [patientId], (err2, invoices) => {
            res.json({ ...result, recentInvoices: invoices });
        });
    });
});

// ============= BILLING ENDPOINTS =============

app.get('/api/billing/stats', authenticateToken, (req, res) => {
    db.get(`SELECT COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) as totalRevenue, COALESCE(SUM(CASE WHEN status = 'pending' THEN amount - COALESCE(paid_amount, 0) ELSE 0 END), 0) as pendingPayments, COUNT(CASE WHEN status = 'paid' THEN 1 END) as paidInvoices, COALESCE(SUM(CASE WHEN status != 'paid' THEN amount - COALESCE(paid_amount, 0) ELSE 0 END), 0) as outstandingBalance, (SELECT COUNT(*) FROM users WHERE role = 'patient') as totalPatients FROM invoices`, [], (err, stats) => { res.json(stats); });
});

app.get('/api/billing/invoices', authenticateToken, (req, res) => {
    db.all(`SELECT i.*, u.username as patient_name FROM invoices i JOIN users u ON i.patient_id = u.id ORDER BY i.created_at DESC`, [], (err, invoices) => { res.json(invoices); });
});

app.post('/api/billing/invoices', authenticateToken, (req, res) => {
    const { patientId, amount, description, dueDate } = req.body;
    const invoiceNumber = `INV-${Date.now()}`;
    db.run(`INSERT INTO invoices (invoice_number, patient_id, amount, description, due_date, created_by) VALUES (?,?,?,?,?,?)`, [invoiceNumber, patientId, amount, description, dueDate, req.user.userId], function(err) {
        if (err) return res.status(500).json({ error: 'Failed to create invoice' });
        res.json({ success: true, id: this.lastID });
    });
});

app.post('/api/billing/invoices/:id/pay', authenticateToken, (req, res) => {
    const { amount, method, reference } = req.body;
    db.run(`UPDATE invoices SET paid_amount = COALESCE(paid_amount, 0) + ?, status = 'paid' WHERE id = ?`, [amount, req.params.id]);
    db.run(`INSERT INTO payments (invoice_id, amount, method, reference) VALUES (?,?,?,?)`, [req.params.id, amount, method, reference], (err) => { res.json({ success: true }); });
});

// ============= DOCTOR ADMIT/DISCHARGE =============

app.post('/api/doctor/admissions', authenticateToken, (req, res) => {
    const { patientId, ward, bedNumber, reason, diagnosis, expectedStayDays } = req.body;
    db.run(`INSERT INTO admissions (patient_id, doctor_id, ward, bed_number, reason, diagnosis, expected_stay_days, admitted_by) VALUES (?,?,?,?,?,?,?,?)`, [patientId, req.user.userId, ward, bedNumber, reason, diagnosis, expectedStayDays, req.user.userId], function(err) {
        if (err) return res.status(500).json({ error: 'Failed to admit patient' });
        db.run(`UPDATE users SET status = 'admitted' WHERE id = ?`, [patientId]);
        res.json({ success: true, id: this.lastID });
    });
});

app.post('/api/doctor/admissions/:id/discharge', authenticateToken, (req, res) => {
    const { dischargeNotes, dischargeInstructions } = req.body;
    db.run(`UPDATE admissions SET discharge_date = CURRENT_TIMESTAMP, discharge_notes = ?, discharge_instructions = ?, status = 'discharged' WHERE id = ?`, [dischargeNotes, dischargeInstructions, req.params.id], (err) => {
        if (err) return res.status(500).json({ error: 'Failed to discharge' });
        db.get(`SELECT patient_id FROM admissions WHERE id = ?`, [req.params.id], (err2, admission) => {
            db.run(`UPDATE users SET status = 'active' WHERE id = ?`, [admission.patient_id]);
            res.json({ success: true });
        });
    });
});

// ============= APPOINTMENT SYNC =============

app.get('/api/appointments/sync', authenticateToken, (req, res) => {
    const userId = req.user.userId;
    
    const sql = `
        SELECT a.*, 
               u1.username as patient_name, 
               u1.health_record_id as patient_health_id,
               u2.username as doctor_name,
               u2.health_record_id as doctor_health_id
        FROM appointments a 
        LEFT JOIN users u1 ON a.patient_id = u1.id 
        LEFT JOIN users u2 ON a.doctor_id = u2.id 
        WHERE a.patient_id = ? OR a.doctor_id = ?
        ORDER BY a.appointment_date, a.appointment_time
    `;
    
    db.all(sql, [userId, userId], (err, appointments) => {
        if (err) {
            console.error('Error fetching appointments:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(appointments || []);
    });
});

// ============= NURSE ENDPOINTS =============

app.get('/api/nurse/vitals', authenticateToken, (req, res) => {
    db.all(`SELECT v.*, u.username as patient_name FROM patient_vitals v JOIN users u ON v.patient_id = u.id ORDER BY v.recorded_at DESC LIMIT 100`, [], (err, vitals) => { res.json(vitals); });
});

app.post('/api/nurse/patients/:patientId/vitals', authenticateToken, (req, res) => {
    const { patientId } = req.params;
    const { temperature, bloodPressure, heartRate, respiratoryRate, oxygenSaturation, weight, height, notes } = req.body;
    db.run(`INSERT INTO patient_vitals (patient_id, temperature, blood_pressure, heart_rate, respiratory_rate, oxygen_saturation, weight, height, notes, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`, [patientId, temperature, bloodPressure, heartRate, respiratoryRate, oxygenSaturation, weight, height, notes, req.user.userId], function(err) {
        if (err) return res.status(500).json({ error: 'Failed to record vitals' });
        res.json({ success: true, message: 'Vitals recorded successfully' });
    });
});

app.post('/api/nurse/patients/:patientId/medications', authenticateToken, (req, res) => {
    const { patientId } = req.params;
    const { medication, dosage, route, frequency, administeredAt, notes } = req.body;
    db.run(`INSERT INTO medication_administration (patient_id, medication, dosage, route, frequency, administered_at, notes, administered_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [patientId, medication, dosage, route, frequency, administeredAt || new Date().toISOString(), notes, req.user.userId], function(err) {
        if (err) return res.status(500).json({ error: 'Failed to record medication' });
        res.json({ success: true, message: 'Medication recorded successfully' });
    });
});

// ============= FINANCE ENDPOINTS =============

app.get('/api/finance/stats', authenticateToken, (req, res) => {
    db.get(`SELECT COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) as totalRevenue, COALESCE(SUM(CASE WHEN status = 'pending' THEN amount - COALESCE(paid_amount, 0) ELSE 0 END), 0) as pendingPayments, COUNT(CASE WHEN status = 'paid' THEN 1 END) as paidInvoices, COALESCE(SUM(CASE WHEN status != 'paid' THEN amount - COALESCE(paid_amount, 0) ELSE 0 END), 0) as outstandingBalance FROM invoices`, [], (err, result) => { res.json(result); });
});

app.get('/api/finance/revenue', authenticateToken, (req, res) => {
    const { period } = req.query;
    let sql;
    switch(period) {
        case 'day': sql = `SELECT strftime('%Y-%m-%d', created_at) as label, SUM(amount) as amount FROM invoices WHERE status = 'paid' AND created_at >= date('now', '-7 days') GROUP BY strftime('%Y-%m-%d', created_at) ORDER BY created_at`; break;
        case 'week': sql = `SELECT strftime('%Y-%W', created_at) as label, SUM(amount) as amount FROM invoices WHERE status = 'paid' AND created_at >= date('now', '-3 months') GROUP BY strftime('%Y-%W', created_at) ORDER BY created_at`; break;
        case 'month': sql = `SELECT strftime('%Y-%m', created_at) as label, SUM(amount) as amount FROM invoices WHERE status = 'paid' AND created_at >= date('now', '-12 months') GROUP BY strftime('%Y-%m', created_at) ORDER BY created_at`; break;
        default: sql = `SELECT strftime('%Y', created_at) as label, SUM(amount) as amount FROM invoices WHERE status = 'paid' GROUP BY strftime('%Y', created_at) ORDER BY created_at`;
    }
    db.all(sql, [], (err, results) => { res.json({ [period === 'day' ? 'daily' : period === 'week' ? 'weekly' : period === 'month' ? 'monthly' : 'yearly']: results }); });
});

app.get('/api/finance/invoices', authenticateToken, (req, res) => {
    db.all(`SELECT i.*, u.username as patient_name, u.health_record_id FROM invoices i JOIN users u ON i.patient_id = u.id ORDER BY i.created_at DESC`, [], (err, invoices) => { res.json(invoices); });
});

app.post('/api/finance/invoices', authenticateToken, (req, res) => {
    const { patientId, amount, description, dueDate } = req.body;
    const invoiceNumber = `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    db.run(`INSERT INTO invoices (invoice_number, patient_id, amount, description, due_date, status, created_by) VALUES (?, ?, ?, ?, ?, 'pending', ?)`, [invoiceNumber, patientId, amount, description, dueDate, req.user.userId], function(err) {
        if (err) return res.status(500).json({ error: 'Failed to create invoice' });
        res.json({ success: true, id: this.lastID, message: 'Invoice created successfully' });
    });
});

// ============= HOSPITAL ADMIN DASHBOARD =============

app.get('/api/admin/dashboard/stats', authenticateToken, (req, res) => {
    const queries = {
        patients: `SELECT COUNT(*) as total, SUM(CASE WHEN date(created_at) = date('now') THEN 1 ELSE 0 END) as newToday FROM users WHERE role = 'patient'`,
        appointments: `SELECT COUNT(*) as total, SUM(CASE WHEN date(appointment_date) = date('now') THEN 1 ELSE 0 END) as today FROM appointments`,
        admissions: `SELECT COUNT(*) as active FROM admissions WHERE status = 'admitted'`,
        finance: `SELECT COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) as totalRevenue FROM invoices`
    };
    const results = {};
    let completed = 0;
    const total = Object.keys(queries).length;
    for (const [key, query] of Object.entries(queries)) {
        db.get(query, [], (err, data) => {
            results[key] = data || {};
            completed++;
            if (completed === total) res.json(results);
        });
    }
});

app.get('/api/admin/dashboard/activities', authenticateToken, (req, res) => {
    res.json([
        { icon: '👤', title: 'New Patient Registered', description: 'John Doe was registered', time: '5 minutes ago' },
        { icon: '📅', title: 'Appointment Scheduled', description: 'Appointment with Dr. Smith', time: '15 minutes ago' }
    ]);
});

app.get('/api/admin/dashboard/alerts', authenticateToken, (req, res) => {
    res.json([
        { type: 'critical', title: 'Low Stock Alert', message: 'Amoxicillin running low', time: '10 minutes ago' }
    ]);
});

// ============= ROLES ENDPOINTS =============

app.get('/api/roles', authenticateToken, (req, res) => {
    db.all(`SELECT id, name, description, permissions, created_at FROM roles ORDER BY name`, [], (err, roles) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        const rolesWithPermissions = roles.map(role => ({ ...role, permissions: role.permissions ? JSON.parse(role.permissions) : [] }));
        res.json(rolesWithPermissions);
    });
});

app.get('/api/roles/my/permissions', authenticateToken, (req, res) => {
    const userId = req.user.userId;
    db.get('SELECT id, username, role, is_immutable FROM users WHERE id = ?', [userId], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'User not found' });
        if (user.is_immutable === 1) return res.json({ role: user.role, permissions: ['*'], isImmutable: true });
        db.get('SELECT permissions FROM roles WHERE name = ?', [user.role], (err, role) => {
            if (err || !role) return res.json({ role: user.role, permissions: getDefaultPermissionsForRole(user.role) });
            res.json({ role: user.role, permissions: role.permissions ? JSON.parse(role.permissions) : [] });
        });
    });
});

// ============= DOCTOR PATIENTS =============

app.get('/api/doctor/patients', authenticateToken, (req, res) => {
    db.all(`SELECT u.id, u.username, u.email, u.health_record_id, u.created_at, sd.contact_number, sd.full_name FROM users u LEFT JOIN staff_details sd ON u.id = sd.user_id WHERE u.role = 'patient' ORDER BY u.created_at DESC`, [], (err, patients) => { res.json(patients); });
});

// ============= APPOINTMENT ENDPOINTS =============

app.post('/api/appointments', authenticateToken, (req, res) => {
    const { title, description, appointment_date, appointment_time, duration, doctor_id, patient_id } = req.body;
    
    let finalPatientId;
    let finalDoctorId;
    
    if (req.user.role === 'patient') {
        finalPatientId = req.user.userId;
        finalDoctorId = doctor_id;
    } else if (req.user.role === 'receptionist' || req.user.role === 'master_admin') {
        finalPatientId = patient_id;
        finalDoctorId = doctor_id;
    } else {
        return res.status(403).json({ error: 'You do not have permission to create appointments' });
    }
    
    if (!finalPatientId || !finalDoctorId) {
        return res.status(400).json({ error: 'Patient and doctor are required' });
    }
    
    if (!title || !appointment_date || !appointment_time) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    db.get(
        `SELECT COUNT(*) as count FROM appointments 
         WHERE doctor_id = ? AND appointment_date = ? AND appointment_time = ? 
         AND status != 'cancelled'`,
        [finalDoctorId, appointment_date, appointment_time],
        (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Database error' });
            }
            
            if (result.count > 0) {
                return res.status(400).json({ error: 'Time slot not available' });
            }
            
            db.run(
                `INSERT INTO appointments 
                 (patient_id, doctor_id, title, description, appointment_date, appointment_time, duration, status, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', CURRENT_TIMESTAMP)`,
                [finalPatientId, finalDoctorId, title, description, appointment_date, appointment_time, duration || 30],
                function(err) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({ error: 'Failed to create appointment' });
                    }
                    
                    res.json({
                        success: true,
                        id: this.lastID,
                        message: 'Appointment created successfully'
                    });
                }
            );
        }
    );
});

app.get('/api/appointments', authenticateToken, (req, res) => {
    const userId = req.user.userId;
    const userRole = req.user.role;
    
    let sql;
    let params = [];
    
    if (userRole === 'doctor') {
        sql = `
            SELECT a.*, 
                   u1.username as patient_name, 
                   u1.health_record_id as patient_health_id,
                   u2.username as doctor_name
            FROM appointments a
            LEFT JOIN users u1 ON a.patient_id = u1.id
            LEFT JOIN users u2 ON a.doctor_id = u2.id
            WHERE a.doctor_id = ? AND a.status != 'cancelled'
            ORDER BY a.appointment_date, a.appointment_time
        `;
        params = [userId];
    } else if (userRole === 'patient') {
        sql = `
            SELECT a.*, 
                   u1.username as patient_name,
                   u2.username as doctor_name,
                   u2.health_record_id as doctor_health_id
            FROM appointments a
            LEFT JOIN users u1 ON a.patient_id = u1.id
            LEFT JOIN users u2 ON a.doctor_id = u2.id
            WHERE a.patient_id = ? AND a.status != 'cancelled'
            ORDER BY a.appointment_date, a.appointment_time
        `;
        params = [userId];
    } else {
        sql = `
            SELECT a.*, 
                   u1.username as patient_name, 
                   u1.health_record_id as patient_health_id,
                   u2.username as doctor_name,
                   u2.health_record_id as doctor_health_id
            FROM appointments a
            LEFT JOIN users u1 ON a.patient_id = u1.id
            LEFT JOIN users u2 ON a.doctor_id = u2.id
            WHERE a.status != 'cancelled'
            ORDER BY a.appointment_date, a.appointment_time
        `;
        params = [];
    }
    
    db.all(sql, params, (err, appointments) => {
        if (err) {
            console.error('Error fetching appointments:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(appointments || []);
    });
});

app.delete('/api/appointments/:id', authenticateToken, (req, res) => {
    db.run(`UPDATE appointments SET status = 'cancelled' WHERE id = ?`, [req.params.id], function(err) { 
        res.json({ success: true }); 
    });
});

app.get('/api/appointments/patient/:patientId', authenticateToken, (req, res) => {
    const { patientId } = req.params;
    
    if (!['doctor', 'receptionist', 'master_admin'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Access denied' });
    }
    
    const sql = `
        SELECT a.*, 
               u1.username as patient_name, 
               u2.username as doctor_name,
               u2.health_record_id as doctor_health_id
        FROM appointments a
        LEFT JOIN users u1 ON a.patient_id = u1.id
        LEFT JOIN users u2 ON a.doctor_id = u2.id
        WHERE a.patient_id = ?
        ORDER BY a.appointment_date, a.appointment_time
    `;
    
    db.all(sql, [patientId], (err, appointments) => {
        if (err) {
            console.error('Error fetching patient appointments:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(appointments || []);
    });
});

app.get('/api/appointments/doctor/:doctorId', authenticateToken, (req, res) => {
    const { doctorId } = req.params;
    
    const sql = `
        SELECT a.*, 
               u1.username as patient_name, 
               u1.health_record_id as patient_health_id,
               u2.username as doctor_name
        FROM appointments a
        LEFT JOIN users u1 ON a.patient_id = u1.id
        LEFT JOIN users u2 ON a.doctor_id = u2.id
        WHERE a.doctor_id = ?
        ORDER BY a.appointment_date, a.appointment_time
    `;
    
    db.all(sql, [doctorId], (err, appointments) => {
        if (err) {
            console.error('Error fetching doctor appointments:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(appointments || []);
    });
});

app.get('/api/doctors', authenticateToken, (req, res) => {
    const sql = `
        SELECT id, username, email, health_record_id 
        FROM users 
        WHERE role = 'doctor' AND verification_status = 'approved' AND status = 'active'
    `;
    
    db.all(sql, [], (err, doctors) => {
        if (err) {
            console.error('Error fetching doctors:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        console.log(`📋 Found ${doctors.length} doctors`);
        res.json(doctors || []);
    });
});

app.get('/api/doctor/appointments', authenticateToken, (req, res) => {
    const doctorId = req.user.userId;
    
    const sql = `
        SELECT a.*, 
               u.username as patient_name,
               u.health_record_id as patient_health_id,
               u.email as patient_email
        FROM appointments a
        JOIN users u ON a.patient_id = u.id
        WHERE a.doctor_id = ? AND a.status != 'cancelled'
        ORDER BY a.appointment_date, a.appointment_time
    `;
    
    db.all(sql, [doctorId], (err, appointments) => {
        if (err) {
            console.error('Error fetching doctor appointments:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(appointments || []);
    });
});

// ============= PRESCRIPTION ENDPOINTS =============

app.get('/api/prescriptions', authenticateToken, (req, res) => {
    const sql = req.user.role === 'doctor' ? `SELECT p.*, u.username as patient_name FROM prescriptions p JOIN users u ON p.patient_id = u.id WHERE p.doctor_id = ? ORDER BY p.prescribed_date DESC` : `SELECT p.*, u.username as doctor_name FROM prescriptions p JOIN users u ON p.doctor_id = u.id WHERE p.patient_id = ? ORDER BY p.prescribed_date DESC`;
    db.all(sql, [req.user.userId], (err, prescriptions) => { 
        if (err) return res.json([]);
        res.json(prescriptions || []); 
    });
});

app.post('/api/prescriptions', authenticateToken, (req, res) => {
    const { patientId, medication, dosage, frequency, duration, notes, refills } = req.body;
    db.run(`INSERT INTO prescriptions (patient_id, doctor_id, medication, dosage, frequency, duration, notes, refills, prescribed_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`, [patientId, req.user.userId, medication, dosage, frequency, duration, notes, refills || 0], function(err) {
        if (err) return res.status(500).json({ error: 'Failed to create prescription' });
        res.json({ success: true, id: this.lastID, message: 'Prescription created successfully' });
    });
});

// ============= LAB ENDPOINTS =============

app.get('/api/lab/requests', authenticateToken, (req, res) => {
    db.all(`SELECT lr.*, u.username as patient_name FROM lab_requests lr JOIN users u ON lr.patient_id = u.id ORDER BY CASE WHEN lr.priority = 'urgent' AND lr.status != 'completed' THEN 1 ELSE 2 END, lr.created_at DESC`, [], (err, requests) => { 
        if (err) return res.json([]);
        res.json(requests || []); 
    });
});

app.post('/api/lab/requests', authenticateToken, upload.single('file'), async (req, res) => {
    const { patientId, testType, sampleType, priority, notes } = req.body;
    let filePath = null;
    if (req.file) { const fileInfo = await uploadService.saveFile(req.file, patientId, 'lab'); filePath = fileInfo.filePath; }
    db.run(`INSERT INTO lab_requests (patient_id, test_type, sample_type, priority, notes, attachment, status, requested_by) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`, [patientId, testType, sampleType, priority, notes, filePath, req.user.userId], function(err) {
        if (err) return res.status(500).json({ error: 'Failed to create lab request' });
        res.json({ success: true, id: this.lastID, message: 'Lab request created successfully' });
    });
});

app.put('/api/lab/requests/:id/results', authenticateToken, (req, res) => {
    const { results } = req.body;
    db.run(`UPDATE lab_requests SET results = ?, status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?`, [results, req.params.id], function(err) { 
        res.json({ success: true }); 
    });
});

// ============= PHARMACY ENDPOINTS =============

app.get('/api/pharmacist/prescriptions', authenticateToken, (req, res) => {
    db.all(`SELECT p.*, u.username as patient_name, d.username as doctor_name FROM prescriptions p JOIN users u ON p.patient_id = u.id JOIN users d ON p.doctor_id = d.id WHERE p.status != 'cancelled' ORDER BY CASE WHEN p.status = 'prescribed' THEN 1 ELSE 2 END, p.prescribed_date DESC`, [], (err, prescriptions) => { 
        if (err) return res.json([]);
        res.json(prescriptions || []); 
    });
});

app.post('/api/pharmacist/prescriptions/:id/dispense', authenticateToken, (req, res) => {
    const { dispensedQuantity, notes } = req.body;
    db.run(`UPDATE prescriptions SET status = 'dispensed', dispensed_at = CURRENT_TIMESTAMP, dispensed_by = ?, dispensed_quantity = ?, pharmacist_notes = ? WHERE id = ?`, [req.user.userId, dispensedQuantity, notes, req.params.id], function(err) { 
        res.json({ success: true }); 
    });
});

app.get('/api/pharmacist/inventory', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM pharmacy_inventory ORDER BY medication_name`, [], (err, inventory) => { 
        if (err) return res.json([]);
        res.json(inventory || []); 
    });
});

app.post('/api/pharmacist/inventory', authenticateToken, (req, res) => {
    const { medicationName, quantity, unit, price, expiryDate, manufacturer, requiresPrescription } = req.body;
    db.run(`INSERT INTO pharmacy_inventory (medication_name, quantity, unit, price, expiry_date, manufacturer, requires_prescription, min_stock_threshold) VALUES (?, ?, ?, ?, ?, ?, ?, 10)`, [medicationName, quantity, unit, price, expiryDate, manufacturer, requiresPrescription ? 1 : 0], function(err) { 
        if (err) return res.status(500).json({ error: 'Failed to add medication' });
        res.json({ success: true }); 
    });
});

app.put('/api/pharmacist/inventory/:id/restock', authenticateToken, (req, res) => {
    const { quantity } = req.body;
    db.run(`UPDATE pharmacy_inventory SET quantity = quantity + ? WHERE id = ?`, [quantity, req.params.id], function(err) { 
        res.json({ success: true }); 
    });
});

// ============= RADIOLOGY ENDPOINTS =============

app.get('/api/radiologist/imaging', authenticateToken, (req, res) => {
    db.all(`SELECT i.*, u.username as patient_name FROM imaging_studies i JOIN users u ON i.patient_id = u.id ORDER BY i.created_at DESC`, [], (err, studies) => { 
        if (err) return res.json([]);
        res.json(studies || []); 
    });
});

app.post('/api/radiologist/upload', authenticateToken, upload.single('file'), async (req, res) => {
    const { patientId, testType, bodyPart, description, findings } = req.body;
    const fileInfo = await uploadService.saveFile(req.file, patientId, 'imaging');
    db.run(`INSERT INTO imaging_studies (patient_id, test_type, body_part, description, findings, image_url, status, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`, [patientId, testType, bodyPart, description, findings, fileInfo.filePath, req.user.userId], function(err) { 
        if (err) return res.status(500).json({ error: 'Failed to upload' });
        res.json({ success: true }); 
    });
});

app.put('/api/radiologist/imaging/:id/report', authenticateToken, (req, res) => {
    const { findings } = req.body;
    db.run(`UPDATE imaging_studies SET findings = ?, status = 'completed', report_completed_at = CURRENT_TIMESTAMP WHERE id = ?`, [findings, req.params.id], function(err) { 
        res.json({ success: true }); 
    });
});

// ============= MASTER ADMIN ENDPOINTS =============

app.get('/api/master-admin/users', authenticateToken, requireMasterAdmin, (req, res) => {
    db.all(`SELECT u.id, u.username, u.email, u.role, u.health_record_id, u.verification_status, u.created_at FROM users u ORDER BY u.created_at DESC`, [], (err, users) => { 
        if (err) return res.json([]);
        res.json(users || []); 
    });
});

app.put('/api/master-admin/users/:userId/verify', authenticateToken, requireMasterAdmin, preventImmutableUserModification, (req, res) => {
    const { role } = req.body;
    db.run(`UPDATE users SET role = ?, verification_status = 'approved', verified_by = ?, verified_at = CURRENT_TIMESTAMP WHERE id = ?`, [role, req.user.userId, req.params.userId], function(err) { 
        if (err) return res.status(500).json({ error: 'Failed to verify user' });
        res.json({ success: true }); 
    });
});

app.put('/api/master-admin/users/:userId/role', authenticateToken, requireMasterAdmin, preventImmutableUserModification, (req, res) => {
    const { role } = req.body;
    if (parseInt(req.params.userId) === req.user.userId) return res.status(400).json({ error: 'Cannot change your own role' });
    db.run(`UPDATE users SET role = ? WHERE id = ?`, [role, req.params.userId], function(err) { 
        if (err) return res.status(500).json({ error: 'Failed to update role' });
        res.json({ success: true }); 
    });
});

app.delete('/api/master-admin/users/:userId', authenticateToken, requireMasterAdmin, protectImmutableUser, (req, res) => {
    if (parseInt(req.params.userId) === req.user.userId) return res.status(400).json({ error: 'Cannot delete your own account' });
    db.run(`DELETE FROM users WHERE id = ?`, [req.params.userId], function(err) { 
        if (err) return res.status(500).json({ error: 'Failed to delete user' });
        res.json({ success: true }); 
    });
});

app.get('/api/master-admin/statistics', authenticateToken, requireMasterAdmin, (req, res) => {
    const queries = { totalUsers: 'SELECT COUNT(*) as count FROM users', pendingVerification: 'SELECT COUNT(*) as count FROM users WHERE verification_status = "pending"', totalRoles: 'SELECT COUNT(*) as count FROM roles' };
    const results = {};
    let completed = 0;
    for (const [key, query] of Object.entries(queries)) {
        db.get(query, [], (err, data) => {
            results[key] = data || { count: 0 };
            completed++;
            if (completed === Object.keys(queries).length) res.json(results);
        });
    }
});

// ============= ROLE REQUESTS ENDPOINTS =============

app.get('/api/master-admin/role-requests/pending', authenticateToken, requireMasterAdmin, async (req, res) => {
    try {
        const requests = await RoleRequestService.getPendingRequests();
        console.log('📋 Pending role requests found:', requests.length);
        res.json(requests);
    } catch (error) {
        console.error('Error fetching pending requests:', error);
        res.status(500).json({ error: 'Failed to fetch requests' });
    }
});

app.get('/api/master-admin/role-requests', authenticateToken, requireMasterAdmin, async (req, res) => {
    const { status, userId, limit, offset } = req.query;
    try {
        const requests = await RoleRequestService.getAllRequests({ status, userId, limit, offset });
        console.log('📋 Role requests found:', requests.length);
        res.json(requests);
    } catch (error) {
        console.error('Error fetching role requests:', error);
        res.status(500).json({ error: 'Failed to fetch requests' });
    }
});

app.post('/api/master-admin/role-requests/:requestId/approve', authenticateToken, requireMasterAdmin, async (req, res) => {
    const { requestId } = req.params;
    const verifierId = req.user.userId;
    
    try {
        await RoleRequestService.approveRequest(requestId, verifierId);
        console.log(`✅ Role request ${requestId} approved by user ${verifierId}`);
        res.json({ success: true, message: 'Role request approved successfully' });
    } catch (error) {
        console.error('Error approving request:', error);
        res.status(500).json({ error: error.message || 'Failed to approve request' });
    }
});

app.post('/api/master-admin/role-requests/:requestId/reject', authenticateToken, requireMasterAdmin, async (req, res) => {
    const { requestId } = req.params;
    const verifierId = req.user.userId;
    const { rejectionReason } = req.body;
    
    try {
        await RoleRequestService.rejectRequest(requestId, verifierId, rejectionReason);
        console.log(`❌ Role request ${requestId} rejected by user ${verifierId}`);
        res.json({ success: true, message: 'Role request rejected' });
    } catch (error) {
        console.error('Error rejecting request:', error);
        res.status(500).json({ error: 'Failed to reject request' });
    }
});

app.get('/api/users/role-request/status', authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    try {
        const request = await RoleRequestService.getUserRequestStatus(userId);
        res.json(request || null);
    } catch (error) {
        console.error('Error fetching user request status:', error);
        res.status(500).json({ error: 'Failed to fetch request status' });
    }
});

// ============= PATIENT MANAGEMENT ENDPOINTS =============

app.post('/api/patients/register', authenticateToken, preventExistingUserUpdate, (req, res) => {
    if (!['receptionist', 'master_admin', 'ict_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Access denied' });
    const { username, email, password, healthRecordId, patientDetails } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    
    db.get('SELECT id FROM users WHERE username = ?', [username], (err, existingUser) => {
        if (existingUser) return res.status(400).json({ error: 'Username already exists' });
        bcrypt.hash(password, 10, (err, hash) => {
            const finalHealthRecordId = healthRecordId || `HR-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
            db.run(`INSERT INTO users (username, password_hash, email, health_record_id, role, verification_status, status, created_at, is_immutable) VALUES (?, ?, ?, ?, 'patient', 'approved', 'active', datetime('now'), 0)`, [username, hash, email || null, finalHealthRecordId], function(err) {
                if (err) return res.status(500).json({ error: 'Error creating user' });
                const userId = this.lastID;
                if (patientDetails) {
                    db.run(`INSERT INTO staff_details (user_id, contact_number, emergency_contact, department, full_name, date_of_birth, gender, address, blood_type, allergies) VALUES (?, ?, ?, 'Patient', ?, ?, ?, ?, ?, ?)`, [userId, patientDetails.phoneNumber || null, patientDetails.emergencyContact || null, patientDetails.fullName || null, patientDetails.dateOfBirth || null, patientDetails.gender || null, patientDetails.address || null, patientDetails.bloodType || null, patientDetails.allergies || null]);
                }
                res.json({ success: true, userId, message: 'Patient registered successfully' });
            });
        });
    });
});

app.get('/api/patients', authenticateToken, (req, res) => {
    db.all(`SELECT u.id, u.username, u.email, u.health_record_id, u.created_at, u.verification_status, u.role, s.contact_number FROM users u LEFT JOIN staff_details s ON u.id = s.user_id WHERE u.role = 'patient' ORDER BY u.created_at DESC`, [], (err, patients) => { 
        if (err) return res.json([]);
        res.json(patients || []); 
    });
});

// Get single patient by ID
app.get('/api/patients/:patientId', authenticateToken, (req, res) => {
    const patientId = req.params.patientId;
    
    if (parseInt(req.user.userId) !== parseInt(patientId) && 
        !['doctor', 'nurse', 'master_admin', 'receptionist'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Access denied' });
    }
    
    const sql = `
        SELECT u.id, u.username, u.email, u.health_record_id, u.created_at, u.verification_status,
               u.fingerprint_id,
               s.full_name, s.date_of_birth, s.gender, s.address, s.blood_type, s.allergies,
               s.contact_number, s.emergency_contact
        FROM users u
        LEFT JOIN staff_details s ON u.id = s.user_id
        WHERE u.id = ? AND u.role = 'patient'
    `;
    
    db.get(sql, [patientId], (err, patient) => {
        if (err) {
            console.error('Error fetching patient:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        if (!patient) {
            return res.status(404).json({ error: 'Patient not found' });
        }
        res.json(patient);
    });
});

// Update patient profile
app.put('/api/patients/:patientId', authenticateToken, (req, res) => {
    const patientId = req.params.patientId;
    const { email, full_name, contact_number, address, date_of_birth, gender, blood_type, allergies } = req.body;
    
    if (parseInt(req.user.userId) !== parseInt(patientId) && req.user.role !== 'master_admin') {
        return res.status(403).json({ error: 'Access denied' });
    }
    
    db.run('UPDATE users SET email = ? WHERE id = ?', [email, patientId], (err) => {
        if (err) {
            console.error('Error updating user email:', err);
            return res.status(500).json({ error: 'Failed to update email' });
        }
        
        db.get('SELECT id FROM staff_details WHERE user_id = ?', [patientId], (err, row) => {
            if (err) {
                console.error('Error checking staff_details:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            
            if (row) {
                db.run(
                    `UPDATE staff_details 
                     SET full_name = ?, contact_number = ?, address = ?, 
                         date_of_birth = ?, gender = ?, blood_type = ?, allergies = ?
                     WHERE user_id = ?`,
                    [full_name, contact_number, address, date_of_birth, gender, blood_type, allergies, patientId],
                    (err) => {
                        if (err) {
                            console.error('Error updating staff details:', err);
                            return res.status(500).json({ error: 'Failed to update profile' });
                        }
                        res.json({ success: true, message: 'Profile updated successfully' });
                    }
                );
            } else {
                db.run(
                    `INSERT INTO staff_details (user_id, full_name, contact_number, address, date_of_birth, gender, blood_type, allergies, department)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Patient')`,
                    [patientId, full_name, contact_number, address, date_of_birth, gender, blood_type, allergies],
                    (err) => {
                        if (err) {
                            console.error('Error inserting staff details:', err);
                            return res.status(500).json({ error: 'Failed to update profile' });
                        }
                        res.json({ success: true, message: 'Profile updated successfully' });
                    }
                );
            }
        });
    });
});

// ============= ADMISSIONS ENDPOINTS =============

// Get all admissions (for dashboard and listings)
app.get('/api/admissions', authenticateToken, (req, res) => {
    const { status, patient_id, doctor_id } = req.query;
    
    let sql = `
        SELECT a.*, 
               u.username as patient_name,
               u.health_record_id as patient_health_id,
               d.username as doctor_name,
               d.health_record_id as doctor_health_id,
               adm.username as admitted_by_name
        FROM admissions a
        LEFT JOIN users u ON a.patient_id = u.id
        LEFT JOIN users d ON a.doctor_id = d.id
        LEFT JOIN users adm ON a.admitted_by = adm.id
        WHERE 1=1
    `;
    const params = [];
    
    if (status) {
        sql += ' AND a.status = ?';
        params.push(status);
    }
    if (patient_id) {
        sql += ' AND a.patient_id = ?';
        params.push(patient_id);
    }
    if (doctor_id) {
        sql += ' AND a.doctor_id = ?';
        params.push(doctor_id);
    }
    
    sql += ' ORDER BY a.admitted_at DESC';
    
    db.all(sql, params, (err, admissions) => {
        if (err) {
            console.error('Error fetching admissions:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(admissions || []);
    });
});

// IMPORTANT: Put SPECIFIC routes BEFORE dynamic routes (/:id)
// Get active admissions (currently admitted patients)
app.get('/api/admissions/active', authenticateToken, (req, res) => {
    console.log('📋 Fetching active admissions');
    
    const sql = `
        SELECT a.*, 
               u.username as patient_name,
               u.health_record_id as patient_health_id,
               u.email as patient_email,
               d.username as doctor_name,
               d.health_record_id as doctor_health_id,
               adm.username as admitted_by_name
        FROM admissions a
        INNER JOIN users u ON a.patient_id = u.id
        LEFT JOIN users d ON a.doctor_id = d.id
        LEFT JOIN users adm ON a.admitted_by = adm.id
        WHERE a.status = 'admitted'
        ORDER BY a.admitted_at DESC
    `;
    
    db.all(sql, [], (err, admissions) => {
        if (err) {
            console.error('Error fetching active admissions:', err.message);
            return res.status(500).json({ error: 'Database error: ' + err.message });
        }
        
        console.log(`✅ Found ${admissions ? admissions.length : 0} active admissions`);
        res.json(admissions || []);
    });
});

// Get admission statistics
app.get('/api/admissions/stats', authenticateToken, (req, res) => {
    console.log('📊 Fetching admission statistics');
    
    const sql = `
        SELECT 
            COUNT(*) as total_admissions,
            SUM(CASE WHEN status = 'admitted' THEN 1 ELSE 0 END) as active_admissions,
            SUM(CASE WHEN status = 'discharged' THEN 1 ELSE 0 END) as discharged_admissions,
            COUNT(DISTINCT patient_id) as unique_patients
        FROM admissions
    `;
    
    db.get(sql, [], (err, stats) => {
        if (err) {
            console.error('Error fetching admission stats:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        
        res.json({
            active_admissions: stats?.active_admissions || 0,
            total_admissions: stats?.total_admissions || 0,
            discharged_admissions: stats?.discharged_admissions || 0,
            unique_patients: stats?.unique_patients || 0
        });
    });
});

// Get single admission by ID - THIS MUST COME AFTER the specific routes
app.get('/api/admissions/:id', authenticateToken, (req, res) => {
    const sql = `
        SELECT a.*, 
               u.username as patient_name,
               u.health_record_id as patient_health_id,
               d.username as doctor_name,
               adm.username as admitted_by_name
        FROM admissions a
        LEFT JOIN users u ON a.patient_id = u.id
        LEFT JOIN users d ON a.doctor_id = d.id
        LEFT JOIN users adm ON a.admitted_by = adm.id
        WHERE a.id = ?
    `;
    
    db.get(sql, [req.params.id], (err, admission) => {
        if (err) {
            console.error('Error fetching admission:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        if (!admission) {
            return res.status(404).json({ error: 'Admission not found' });
        }
        res.json(admission);
    });
});

// Get admissions for a specific patient
app.get('/api/patients/:patientId/admissions', authenticateToken, (req, res) => {
    const { patientId } = req.params;
    
    // Check permissions
    if (parseInt(req.user.userId) !== parseInt(patientId) && 
        !['doctor', 'master_admin', 'nurse'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Access denied' });
    }
    
    const sql = `
        SELECT a.*, 
               d.username as doctor_name,
               adm.username as admitted_by_name
        FROM admissions a
        LEFT JOIN users d ON a.doctor_id = d.id
        LEFT JOIN users adm ON a.admitted_by = adm.id
        WHERE a.patient_id = ?
        ORDER BY a.admitted_at DESC
    `;
    
    db.all(sql, [patientId], (err, admissions) => {
        if (err) {
            console.error('Error fetching patient admissions:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(admissions || []);
    });
});

// Create a new admission (admit patient)
app.post('/api/admissions', authenticateToken, (req, res) => {
    const { patient_id, doctor_id, ward, bed_number, reason, diagnosis, expected_stay_days } = req.body;
    
    if (!patient_id || !reason) {
        return res.status(400).json({ error: 'Patient ID and reason are required' });
    }
    
    // Check if patient is already admitted
    db.get('SELECT id FROM admissions WHERE patient_id = ? AND status = "admitted"', [patient_id], (err, existing) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        if (existing) {
            return res.status(400).json({ error: 'Patient is already admitted' });
        }
        
        db.run(`
            INSERT INTO admissions (
                patient_id, doctor_id, admitted_by, ward, bed_number, 
                reason, diagnosis, expected_stay_days, status, admitted_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'admitted', CURRENT_TIMESTAMP)
        `, [patient_id, doctor_id || req.user.userId, req.user.userId, ward, bed_number, reason, diagnosis, expected_stay_days || 1], 
        function(err) {
            if (err) {
                console.error('Error creating admission:', err);
                return res.status(500).json({ error: 'Failed to admit patient' });
            }
            
            // Update user status
            db.run('UPDATE users SET status = "admitted" WHERE id = ?', [patient_id]);
            
            res.json({ 
                success: true, 
                id: this.lastID, 
                message: 'Patient admitted successfully' 
            });
        });
    });
});

// Update admission (discharge patient)
app.put('/api/admissions/:id/discharge', authenticateToken, (req, res) => {
    const { discharge_notes, discharge_instructions } = req.body;
    
    db.run(`
        UPDATE admissions 
        SET status = 'discharged', 
            discharge_date = CURRENT_TIMESTAMP,
            discharge_notes = ?,
            discharge_instructions = ?
        WHERE id = ?
    `, [discharge_notes, discharge_instructions, req.params.id], function(err) {
        if (err) {
            console.error('Error discharging patient:', err);
            return res.status(500).json({ error: 'Failed to discharge patient' });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Admission not found' });
        }
        
        // Get patient_id to update user status
        db.get('SELECT patient_id FROM admissions WHERE id = ?', [req.params.id], (err, admission) => {
            if (!err && admission) {
                db.run('UPDATE users SET status = "active" WHERE id = ?', [admission.patient_id]);
            }
        });
        
        res.json({ success: true, message: 'Patient discharged successfully' });
    });
});
// ============= START SERVER =============
const PORT = 3001;
app.listen(PORT, () => {
    console.log(`🚀 Backend server running on http://localhost:${PORT}`);
});