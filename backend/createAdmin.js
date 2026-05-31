const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./ehealth.db');

const ADMIN_USERNAME = 'master_admin';
const ADMIN_PASSWORD = 'MasterAdmin123!';
const ADMIN_EMAIL = 'master@ehrsystem.com';

async function createMasterAdmin() {
    try {
        // Hash the password
        const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
        
        // First, remove existing master_admin if exists
        db.run('DELETE FROM users WHERE username = ?', [ADMIN_USERNAME], function(err) {
            if (err) {
                console.error('Error deleting existing admin:', err.message);
                return;
            }
            console.log('✅ Removed existing master_admin if present');
            
            // Create new master_admin
            db.run(`
                INSERT INTO users (
                    username, 
                    password_hash, 
                    email, 
                    role, 
                    verification_status, 
                    is_immutable,
                    status,
                    created_at
                ) VALUES (?, ?, ?, 'master_admin', 'approved', 1, 'active', datetime('now'))
            `, [ADMIN_USERNAME, hashedPassword, ADMIN_EMAIL], function(err) {
                if (err) {
                    console.error('Error creating master_admin:', err.message);
                    return;
                }
                
                console.log('\n✅ MASTER ADMIN CREATED SUCCESSFULLY!');
                console.log('=====================================');
                console.log(`Username: ${ADMIN_USERNAME}`);
                console.log(`Password: ${ADMIN_PASSWORD}`);
                console.log(`Email: ${ADMIN_EMAIL}`);
                console.log(`User ID: ${this.lastID}`);
                console.log('=====================================\n');
                
                // Verify the user was created
                db.get('SELECT id, username, role, is_immutable FROM users WHERE username = ?', 
                    [ADMIN_USERNAME], (err, user) => {
                    if (err) {
                        console.error('Error verifying:', err.message);
                    } else {
                        console.log('✅ Verification successful:', user);
                        console.log('\n🎉 You can now login with:');
                        console.log(`   Username: ${ADMIN_USERNAME}`);
                        console.log(`   Password: ${ADMIN_PASSWORD}`);
                    }
                    db.close();
                });
            });
        });
    } catch (error) {
        console.error('Error:', error);
        db.close();
    }
}

createMasterAdmin();