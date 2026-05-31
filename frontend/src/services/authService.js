import api from './api';

// FIXED: Changed from 'authToken' to 'token' for consistency
const TOKEN_KEY = 'token';
const USER_KEY = 'user';

class AuthService {
    constructor() {
        this.tokenKey = TOKEN_KEY;
        this.userKey = USER_KEY;
    }

    /**
     * Login with username and password
     */
    async loginWithPassword(username, password) {
        try {
            const response = await api.post('/auth/login/password', { 
                username, 
                password 
            });
            
            if (response.data.success) {
                this.setToken(response.data.token);
                this.setCurrentUser(response.data.user);
                
                console.log('✅ Password login successful for:', username);
                console.log('   User role:', response.data.user.role);
            }
            
            return response.data;
        } catch (error) {
            console.error('Password login error:', error);
            if (error.response) {
                return error.response.data;
            }
            return { 
                success: false, 
                error: 'Network error. Please check your connection.' 
            };
        }
    }

    /**
     * Get user profile from server
     */
    async getProfile() {
        try {
            const userId = this.getUserId();
            if (!userId) {
                return { success: false, error: 'User not logged in' };
            }
            
            const response = await api.get(`/patients/${userId}`);
            return {
                success: true,
                user: response.data,
                fingerprintEnrolled: !!(response.data.fingerprint_id)
            };
        } catch (error) {
            console.error('Get profile error:', error);
            if (error.response) {
                return error.response.data;
            }
            return { 
                success: false, 
                error: 'Network error. Please check your connection.' 
            };
        }
    }

    /**
     * Update user profile
     */
    async updateProfile(profileData) {
        try {
            const userId = this.getUserId();
            const response = await api.put(`/patients/${userId}`, profileData);
            
            if (response.data.success) {
                // Update stored user data
                const currentUser = this.getCurrentUser();
                if (currentUser && profileData.email) {
                    currentUser.email = profileData.email;
                    this.setCurrentUser(currentUser);
                }
            }
            
            return response.data;
        } catch (error) {
            console.error('Profile update error:', error);
            if (error.response) {
                return error.response.data;
            }
            return { 
                success: false, 
                error: 'Network error. Please check your connection.' 
            };
        }
    }

    /**
     * Fingerprint-only login - No username required
     */
    async loginWithFingerprintOnly(fingerprintId) {
        try {
            const response = await api.post('/auth/login/fingerprint-only', { 
                fingerprintId 
            });
            
            if (response.data.success) {
                this.setToken(response.data.token);
                this.setCurrentUser(response.data.user);
                
                console.log('✅ Fingerprint-only login successful for:', response.data.user.username);
                console.log('   User role:', response.data.user.role);
            }
            
            return response.data;
        } catch (error) {
            console.error('Fingerprint-only login error:', error);
            if (error.response) {
                return error.response.data;
            }
            return { 
                success: false, 
                error: 'Network error. Please check your connection.' 
            };
        }
    }

    /**
     * Legacy: Login with username and fingerprint
     */
    async loginWithFingerprint(username, fingerprintId) {
        try {
            const response = await api.post('/auth/login/fingerprint', { 
                username, 
                fingerprintId 
            });
            
            if (response.data.success) {
                this.setToken(response.data.token);
                this.setCurrentUser(response.data.user);
                
                console.log('✅ Fingerprint login successful for:', username);
                console.log('   User role:', response.data.user.role);
            }
            
            return response.data;
        } catch (error) {
            console.error('Fingerprint login error:', error);
            if (error.response) {
                return error.response.data;
            }
            return { 
                success: false, 
                error: 'Network error. Please check your connection.' 
            };
        }
    }

    /**
     * Check if fingerprint is registered
     */
    async checkFingerprint(fingerprintId) {
        try {
            const response = await api.post('/auth/check-fingerprint', { fingerprintId });
            return response.data;
        } catch (error) {
            console.error('Check fingerprint error:', error);
            return { registered: false };
        }
    }

    /**
     * Register a new user (self-registration)
     */
    async register(userData) {
        try {
            const response = await api.post('/auth/register', {
                username: userData.username,
                email: userData.email,
                password: userData.password,
                healthRecordId: userData.healthRecordId,
                requestedRole: userData.requestedRole || 'patient',
                roleRequestReason: userData.roleRequestReason || '',
                documents: userData.documents || []
            });
            
            console.log('📝 Registration response:', response.data);
            return response.data;
        } catch (error) {
            console.error('Registration error:', error);
            if (error.response) {
                return error.response.data;
            }
            return { 
                success: false, 
                error: 'Network error. Please check your connection.' 
            };
        }
    }

    /**
     * Verify JWT token
     */
    async verifyToken() {
        try {
            const token = this.getToken();
            if (!token) {
                return { valid: false, error: 'No token found' };
            }
            
            const response = await api.get('/auth/verify');
            return response.data;
        } catch (error) {
            console.error('Token verification error:', error);
            if (error.response?.status === 401) {
                this.logout();
            }
            return { valid: false, error: 'Token expired' };
        }
    }

    /**
     * Enroll fingerprint for current user
     */
    async enrollFingerprint(fingerprintId) {
        try {
            const response = await api.post('/auth/enroll-fingerprint-web', { 
                fingerprintId 
            });
            return response.data;
        } catch (error) {
            console.error('Fingerprint enrollment error:', error);
            if (error.response) {
                return error.response.data;
            }
            return { 
                success: false, 
                error: 'Failed to enroll fingerprint' 
            };
        }
    }

    /**
     * Save fingerprint ID after enrollment
     */
    async saveFingerprint(fingerprintId) {
        try {
            const response = await api.post('/auth/save-fingerprint', { 
                fingerprintId 
            });
            return response.data;
        } catch (error) {
            console.error('Save fingerprint error:', error);
            if (error.response) {
                return error.response.data;
            }
            return { 
                success: false, 
                error: 'Failed to save fingerprint' 
            };
        }
    }

    /**
     * Change user password
     */
    async changePassword(currentPassword, newPassword) {
        try {
            const response = await api.post('/auth/change-password', {
                currentPassword,
                newPassword
            });
            return response.data;
        } catch (error) {
            console.error('Password change error:', error);
            if (error.response) {
                return error.response.data;
            }
            return { 
                success: false, 
                error: 'Failed to change password' 
            };
        }
    }

    /**
     * Get current user from storage
     */
    getCurrentUser() {
        try {
            const userStr = localStorage.getItem(this.userKey);
            if (userStr) {
                const user = JSON.parse(userStr);
                if (user && user.id && user.username) {
                    return user;
                }
            }
            return null;
        } catch (error) {
            console.error('Error getting current user:', error);
            return null;
        }
    }

    /**
     * Set current user in storage
     */
    setCurrentUser(user) {
        if (user) {
            localStorage.setItem(this.userKey, JSON.stringify(user));
        } else {
            localStorage.removeItem(this.userKey);
        }
    }

    /**
     * Get auth token from storage
     */
    getToken() {
        return localStorage.getItem(this.tokenKey);
    }

    /**
     * Set auth token in storage
     */
    setToken(token) {
        if (token) {
            localStorage.setItem(this.tokenKey, token);
        } else {
            localStorage.removeItem(this.tokenKey);
        }
    }

    /**
     * Check if user is authenticated
     */
    isAuthenticated() {
        const token = this.getToken();
        const user = this.getCurrentUser();
        return !!(token && user);
    }

    /**
     * Check if user has specific role
     */
    hasRole(role) {
        const user = this.getCurrentUser();
        return user && user.role === role;
    }

    /**
     * Check if user has any of the specified roles
     */
    hasAnyRole(roles) {
        const user = this.getCurrentUser();
        return user && roles.includes(user.role);
    }

    /**
     * Get user role
     */
    getUserRole() {
        const user = this.getCurrentUser();
        return user ? user.role : null;
    }

    /**
     * Get user ID
     */
    getUserId() {
        const user = this.getCurrentUser();
        return user ? user.id : null;
    }

    /**
     * Get username
     */
    getUsername() {
        const user = this.getCurrentUser();
        return user ? user.username : null;
    }

    /**
     * Logout user
     */
    logout() {
        console.log('🔓 Logging out user');
        this.setToken(null);
        this.setCurrentUser(null);
        sessionStorage.clear();
        window.dispatchEvent(new Event('storage'));
    }

    /**
     * Refresh user data from server
     */
    async refreshUser() {
        try {
            const response = await this.verifyToken();
            if (response.valid && response.user) {
                this.setCurrentUser(response.user);
                return response.user;
            }
            return null;
        } catch (error) {
            console.error('Failed to refresh user:', error);
            return null;
        }
    }

    /**
     * Get auth headers for manual requests
     */
    getAuthHeaders() {
        const token = this.getToken();
        return {
            'Authorization': token ? `Bearer ${token}` : '',
            'Content-Type': 'application/json'
        };
    }
}

const authService = new AuthService();
export { AuthService };
export default authService;