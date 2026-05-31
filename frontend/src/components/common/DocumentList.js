// src/components/common/DocumentList.js
import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import './DocumentList.css';

const DocumentList = ({ patientId, refreshTrigger }) => {
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    const { showError, showSuccess } = useToast();

    const fetchDocuments = useCallback(async () => {
        if (!patientId) {
            setLoading(false);
            return;
        }
        
        setLoading(true);
        try {
            console.log('Fetching documents for patient:', patientId);
            
            // Get all health records
            const response = await api.get('/health-records');
            const allRecords = response.data || [];
            
            console.log('All records:', allRecords);
            
            // Filter records that belong to this patient and extract file info
            const patientDocuments = [];
            
            for (const record of allRecords) {
                try {
                    // Parse record_data
                    let recordData;
                    if (typeof record.record_data === 'string') {
                        recordData = JSON.parse(record.record_data);
                    } else {
                        recordData = record.record_data;
                    }
                    
                    // Check if this record belongs to the selected patient
                    const recordPatientId = recordData.patientId || recordData.patient_id;
                    
                    if (recordPatientId === patientId) {
                        // Extract file name from record_data or use default
                        let fileName = recordData.title || recordData.fileName || recordData.filename;
                        if (!fileName && recordData.description) {
                            fileName = `Document_${record.id}`;
                        }
                        
                        patientDocuments.push({
                            id: record.id,
                            file_name: fileName || `Document_${record.id}`,
                            file_type: recordData.fileType || recordData.type || 'document',
                            file_size: recordData.fileSize || recordData.size || 0,
                            description: recordData.description || 'No description',
                            uploaded_at: record.created_at,
                            record_data: recordData,
                            has_file: !!recordData.fileName || !!recordData.title
                        });
                    }
                } catch (parseError) {
                    console.warn('Could not parse record_data for record:', record.id, parseError);
                }
            }
            
            console.log('Patient documents found:', patientDocuments);
            setDocuments(patientDocuments);
        } catch (error) {
            console.error('Error fetching documents:', error);
            showError('Failed to load documents');
        } finally {
            setLoading(false);
        }
    }, [patientId, showError]);

    useEffect(() => {
        fetchDocuments();
    }, [fetchDocuments, refreshTrigger]);

    const handleDownload = async (document) => {
        try {
            showSuccess(`Preparing download for: ${document.file_name}`);
            showError('File download requires file storage configuration. The file metadata has been saved.');
            console.log('Document metadata:', document);
        } catch (error) {
            console.error('Download error:', error);
            showError('Failed to download document');
        }
    };

    const handleDelete = async (documentId) => {
        if (window.confirm('Are you sure you want to delete this document record?')) {
            try {
                await api.delete(`/health-records/${documentId}`);
                showSuccess('Document record deleted successfully');
                fetchDocuments();
            } catch (error) {
                console.error('Delete error:', error);
                showError('Failed to delete document');
            }
        }
    };

    const getFileIcon = (fileName, fileType) => {
        if (!fileName && !fileType) return '📎';
        
        const name = (fileName || '').toLowerCase();
        const type = (fileType || '').toLowerCase();
        
        if (name.includes('.pdf') || type.includes('pdf')) return '📄';
        if (name.includes('.jpg') || name.includes('.jpeg') || name.includes('.png') || type.includes('image')) return '🖼️';
        if (name.includes('.doc') || type.includes('word')) return '📝';
        if (name.includes('.txt') || type.includes('text')) return '📃';
        if (name.includes('.xls') || type.includes('excel')) return '📊';
        return '📎';
    };

    const formatFileSize = (bytes) => {
        if (!bytes || bytes === 0) return 'Unknown';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'Unknown date';
        try {
            return new Date(dateString).toLocaleDateString();
        } catch (e) {
            return 'Invalid date';
        }
    };

    if (loading) return <div className="loading-docs">Loading documents...</div>;

    return (
        <div className="document-list">
            <h4>Patient Documents ({documents.length})</h4>
            {documents.length === 0 ? (
                <div className="no-documents">
                    <p>No documents uploaded yet</p>
                    <p className="hint">Upload medical reports, prescriptions, or images using the form above</p>
                </div>
            ) : (
                <div className="documents-grid">
                    {documents.map((doc) => (
                        <div key={doc.id} className="document-card">
                            <div className="document-icon">
                                {getFileIcon(doc.file_name, doc.file_type)}
                            </div>
                            <div className="document-info">
                                <div className="document-name">{doc.file_name}</div>
                                <div className="document-meta">
                                    <span className="document-date">
                                        📅 {formatDate(doc.uploaded_at)}
                                    </span>
                                    <span className="document-size">
                                        💾 {formatFileSize(doc.file_size)}
                                    </span>
                                </div>
                                <div className="document-description">📝 {doc.description}</div>
                            </div>
                            <div className="document-actions">
                                <button 
                                    onClick={() => handleDownload(doc)}
                                    className="download-button"
                                    title="Download"
                                >
                                    📥
                                </button>
                                <button 
                                    onClick={() => handleDelete(doc.id)}
                                    className="delete-button"
                                    title="Delete"
                                >
                                    🗑️
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default DocumentList;