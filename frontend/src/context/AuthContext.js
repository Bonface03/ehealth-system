import React, { createContext, useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import authService from '../services/authService';

const AuthContext = createContext();

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        checkUser();
    }, []);

    useEffect(() => {
        if (user) {
            console.log('👤 Current user:', {
                id: user.id,
                username: user.username,
                role: user.role
            });
        }
    }, [user]);

    const checkUser = () => {
        const currentUser = authService.getCurrentUser();
        setUser(currentUser);
        setLoading(false);
    };

    // Helper function to redirect based on role - FIXED to prevent infinite loop
    const redirectBasedOnRole = (role) => {
        console.log('🔄 Redirecting based on role:', role);
        const currentPath = location.pathname;
        
        switch(role) {
            case 'master_admin':
                if (currentPath !== '/admin') {
                    navigate('/admin', { replace: true });
                }
                break;
            case 'doctor':
                // Only redirect if not already on a doctor page
                if (!currentPath.startsWith('/doctor')) {
                    navigate('/doctor/dashboard', { replace: true });
                }
                break;
            case 'nurse':
                if (currentPath !== '/nurse') {
                    navigate('/nurse', { replace: true });
                }
                break;
            case 'receptionist':
                if (currentPath !== '/receptionist') {
                    navigate('/receptionist', { replace: true });
                }
                break;
            case 'pharmacist':
                if (currentPath !== '/pharmacist') {
                    navigate('/pharmacist', { replace: true });
                }
                break;
            case 'lab_technician':
                if (currentPath !== '/lab') {
                    navigate('/lab', { replace: true });
                }
                break;
            case 'radiologist':
                if (currentPath !== '/radiologist') {
                    navigate('/radiologist', { replace: true });
                }
                break;
            case 'billing_officer':
                if (currentPath !== '/billing') {
                    navigate('/billing', { replace: true });
                }
                break;
            case 'ict_admin':
                if (currentPath !== '/admin') {
                    navigate('/admin', { replace: true });
                }
                break;
            case 'patient':
            default:
                if (currentPath !== '/dashboard') {
                    navigate('/dashboard', { replace: true });
                }
                break;
        }
    };

    const login = async (username, password, useFingerprint = false, fingerprintId = null, fingerprintOnly = false) => {
        setLoading(true);
        setError(null);
        try {
            let response;
            
            if (fingerprintOnly) {
                console.log('Attempting fingerprint-only login...');
                response = await authService.loginWithFingerprintOnly(fingerprintId);
            } else if (useFingerprint) {
                response = await authService.loginWithFingerprint(username, fingerprintId);
            } else {
                response = await authService.loginWithPassword(username, password);
            }
            
            if (response.success) {
                console.log('✅ Login successful, user role:', response.user.role);
                setUser(response.user);
                
                // Redirect based on role
                redirectBasedOnRole(response.user.role);
                return { success: true };
            } else {
                setError(response.error);
                return { success: false, error: response.error };
            }
        } catch (err) {
            console.error('Login error:', err);
            setError(err.message);
            return { success: false, error: err.message };
        } finally {
            setLoading(false);
        }
    };

    const register = async (userData) => {
        setLoading(true);
        setError(null);
        try {
            const response = await authService.register(userData);
            if (response.success) {
                navigate('/login?registered=true');
                return { success: true };
            }
            return response;
        } catch (err) {
            setError(err.message);
            return { success: false, error: err.message };
        } finally {
            setLoading(false);
        }
    };

    const logout = () => {
        authService.logout();
        setUser(null);
        navigate('/');
    };

    const refreshUser = async () => {
        const refreshedUser = await authService.refreshUser();
        if (refreshedUser) {
            setUser(refreshedUser);
        }
    };

    const value = {
        user,
        loading,
        error,
        login,
        register,
        logout,
        refreshUser
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};