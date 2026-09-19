import React, { useState, useCallback } from 'react';

const API_BASE = 'http://localhost:8000';

const FileUploader = ({ onUploadComplete }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState(null);

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragOut = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const detectFileType = (file) => {
    const ext = file.name.split('.').pop().toLowerCase();
    if (['las', 'laz'].includes(ext)) return { type: 'LiDAR', endpoint: '/api/upload/lidar' };
    if (['dxf', 'geojson'].includes(ext)) return { type: 'Floor Plan', endpoint: '/api/upload/floorplan' };
    if (['png', 'jpg', 'tif'].includes(ext)) return { type: 'Drone Image', endpoint: '/api/upload/drone-image' };
    if (['shp'].includes(ext)) return { type: 'GIS Parcel', endpoint: '/api/upload/parcels' };
    return null;
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
      e.dataTransfer.clearData();
    }
  }, []);

  const handleFiles = async (files) => {
    const file = files[0];
    if (!file) return;

    const fileInfo = detectFileType(file);
    if (!fileInfo) {
      alert("Unsupported file type.");
      return;
    }

    setUploading(true);
    setProgress(0);
    setUploadResult(null);

    // Simulate progress
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 10;
      });
    }, 200);

    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const res = await fetch(`${API_BASE}${fileInfo.endpoint}`, {
        method: 'POST',
        body: formData
      });
      
      clearInterval(progressInterval);
      setProgress(100);
      
      if (!res.ok) throw new Error('Upload failed');
      
      const data = await res.json();
      
      const result = {
        name: file.name,
        size: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
        type: fileInfo.type,
        data
      };
      
      setUploadResult(result);
      if (onUploadComplete) onUploadComplete(result);
      
    } catch (err) {
      clearInterval(progressInterval);
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleChange = (e) => {
    handleFiles(e.target.files);
  };

  return (
    <div className="file-uploader" style={{ background: 'rgba(255,255,255,0.03)', padding: '20px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div 
        className={`drop-zone ${isDragging ? 'active' : ''}`}
        onDragEnter={handleDragIn}
        onDragLeave={handleDragOut}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        style={{
          border: '2px dashed',
          borderColor: isDragging ? '#00e5ff' : 'rgba(255,255,255,0.2)',
          borderRadius: '8px',
          padding: '40px 20px',
          textAlign: 'center',
          transition: 'all 0.3s ease',
          backgroundColor: isDragging ? 'rgba(0, 229, 255, 0.05)' : 'transparent',
          cursor: 'pointer'
        }}
        onClick={() => document.getElementById('file-upload-input').click()}
      >
        <input 
          id="file-upload-input"
          type="file" 
          style={{ display: 'none' }} 
          onChange={handleChange} 
          accept=".las,.laz,.dxf,.geojson,.shp,.png,.jpg,.tif"
        />
        <p style={{ margin: 0, color: '#e0e0e0', fontWeight: '500' }}>
          Drag & drop your files here
        </p>
        <p style={{ margin: '8px 0 0', color: '#a0a0a0', fontSize: '12px' }}>
          Supports .las, .laz, .dxf, .geojson, .shp, .png, .jpg, .tif
        </p>
      </div>

      {uploading && (
        <div style={{ marginTop: '20px' }}>
          <div className="upload-progress" style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: '#00e5ff', transition: 'width 0.2s' }}></div>
          </div>
          <p style={{ margin: '4px 0 0', textAlign: 'right', fontSize: '11px', color: '#00e5ff' }}>{progress}%</p>
        </div>
      )}

      {uploadResult && (
        <div className="file-meta" style={{ marginTop: '20px', padding: '15px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', borderLeft: '3px solid #00e5ff' }}>
          <h4 style={{ margin: '0 0 10px', color: '#00e5ff', fontSize: '14px' }}>Upload Complete</h4>
          <p style={{ margin: '4px 0', fontSize: '13px', color: '#e0e0e0' }}><strong>File:</strong> {uploadResult.name}</p>
          <p style={{ margin: '4px 0', fontSize: '13px', color: '#e0e0e0' }}><strong>Size:</strong> {uploadResult.size}</p>
          <p style={{ margin: '4px 0', fontSize: '13px', color: '#e0e0e0' }}><strong>Detected Type:</strong> {uploadResult.type}</p>
        </div>
      )}
    </div>
  );
};

export { FileUploader };
export default FileUploader;
