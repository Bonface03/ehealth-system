// src/components/doctor/DoctorDashboard.js
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api';
import DocumentUpload from '../common/DocumentUpload';
import DocumentList from '../common/DocumentList';
import './DoctorDashboard.css';

const DoctorDashboard = () => {
    const { user } = useAuth();
    const { showSuccess, showError } = useToast();
    const [patients, setPatients] = useState([]);
    const [admittedPatients, setAdmittedPatients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedPatient, setSelectedPatient] = useState(null);
    const [selectedAdmission, setSelectedAdmission] = useState(null);
    const [showPrescribeModal, setShowPrescribeModal] = useState(false);
    const [showAdmissionModal, setShowAdmissionModal] = useState(false);
    const [showDischargeModal, setShowDischargeModal] = useState(false);
    const [showPatientInfoModal, setShowPatientInfoModal] = useState(false);
    const [showAdmissionInfoModal, setShowAdmissionInfoModal] = useState(false);
    const [patientDetails, setPatientDetails] = useState(null);
    const [admissionDetails, setAdmissionDetails] = useState(null);
    const [activeTab, setActiveTab] = useState('info');
    const [refreshDocuments, setRefreshDocuments] = useState(false);
    const [prescriptionData, setPrescriptionData] = useState({
        patientId: '',
        medication: '',
        dosage: '',
        frequency: '',
        duration: '',
        notes: '',
        refills: 0
    });
    const [admissionData, setAdmissionData] = useState({
        ward: '',
        bedNumber: '',
        reason: '',
        diagnosis: '',
        expectedStayDays: 1
    });
    const [dischargeData, setDischargeData] = useState({
        notes: '',
        instructions: ''
    });
    const [submitting, setSubmitting] = useState(false);
    const [stats, setStats] = useState({
        totalPatients: 0,
        activePrescriptions: 0,
        todayAppointments: 0,
        admittedPatients: 0
    });

    // Get current user ID (handle both possible property names)
    const getCurrentUserId = useCallback(() => {
        return user?.userId || user?.id || null;
    }, [user]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const currentUserId = getCurrentUserId();
            console.log('Fetching data for doctor ID:', currentUserId);
            
            // Fetch patients
            try {
                const patientsRes = await api.get('/doctor/patients');
                setPatients(patientsRes.data || []);
                setStats(prev => ({ ...prev, totalPatients: patientsRes.data?.length || 0 }));
            } catch (patientErr) {
                console.error('Error fetching patients:', patientErr);
                setPatients([]);
            }
            
            // Fetch admitted patients - Get all admissions and filter
            try {
                const admittedRes = await api.get('/admissions');
                console.log('All admissions from API:', admittedRes.data);
                
                // Filter admissions that are active and belong to current doctor
                const doctorAdmissions = admittedRes.data?.filter(admission => 
                    admission.status === 'admitted' && 
                    admission.doctor_id === currentUserId
                ) || [];
                
                // Fetch patient names for each admission
                const admissionsWithNames = await Promise.all(doctorAdmissions.map(async (admission) => {
                    try {
                        const patientRes = await api.get(`/patients/${admission.patient_id}`);
                        return {
                            ...admission,
                            patient_name: patientRes.data?.full_name || patientRes.data?.username || `Patient ${admission.patient_id}`,
                            patient_health_id: patientRes.data?.health_record_id
                        };
                    } catch (err) {
                        return {
                            ...admission,
                            patient_name: `Patient ${admission.patient_id}`,
                            patient_health_id: null
                        };
                    }
                }));
                
                console.log('Filtered doctor admissions with names:', admissionsWithNames);
                setAdmittedPatients(admissionsWithNames);
                setStats(prev => ({ ...prev, admittedPatients: admissionsWithNames.length || 0 }));
            } catch (admissionErr) {
                console.error('Error fetching admissions:', admissionErr);
                setAdmittedPatients([]);
            }
            
            // Fetch prescriptions count
            try {
                const prescriptionsRes = await api.get('/prescriptions');
                const activePrescriptions = prescriptionsRes.data?.filter(p => p.status === 'prescribed').length || 0;
                setStats(prev => ({ ...prev, activePrescriptions: activePrescriptions }));
            } catch (prescriptionErr) {
                console.error('Error fetching prescriptions:', prescriptionErr);
                setStats(prev => ({ ...prev, activePrescriptions: 0 }));
            }
            
            // Fetch today's appointments
            try {
                const today = new Date().toISOString().split('T')[0];
                const appointmentsRes = await api.get('/appointments');
                const todayAppointments = appointmentsRes.data?.filter(a => a.appointment_date === today && a.doctor_id === currentUserId).length || 0;
                setStats(prev => ({ ...prev, todayAppointments: todayAppointments }));
            } catch (appointmentErr) {
                console.error('Error fetching appointments:', appointmentErr);
                setStats(prev => ({ ...prev, todayAppointments: 0 }));
            }
            
        } catch (error) {
            console.error('Error fetching dashboard data:', error);
        } finally {
            setLoading(false);
        }
    }, [getCurrentUserId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const filteredPatients = patients.filter(patient =>
        patient.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (patient.full_name && patient.full_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (patient.health_record_id && patient.health_record_id.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const isPatientAdmitted = (patientId) => {
        return admittedPatients.some(a => a.patient_id === patientId);
    };

    const handleViewPatientInfo = async (patient) => {
        try {
            const response = await api.get(`/patients/${patient.id}`);
            setPatientDetails(response.data);
            setActiveTab('info');
            setShowPatientInfoModal(true);
        } catch (error) {
            showError('Failed to load patient details');
        }
    };

    // Function to view admission details
    const handleViewAdmissionInfo = async (admission) => {
        try {
            // Get patient details
            const patientRes = await api.get(`/patients/${admission.patient_id}`);
            setAdmissionDetails({
                ...admission,
                patient_name: patientRes.data?.full_name || patientRes.data?.username,
                patient_health_id: patientRes.data?.health_record_id,
                patient_email: patientRes.data?.email,
                patient_contact: patientRes.data?.contact_number
            });
            setShowAdmissionInfoModal(true);
        } catch (error) {
            showError('Failed to load admission details');
        }
    };

    const handleAdmitPatient = (patient) => {
        setSelectedPatient(patient);
        setAdmissionData({
            ward: '',
            bedNumber: '',
            reason: '',
            diagnosis: '',
            expectedStayDays: 1
        });
        setShowAdmissionModal(true);
    };

    const handleAdmitSubmit = async (e) => {
        e.preventDefault();
        
        if (!admissionData.ward) {
            showError('Please select a ward');
            return;
        }
        
        if (!admissionData.reason) {
            showError('Please provide a reason for admission');
            return;
        }
        
        setSubmitting(true);
        try {
            const currentUserId = getCurrentUserId();
            console.log('Admitting patient with doctor_id:', currentUserId);
            
            const response = await api.post('/admissions', {
                patient_id: selectedPatient.id,
                doctor_id: currentUserId,
                ward: admissionData.ward,
                bed_number: admissionData.bedNumber,
                reason: admissionData.reason,
                diagnosis: admissionData.diagnosis,
                expected_stay_days: admissionData.expectedStayDays
            });
            
            console.log('Admission response:', response.data);
            showSuccess(`Patient ${selectedPatient.username} admitted to ${admissionData.ward} Ward`);
            setShowAdmissionModal(false);
            fetchData();
        } catch (error) {
            console.error('Admission error:', error);
            showError(error.response?.data?.error || 'Failed to admit patient');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDischargePatient = (admission) => {
        setSelectedAdmission(admission);
        setDischargeData({ notes: '', instructions: '' });
        setShowDischargeModal(true);
    };

    const handleDischargeSubmit = async (e) => {
        e.preventDefault();
        
        setSubmitting(true);
        try {
            await api.put(`/admissions/${selectedAdmission.id}/discharge`, {
                discharge_notes: dischargeData.notes,
                discharge_instructions: dischargeData.instructions
            });
            showSuccess(`Patient discharged successfully`);
            setShowDischargeModal(false);
            fetchData();
        } catch (error) {
            console.error('Discharge error:', error);
            showError(error.response?.data?.error || 'Failed to discharge patient');
        } finally {
            setSubmitting(false);
        }
    };

    const handlePrescribe = (e, patient = null) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        
        if (patient) {
            setSelectedPatient(patient);
            setPrescriptionData({
                patientId: patient.id,
                medication: '',
                dosage: '',
                frequency: '',
                duration: '',
                notes: '',
                refills: 0
            });
        } else {
            setSelectedPatient(null);
            setPrescriptionData({
                patientId: '',
                medication: '',
                dosage: '',
                frequency: '',
                duration: '',
                notes: '',
                refills: 0
            });
        }
        setShowPrescribeModal(true);
    };

    const handlePatientSelect = (e) => {
        const patientId = parseInt(e.target.value);
        const patient = patients.find(p => p.id === patientId);
        setSelectedPatient(patient);
        setPrescriptionData({
            ...prescriptionData,
            patientId: patientId
        });
    };

    const handlePrescriptionSubmit = async (e) => {
        e.preventDefault();
        
        if (!prescriptionData.patientId) {
            showError('Please select a patient');
            return;
        }
        
        if (!prescriptionData.medication || !prescriptionData.dosage) {
            showError('Medication and dosage are required');
            return;
        }
        
        setSubmitting(true);
        try {
            await api.post('/prescriptions', {
                patientId: prescriptionData.patientId,
                medication: prescriptionData.medication,
                dosage: prescriptionData.dosage,
                frequency: prescriptionData.frequency,
                duration: prescriptionData.duration,
                notes: prescriptionData.notes,
                refills: parseInt(prescriptionData.refills) || 0
            });
            showSuccess(`Prescription created for ${selectedPatient?.username || 'patient'}`);
            setShowPrescribeModal(false);
            setPrescriptionData({
                patientId: '',
                medication: '',
                dosage: '',
                frequency: '',
                duration: '',
                notes: '',
                refills: 0
            });
            setSelectedPatient(null);
            fetchData();
        } catch (error) {
            console.error('Error creating prescription:', error);
            showError(error.response?.data?.error || 'Failed to create prescription');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDocumentUploadComplete = () => {
        setRefreshDocuments(prev => !prev);
    };

    const closeModal = () => {
        setShowPrescribeModal(false);
        setShowAdmissionModal(false);
        setShowDischargeModal(false);
        setShowPatientInfoModal(false);
        setShowAdmissionInfoModal(false);
        setSelectedPatient(null);
        setSelectedAdmission(null);
        setAdmissionDetails(null);
        setPatientDetails(null);
        setActiveTab('info');
        setPrescriptionData({
            patientId: '',
            medication: '',
            dosage: '',
            frequency: '',
            duration: '',
            notes: '',
            refills: 0
        });
    };

    const getInitials = (name) => {
        if (!name) return '👤';
        return name.charAt(0).toUpperCase();
    };

    const getStatusColor = (status) => {
        switch(status) {
            case 'active': return '#27ae60';
            case 'admitted': return '#e74c3c';
            case 'discharged': return '#3498db';
            default: return '#95a5a6';
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString();
    };

    const renderAdmittedPatients = () => {
        if (admittedPatients.length === 0) {
            return (
                <div className="admitted-patients-section">
                    <h2>Currently Admitted Patients</h2>
                    <div className="empty-state admitted-empty">
                        <div className="empty-state-icon">🏥</div>
                        <h3>No Admitted Patients</h3>
                        <p>You have no patients currently admitted under your care.</p>
                    </div>
                </div>
            );
        }

        return (
            <div className="admitted-patients-section">
                <h2>Currently Admitted Patients</h2>
                <div className="admitted-table-container">
                    <table className="admitted-table">
                        <thead>
                            <tr>
                                <th>Patient</th>
                                <th>Ward</th>
                                <th>Bed</th>
                                <th>Admitted On</th>
                                <th>Reason</th>
                                <th>Diagnosis</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {admittedPatients.map(admission => (
                                <tr key={admission.id}>
                                    <td className="patient-name">
                                        <strong>{admission.patient_name}</strong>
                                        <span className="patient-id-small">ID: {admission.patient_id}</span>
                                    </td>
                                    <td>{admission.ward || 'Not assigned'} Ward</td>
                                    <td>{admission.bed_number || 'Not assigned'}</td>
                                    <td>{formatDate(admission.admitted_at)}</td>
                                    <td className="reason-text">{admission.reason || 'Not specified'}</td>
                                    <td className="diagnosis-text">{admission.diagnosis || 'Pending'}</td>
                                    <td>
                                        <div className="action-buttons">
                                            <button 
                                                type="button"
                                                className="btn-view"
                                                onClick={() => handleViewAdmissionInfo(admission)}
                                            >
                                                View Details
                                            </button>
                                            <button 
                                                type="button"
                                                className="btn-discharge"
                                                onClick={() => handleDischargePatient(admission)}
                                            >
                                                Discharge
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    if (loading) {
        return (
            <div className="loading-container">
                <div className="loading-spinner"></div>
                <p>Loading dashboard...</p>
            </div>
        );
    }

    return (
        <div className="doctor-dashboard">
            <div className="dashboard-header">
                <div className="welcome-section">
                    <h1>Welcome, Dr. {user?.username || 'Doctor'}</h1>
                    <p>Manage your patients, prescriptions, and admissions</p>
                </div>
                <button 
                    className="btn-primary" 
                    onClick={(e) => handlePrescribe(e)}
                    type="button"
                >
                    + New Prescription
                </button>
            </div>

            {/* Stats Section */}
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-icon">👥</div>
                    <div className="stat-info">
                        <div className="stat-value">{stats.totalPatients}</div>
                        <div className="stat-label">Total Patients</div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon">💊</div>
                    <div className="stat-info">
                        <div className="stat-value">{stats.activePrescriptions}</div>
                        <div className="stat-label">Active Prescriptions</div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon">📅</div>
                    <div className="stat-info">
                        <div className="stat-value">{stats.todayAppointments}</div>
                        <div className="stat-label">Today's Appointments</div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon">🏥</div>
                    <div className="stat-info">
                        <div className="stat-value">{stats.admittedPatients}</div>
                        <div className="stat-label">Admitted Patients</div>
                    </div>
                </div>
            </div>

            {/* Search Bar */}
            <div className="search-section">
                <input
                    type="text"
                    placeholder="Search patients by name, username or health ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="search-input"
                />
                <span className="search-icon">🔍</span>
            </div>

            {/* Patient List */}
            <div className="patient-list">
                <h2>My Patients</h2>
                {filteredPatients.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">👥</div>
                        <h3>No Patients Found</h3>
                        <p>{searchTerm ? 'No patients match your search.' : 'You have no assigned patients yet.'}</p>
                    </div>
                ) : (
                    <div className="patients-grid">
                        {filteredPatients.map(patient => {
                            const isAdmitted = isPatientAdmitted(patient.id);
                            const admission = admittedPatients.find(a => a.patient_id === patient.id);
                            return (
                                <div key={patient.id} className="patient-card">
                                    <div className="patient-header">
                                        <div className="patient-avatar" style={{ backgroundColor: getStatusColor(isAdmitted ? 'admitted' : 'active') }}>
                                            {getInitials(patient.full_name || patient.username)}
                                        </div>
                                        <div className="patient-info-header">
                                            <h3>{patient.full_name || patient.username}</h3>
                                            <p className="patient-id">ID: {patient.health_record_id || patient.id}</p>
                                            {isAdmitted && <span className="admitted-badge">🏥 Admitted</span>}
                                        </div>
                                    </div>
                                    <div className="patient-info">
                                        <p><strong>📧 Email:</strong> {patient.email || 'Not provided'}</p>
                                        <p><strong>📞 Contact:</strong> {patient.contact_number || 'Not provided'}</p>
                                        <p><strong>📅 Registered:</strong> {new Date(patient.created_at).toLocaleDateString()}</p>
                                        <p><strong>📋 Records:</strong> {patient.record_count || 0}</p>
                                    </div>
                                    <div className="patient-actions">
                                        <button 
                                            type="button"
                                            className="btn-view"
                                            onClick={() => handleViewPatientInfo(patient)}
                                        >
                                            👁️ View Details
                                        </button>
                                        <button 
                                            type="button"
                                            className="btn-prescribe"
                                            onClick={(e) => handlePrescribe(e, patient)}
                                        >
                                            💊 Prescribe
                                        </button>
                                        {!isAdmitted ? (
                                            <button 
                                                type="button"
                                                className="btn-admit"
                                                onClick={() => handleAdmitPatient(patient)}
                                            >
                                                🏥 Admit
                                            </button>
                                        ) : (
                                            <button 
                                                type="button"
                                                className="btn-discharge"
                                                onClick={() => handleDischargePatient(admission)}
                                            >
                                                🚪 Discharge
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Admitted Patients Section */}
            {renderAdmittedPatients()}

            {/* Prescribe Modal */}
            {showPrescribeModal && (
                <div className="modal-overlay" onClick={closeModal}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <button type="button" className="modal-close" onClick={closeModal}>×</button>
                        <h3>Create New Prescription</h3>
                        
                        <form onSubmit={handlePrescriptionSubmit}>
                            <div className="form-group">
                                <label>Select Patient *</label>
                                <select 
                                    value={prescriptionData.patientId}
                                    onChange={handlePatientSelect}
                                    required
                                >
                                    <option value="">-- Select a patient --</option>
                                    {patients.map(patient => (
                                        <option key={patient.id} value={patient.id}>
                                            {patient.full_name || patient.username} - {patient.health_record_id || patient.id}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            
                            {selectedPatient && (
                                <div className="selected-patient-info">
                                    <p><strong>Selected Patient:</strong> {selectedPatient.full_name || selectedPatient.username}</p>
                                    <p><strong>Health ID:</strong> {selectedPatient.health_record_id}</p>
                                    <p><strong>Email:</strong> {selectedPatient.email || 'Not provided'}</p>
                                </div>
                            )}
                            
                            <div className="form-group">
                                <label>Medication Name *</label>
                                <input
                                    type="text"
                                    value={prescriptionData.medication}
                                    onChange={(e) => setPrescriptionData({...prescriptionData, medication: e.target.value})}
                                    placeholder="e.g., Amoxicillin, Paracetamol"
                                    required
                                />
                            </div>
                            
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Dosage *</label>
                                    <input
                                        type="text"
                                        value={prescriptionData.dosage}
                                        onChange={(e) => setPrescriptionData({...prescriptionData, dosage: e.target.value})}
                                        placeholder="e.g., 500mg, 10ml"
                                        required
                                    />
                                </div>
                                
                                <div className="form-group">
                                    <label>Frequency</label>
                                    <input
                                        type="text"
                                        value={prescriptionData.frequency}
                                        onChange={(e) => setPrescriptionData({...prescriptionData, frequency: e.target.value})}
                                        placeholder="e.g., Twice daily, Every 8 hours"
                                    />
                                </div>
                            </div>
                            
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Duration</label>
                                    <input
                                        type="text"
                                        value={prescriptionData.duration}
                                        onChange={(e) => setPrescriptionData({...prescriptionData, duration: e.target.value})}
                                        placeholder="e.g., 7 days, 2 weeks"
                                    />
                                </div>
                                
                                <div className="form-group">
                                    <label>Refills</label>
                                    <input
                                        type="number"
                                        value={prescriptionData.refills}
                                        onChange={(e) => setPrescriptionData({...prescriptionData, refills: parseInt(e.target.value) || 0})}
                                        min="0"
                                        max="10"
                                    />
                                </div>
                            </div>
                            
                            <div className="form-group">
                                <label>Additional Notes</label>
                                <textarea
                                    value={prescriptionData.notes}
                                    onChange={(e) => setPrescriptionData({...prescriptionData, notes: e.target.value})}
                                    rows="3"
                                    placeholder="Special instructions, warnings, or notes for the patient..."
                                />
                            </div>
                            
                            <div className="modal-actions">
                                <button type="submit" className="btn-success" disabled={submitting}>
                                    {submitting ? 'Creating...' : 'Create Prescription'}
                                </button>
                                <button type="button" className="btn-secondary" onClick={closeModal}>
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Admit Patient Modal */}
            {showAdmissionModal && selectedPatient && (
                <div className="modal-overlay" onClick={closeModal}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <button type="button" className="modal-close" onClick={closeModal}>×</button>
                        <h3>Admit Patient: {selectedPatient.username}</h3>
                        <form onSubmit={handleAdmitSubmit}>
                            <div className="form-group">
                                <label>Ward *</label>
                                <select
                                    value={admissionData.ward}
                                    onChange={(e) => setAdmissionData({...admissionData, ward: e.target.value})}
                                    required
                                >
                                    <option value="">Select Ward</option>
                                    <option value="Medical">Medical Ward</option>
                                    <option value="Surgical">Surgical Ward</option>
                                    <option value="Pediatric">Pediatric Ward</option>
                                    <option value="Maternity">Maternity Ward</option>
                                    <option value="ICU">ICU</option>
                                    <option value="Cardiology">Cardiology Ward</option>
                                    <option value="Neurology">Neurology Ward</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Bed Number</label>
                                <input
                                    type="text"
                                    value={admissionData.bedNumber}
                                    onChange={(e) => setAdmissionData({...admissionData, bedNumber: e.target.value})}
                                    placeholder="e.g., Bed 12A"
                                />
                            </div>
                            <div className="form-group">
                                <label>Reason for Admission *</label>
                                <textarea
                                    value={admissionData.reason}
                                    onChange={(e) => setAdmissionData({...admissionData, reason: e.target.value})}
                                    rows="2"
                                    placeholder="Reason for admission..."
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Initial Diagnosis</label>
                                <textarea
                                    value={admissionData.diagnosis}
                                    onChange={(e) => setAdmissionData({...admissionData, diagnosis: e.target.value})}
                                    rows="2"
                                    placeholder="Preliminary diagnosis..."
                                />
                            </div>
                            <div className="form-group">
                                <label>Expected Stay (Days)</label>
                                <input
                                    type="number"
                                    value={admissionData.expectedStayDays}
                                    onChange={(e) => setAdmissionData({...admissionData, expectedStayDays: parseInt(e.target.value)})}
                                    min="1"
                                />
                            </div>
                            <div className="modal-actions">
                                <button type="submit" className="btn-success" disabled={submitting}>
                                    {submitting ? 'Admitting...' : 'Admit Patient'}
                                </button>
                                <button type="button" className="btn-secondary" onClick={closeModal}>
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Discharge Patient Modal */}
            {showDischargeModal && selectedAdmission && (
                <div className="modal-overlay" onClick={closeModal}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <button type="button" className="modal-close" onClick={closeModal}>×</button>
                        <h3>Discharge Patient</h3>
                        <p><strong>Patient:</strong> {selectedAdmission.patient_name || `Patient ID: ${selectedAdmission.patient_id}`}</p>
                        <p><strong>Ward:</strong> {selectedAdmission.ward}</p>
                        <p><strong>Diagnosis:</strong> {selectedAdmission.diagnosis || 'Pending'}</p>
                        <form onSubmit={handleDischargeSubmit}>
                            <div className="form-group">
                                <label>Discharge Notes</label>
                                <textarea
                                    value={dischargeData.notes}
                                    onChange={(e) => setDischargeData({...dischargeData, notes: e.target.value})}
                                    rows="3"
                                    placeholder="Summary of treatment and recovery..."
                                />
                            </div>
                            <div className="form-group">
                                <label>Discharge Instructions</label>
                                <textarea
                                    value={dischargeData.instructions}
                                    onChange={(e) => setDischargeData({...dischargeData, instructions: e.target.value})}
                                    rows="3"
                                    placeholder="Follow-up care, medications, and restrictions..."
                                />
                            </div>
                            <div className="modal-actions">
                                <button type="submit" className="btn-danger" disabled={submitting}>
                                    {submitting ? 'Processing...' : 'Confirm Discharge'}
                                </button>
                                <button type="button" className="btn-secondary" onClick={closeModal}>
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Patient Info Modal with Document Upload */}
            {showPatientInfoModal && patientDetails && (
                <div className="modal-overlay" onClick={closeModal}>
                    <div className="modal-content large" onClick={e => e.stopPropagation()}>
                        <button type="button" className="modal-close" onClick={closeModal}>×</button>
                        <h3>Patient: {patientDetails.full_name || patientDetails.username}</h3>
                        
                        <div className="modal-tabs">
                            <button 
                                className={`tab ${activeTab === 'info' ? 'active' : ''}`}
                                onClick={() => setActiveTab('info')}
                            >
                                Patient Information
                            </button>
                            <button 
                                className={`tab ${activeTab === 'documents' ? 'active' : ''}`}
                                onClick={() => setActiveTab('documents')}
                            >
                                Documents
                            </button>
                        </div>

                        {activeTab === 'info' ? (
                            <div className="patient-details">
                                <div className="detail-section">
                                    <h4>Personal Information</h4>
                                    <p><strong>Name:</strong> {patientDetails.full_name || patientDetails.username}</p>
                                    <p><strong>Username:</strong> {patientDetails.username}</p>
                                    <p><strong>Email:</strong> {patientDetails.email || 'Not provided'}</p>
                                    <p><strong>Contact:</strong> {patientDetails.contact_number || 'Not provided'}</p>
                                    <p><strong>Emergency Contact:</strong> {patientDetails.emergency_contact || 'Not provided'}</p>
                                </div>
                                <div className="detail-section">
                                    <h4>Medical Information</h4>
                                    <p><strong>Health Record ID:</strong> {patientDetails.health_record_id}</p>
                                    <p><strong>Blood Type:</strong> {patientDetails.blood_type || 'Not recorded'}</p>
                                    <p><strong>Allergies:</strong> {patientDetails.allergies || 'None reported'}</p>
                                    <p><strong>Status:</strong> {isPatientAdmitted(patientDetails.id) ? 'Admitted' : 'Active'}</p>
                                </div>
                            </div>
                        ) : (
                            <div className="documents-section">
                                <DocumentUpload 
                                    patientId={patientDetails.id} 
                                    onUploadComplete={handleDocumentUploadComplete}
                                />
                                <DocumentList 
                                    key={refreshDocuments ? 'refresh' : 'static'}
                                    patientId={patientDetails.id}
                                    refreshTrigger={refreshDocuments}
                                />
                            </div>
                        )}
                        
                        <div className="modal-actions">
                            <button type="button" className="btn-secondary" onClick={closeModal}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Admission Info Modal */}
            {showAdmissionInfoModal && admissionDetails && (
                <div className="modal-overlay" onClick={closeModal}>
                    <div className="modal-content large" onClick={e => e.stopPropagation()}>
                        <button type="button" className="modal-close" onClick={closeModal}>×</button>
                        <h3>Admission Details</h3>
                        <div className="patient-details">
                            <div className="detail-section">
                                <h4>Patient Information</h4>
                                <p><strong>Name:</strong> {admissionDetails.patient_name}</p>
                                <p><strong>Health Record ID:</strong> {admissionDetails.patient_health_id || 'N/A'}</p>
                                <p><strong>Email:</strong> {admissionDetails.patient_email || 'Not provided'}</p>
                                <p><strong>Contact:</strong> {admissionDetails.patient_contact || 'Not provided'}</p>
                            </div>
                            <div className="detail-section">
                                <h4>Admission Information</h4>
                                <p><strong>Admitted On:</strong> {formatDate(admissionDetails.admitted_at)}</p>
                                <p><strong>Ward:</strong> {admissionDetails.ward || 'Not assigned'}</p>
                                <p><strong>Bed Number:</strong> {admissionDetails.bed_number || 'Not assigned'}</p>
                                <p><strong>Expected Stay:</strong> {admissionDetails.expected_stay_days || 1} days</p>
                            </div>
                            <div className="detail-section">
                                <h4>Medical Information</h4>
                                <p><strong>Reason for Admission:</strong> {admissionDetails.reason || 'Not specified'}</p>
                                <p><strong>Diagnosis:</strong> {admissionDetails.diagnosis || 'Pending'}</p>
                                <p><strong>Status:</strong> <span className="status-admitted">Admitted</span></p>
                            </div>
                        </div>
                        <div className="modal-actions">
                            <button type="button" className="btn-secondary" onClick={closeModal}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DoctorDashboard;