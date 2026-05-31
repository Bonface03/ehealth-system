// src/components/common/DocumentUpload.js
import React, { useState } from 'react';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import './DocumentUpload.css';

const DocumentUpload = ({ patientId, onUploadComplete }) => {
    const [file, setFile] = useState(null);
    const [description, setDescription] = useState('');
    const [uploading, setUploading] = useState(false);
    const { showSuccess, showError } = useToast();

    const handleFileSelect = (e) => {
        const selectedFile = e.target.files[0];
        if (selectedFile) {
            // Validate file size (10MB max)
            const maxSize = 10 * 1024 * 1024;
            if (selectedFile.size > maxSize) {
                showError(`File size must be less than ${maxSize / (1024 * 1024)}MB`);
                return;
            }
            setFile(selectedFile);
        }
    };

    const handleUpload = async () => {
        if (!file) {
            showError('Please select a file to upload');
            return;
        }

        if (!patientId) {
            showError('Patient ID is missing');
            return;
        }

        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        
        // Create record data with patient association
        const recordData = {
            description: description || `Medical document uploaded for patient`,
            patientId: patientId,
            patient_id: patientId,
            type: 'medical_document',
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
            uploadedBy: 'doctor',
            uploadedAt: new Date().toISOString(),
            title: file.name
        };
        
        formData.append('recordData', JSON.stringify(recordData));

        try {
            console.log('Uploading document for patient:', patientId);
            console.log('File:', file.name, 'Size:', file.size);
            console.log('Record data:', recordData);
            
            const response = await api.post('/health-records/with-file', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            
            console.log('Upload response:', response.data);
            
            if (response.data.success) {
                showSuccess(`Document "${file.name}" uploaded successfully`);
                setFile(null);
                setDescription('');
                // Reset file input
                const fileInput = document.getElementById('file-upload');
                if (fileInput) fileInput.value = '';
                // Notify parent to refresh
                if (onUploadComplete) {
                    setTimeout(() => onUploadComplete(), 500);
                }
            } else {
                showError(response.data.error || 'Upload failed');
            }
        } catch (error) {
            console.error('Upload error:', error);
            const errorMsg = error.response?.data?.error || error.message || 'Failed to upload document';
            showError(errorMsg);
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="document-upload">
            <h4>Upload Medical Document</h4>
            <div className="upload-area">
                <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.txt"
                    onChange={handleFileSelect}
                    className="file-input"
                    id="file-upload"
                />
                <label htmlFor="file-upload" className="upload-label">
                    📄 Choose Document
                </label>
                {file && (
                    <div className="file-info">
                        <span className="file-name">{file.name}</span>
                        <span className="file-size">
                            ({(file.size / (1024 * 1024)).toFixed(2)} MB)
                        </span>
                    </div>
                )}
            </div>
            
            <textarea
                placeholder="Document description (e.g., X-ray result, Lab report, Prescription scan...)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="description-input"
                rows="3"
            />
            
            <button 
                onClick={handleUpload} 
                disabled={!file || uploading}
                className="upload-button"
            >
                {uploading ? 'Uploading...' : 'Upload Document'}
            </button>
        </div>
    );
};

export default DocumentUpload;