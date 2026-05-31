import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import api from '../services/api';
import { useAuth } from './AuthContext';

const RoleContext = createContext();

export const useRole = () => {
    const context = useContext(RoleContext);
    if (!context) {
        throw new Error('useRole must be used within RoleProvider');
    }
    return context;
};

export const RoleProvider = ({ children }) => {
    const [userRole, setUserRole] = useState(null);
    const [permissions, setPermissions] = useState([]);
    const [loading, setLoading] = useState(true);
    const { user } = useAuth();

    const fetchPermissions = useCallback(async () => {
        // FIXED: Use 'token' consistently
        const token = localStorage.getItem('token');
        if (!token) {
            console.log('No token found, skipping permissions fetch');
            setLoading(false);
            return;
        }

        try {
            console.log('🔐 Fetching permissions for role check...');
            const response = await api.get('/roles/my/permissions');
            console.log('📋 Permissions response:', response.data);
            
            setUserRole(response.data.role);
            setPermissions(response.data.permissions);
        } catch (error) {
            console.error('Failed to fetch permissions:', error);
            if (error.response?.status === 401) {
                console.log('User not authenticated, clearing permissions');
                setUserRole(null);
                setPermissions([]);
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPermissions();
    }, [fetchPermissions]);

    // Only refetch when the user object changes significantly
    useEffect(() => {
        if (user?.id) {
            fetchPermissions();
        }
    }, [user?.id, fetchPermissions]);

    const hasPermission = useCallback((permission) => {
        return permissions.includes(permission) || permissions.includes('*');
    }, [permissions]);

    const hasAnyPermission = useCallback((permissionList) => {
        return permissionList.some(p => permissions.includes(p) || permissions.includes('*'));
    }, [permissions]);

    const hasAllPermissions = useCallback((permissionList) => {
        return permissionList.every(p => permissions.includes(p) || permissions.includes('*'));
    }, [permissions]);

    const isRole = useCallback((role) => {
        return userRole === role;
    }, [userRole]);

    const isAnyRole = useCallback((roleList) => {
        return roleList.includes(userRole);
    }, [userRole]);

    const value = {
        userRole,
        permissions,
        loading,
        hasPermission,
        hasAnyPermission,
        hasAllPermissions,
        isRole,
        isAnyRole,
        refresh: fetchPermissions
    };

    return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
};