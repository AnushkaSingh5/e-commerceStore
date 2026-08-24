'use client';

import { useAdmin } from '@/context/AdminContext';
import Table from '@/components/UI/Table';
import Button from '@/components/UI/Button';
import Input from '@/components/UI/Input';
import Modal from '@/components/UI/Modal';
import { useState, useEffect } from 'react';
import { profileService } from '@/services/profileService';

// Helper for dynamic creator avatar colors
const getAvatarColor = (name) => {
  const colors = ['#1e293b', '#8b5cf6', '#10b981', '#f59e0b', '#3b82f6', '#ec4899'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

// Helper for initials
const getInitials = (name) => {
  if (!name) return '??';
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
};

export default function AdminCreators() {
  const { stores = [], approveStore, rejectStore, disableStore, loading, loadPlatformData } = useAdmin();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('All');
  const [selectedCreator, setSelectedCreator] = useState(null);

  const isProfileIncomplete = (profile, docs) => {
    if (!profile) return true;
    
    // Check required fields
    const requiredFields = [
      profile.name,
      profile.phone,
      profile.date_of_birth,
      profile.gender,
      profile.bio,
      profile.business_name,
      profile.business_type,
      profile.address,
      profile.city,
      profile.state,
      profile.country,
      profile.postal_code
    ];
    
    const hasEmptyField = requiredFields.some(val => !val || String(val).trim() === '');
    
    // Check mandatory documents: Government ID Proof and Address Proof
    const hasGovId = docs.some(d => d.document_type === 'Government ID Proof' && d.document_url);
    const hasAddressProof = docs.some(d => d.document_type === 'Address Proof' && d.document_url);
    
    return hasEmptyField || !hasGovId || !hasAddressProof;
  };

  // Dynamic Metrics
  const activeSellers = loading ? 0 : stores.filter(s => s.ownerVerificationStatus === 'Verified').length;
  const pendingSellers = loading ? 0 : stores.filter(s => s.ownerVerificationStatus === 'Under Review' || s.ownerVerificationStatus === 'Pending' || s.ownerVerificationStatus === 'Not Submitted').length;
  const rejectedSellers = loading ? 0 : stores.filter(s => s.ownerVerificationStatus === 'Rejected').length;
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Extended Profile and Document States
  const [extendedProfile, setExtendedProfile] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Derive creators from stores mapping creatorId
  const creators = loading ? [] : stores.map(store => ({
    id: store.id,
    creatorId: store.creatorId || 'mock-creator-uid',
    name: store.ownerName || '',
    email: store.email || '',
    storeName: store.name || '',
    status: store.status || '',
    verificationStatus: store.ownerVerificationStatus || 'Not Submitted',
    joinedDate: store.createdDate || '',
    revenue: store.revenue || 0,
    growth: store.growth || 0
  })).filter(c => {
    // Search filter
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          c.storeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          c.email.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    // Date range filter
    if (startDate && c.joinedDate < startDate) return false;
    if (endDate && c.joinedDate > endDate) return false;

    // Status filter
    if (selectedStatusFilter === 'Active' && c.verificationStatus !== 'Verified') return false;
    if (selectedStatusFilter === 'Pending' && c.verificationStatus !== 'Under Review' && c.verificationStatus !== 'Pending' && c.verificationStatus !== 'Not Submitted') return false;
    if (selectedStatusFilter === 'Rejected' && c.verificationStatus !== 'Rejected') return false;

    return true;
  });

  // Read query params for automatic pre-selection or filtering
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const searchParam = params.get('search');
      const creatorIdParam = params.get('creatorId');
      
      if (searchParam) {
        setSearchQuery(searchParam);
      }
      
      if (creatorIdParam && creators.length > 0) {
        const matched = creators.find(c => c.creatorId === creatorIdParam);
        if (matched) {
          setSelectedCreator(matched);
        }
      }
    }
  }, [loading, stores]);

  // Fetch extended details when creator is selected
  useEffect(() => {
    if (selectedCreator) {
      const loadCreatorData = async () => {
        setDocsLoading(true);
        try {
          const profRes = await profileService.getProfile(selectedCreator.creatorId);
          const docsRes = await profileService.getCreatorDocuments(selectedCreator.creatorId);
          if (profRes.success) setExtendedProfile(profRes.profile);
          if (docsRes.success) setDocuments(docsRes.documents);
        } catch (e) {
          console.error('Error fetching creator data:', e);
        } finally {
          setDocsLoading(false);
        }
      };
      loadCreatorData();
    } else {
      setExtendedProfile(null);
      setDocuments([]);
    }
  }, [selectedCreator]);

  const handleVerifyCreator = async () => {
    if (!selectedCreator) return;
    if (!confirm('Are you sure you want to verify this seller? All uploaded documents will be marked as verified.')) return;
    
    setActionLoading(true);
    try {
      const res = await profileService.adminUpdateVerificationStatus(selectedCreator.creatorId, 'Verified');
      if (res.success) {
        alert('Seller marked as Verified successfully!');
        if (loadPlatformData) {
          await loadPlatformData();
        }
        // Refresh details
        const profRes = await profileService.getProfile(selectedCreator.creatorId);
        const docsRes = await profileService.getCreatorDocuments(selectedCreator.creatorId);
        if (profRes.success) setExtendedProfile(profRes.profile);
        if (docsRes.success) setDocuments(docsRes.documents);
      } else {
        alert('Failed to verify seller: ' + res.error);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectCreator = async () => {
    if (!selectedCreator) return;
    if (!confirm('Are you sure you want to reject this seller\'s verification request?')) return;

    setActionLoading(true);
    try {
      const res = await profileService.adminUpdateVerificationStatus(selectedCreator.creatorId, 'Rejected');
      if (res.success) {
        alert('Seller verification status updated to Rejected.');
        if (loadPlatformData) {
          await loadPlatformData();
        }
        // Refresh details
        const profRes = await profileService.getProfile(selectedCreator.creatorId);
        const docsRes = await profileService.getCreatorDocuments(selectedCreator.creatorId);
        if (profRes.success) setExtendedProfile(profRes.profile);
        if (docsRes.success) setDocuments(docsRes.documents);
      } else {
        alert('Failed to reject verification: ' + res.error);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  const columns = [
    { field: 'name', label: 'Full Name', render: (row) => <span style={{ fontWeight: 700 }}>{row.name}</span> },
    { field: 'email', label: 'Email' },
    { field: 'storeName', label: 'Store Name' },
    { field: 'revenue', label: 'Total Revenue', render: (row) => `₹${(row.revenue || 0).toLocaleString()}` },
    { field: 'verificationStatus', label: 'Status', render: (row) => (
      <span className="status-badge" style={{
        backgroundColor: getVerificationStatusColor(row.verificationStatus) + '20',
        color: getVerificationStatusColor(row.verificationStatus)
      }}>
        {row.verificationStatus}
      </span>
    )},
  ];

  const actions = (row) => (
    <div style={{ display: 'flex', gap: '8px' }}>
      <Button variant="secondary" size="sm" onClick={() => setSelectedCreator(row)}>Details</Button>
    </div>
  );

  const getVerificationStatusColor = (status) => {
    switch (status) {
      case 'Verified': return '#10b981';
      case 'Under Review': return '#f59e0b';
      case 'Rejected': return '#ef4444';
      default: return '#64748b';
    }
  };

  return (
    <div className="admin-creators">
      <div className="page-header">
        <div className="header-text">
          <h2>Seller Management</h2>
          <p>Monitor profiles, verify credentials, and review verification documents.</p>
        </div>
        <div className="header-actions" style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="date-filter-group" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: '700', color: '#64748b' }}>From:</span>
              <input 
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  fontSize: '13px',
                  fontFamily: 'inherit',
                  color: '#334155',
                  outline: 'none',
                  background: '#fff'
                }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: '700', color: '#64748b' }}>To:</span>
              <input 
                type="date" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  fontSize: '13px',
                  fontFamily: 'inherit',
                  color: '#334155',
                  outline: 'none',
                  background: '#fff'
                }}
              />
            </div>
            {(startDate || endDate) && (
              <button 
                onClick={() => { setStartDate(''); setEndDate(''); }}
                style={{
                  padding: '6px 12px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  color: '#475569',
                  fontSize: '12px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                Clear
              </button>
            )}
          </div>
          <div style={{ width: '220px' }}>
            <Input 
              placeholder="Search sellers..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Overview Section */}
      <div className="overview-section">
        <h4>Overview</h4>
        <div className="summary-cards">
          <div 
            className={`summary-card ${selectedStatusFilter === 'All' ? 'active-purple' : ''}`}
            onClick={() => setSelectedStatusFilter('All')}
          >
            <div className="icon-wrap purple-bg">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
            </div>
            <div className="card-data">
              <p className="card-label">Total Sellers</p>
              <h3 className="card-val">{loading ? 0 : stores.length}</h3>
            </div>
          </div>
          <div 
            className={`summary-card ${selectedStatusFilter === 'Active' ? 'active-green' : ''}`}
            onClick={() => setSelectedStatusFilter('Active')}
          >
            <div className="icon-wrap green-bg">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
            </div>
            <div className="card-data">
              <p className="card-label">Active Sellers</p>
              <h3 className="card-val">{activeSellers}</h3>
            </div>
          </div>
          <div 
            className={`summary-card ${selectedStatusFilter === 'Pending' ? 'active-orange' : ''}`}
            onClick={() => setSelectedStatusFilter('Pending')}
          >
            <div className="icon-wrap orange-bg">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            </div>
            <div className="card-data">
              <p className="card-label">Pending</p>
              <h3 className="card-val">{pendingSellers}</h3>
            </div>
          </div>
          <div 
            className={`summary-card ${selectedStatusFilter === 'Rejected' ? 'active-red' : ''}`}
            onClick={() => setSelectedStatusFilter('Rejected')}
          >
            <div className="icon-wrap red-bg">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
            </div>
            <div className="card-data">
              <p className="card-label">Rejected</p>
              <h3 className="card-val">{rejectedSellers}</h3>
            </div>
          </div>
        </div>
      </div>

      <div className="desktop-view-only">
        <div className="creators-card">
          <Table columns={columns} data={creators} actions={actions} loading={loading} />
        </div>
      </div>

      <div className="mobile-view-only">

        {/* List Header */}
        <div className="mobile-list-header">
          <h3>All Sellers ({creators.length})</h3>
        </div>

        {/* Creators List */}
        <div className="mobile-creators-list">
          {loading ? (
            [...Array(3)].map((_, i) => (
              <div key={i} className="mobile-creator-card skeleton shim">
                <div className="creator-header-section">
                  <div className="creator-avatar" style={{ background: '#e2e8f0' }}></div>
                  <div className="creator-meta-stack" style={{ width: '100%' }}>
                    <div className="skeleton-bar" style={{ width: '60%', height: '14px', marginBottom: '8px', background: '#e2e8f0', borderRadius: '4px' }}></div>
                    <div className="skeleton-bar" style={{ width: '80%', height: '12px', marginBottom: '8px', background: '#e2e8f0', borderRadius: '4px' }}></div>
                    <div className="skeleton-bar" style={{ width: '40%', height: '12px', background: '#e2e8f0', borderRadius: '4px' }}></div>
                  </div>
                </div>
              </div>
            ))
          ) : creators.length === 0 ? (
            <div className="empty-state">No data available</div>
          ) : (
            creators.map(c => (
              <div key={c.id} className="mobile-creator-card">
                <div className="creator-header-section">
                  <div className="creator-avatar" style={{ backgroundColor: getAvatarColor(c.name) }}>
                    {getInitials(c.name)}
                  </div>
                  <div className="creator-meta-stack">
                    <h4 className="creator-name-text">{c.name}</h4>
                    <span className="email-text">{c.email}</span>
                    <span className="store-name-text">{c.storeName}</span>
                    <span className="status-pill" style={{
                      backgroundColor: getVerificationStatusColor(c.verificationStatus) + '20',
                      color: getVerificationStatusColor(c.verificationStatus),
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 8px',
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontWeight: '700',
                      width: 'fit-content'
                    }}>
                      <span className="status-dot" style={{
                        backgroundColor: getVerificationStatusColor(c.verificationStatus),
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        display: 'inline-block'
                      }}></span>
                      {c.verificationStatus}
                    </span>
                    <span className="revenue-text">Revenue: ₹{(c.revenue || 0).toLocaleString()}</span>
                  </div>
                </div>
                <div className="mobile-card-actions">
                  <button className="btn-action btn-details" style={{ width: '100%' }} onClick={() => setSelectedCreator(c)}>Details</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <Modal 
        isOpen={!!selectedCreator} 
        onClose={() => setSelectedCreator(null)}
        title="Seller Verification & Profile details"
        size="large"
        footer={
          <div className="modal-footer-actions">
            {extendedProfile && (extendedProfile.verification_status === 'Under Review' || extendedProfile.verification_status === 'Not Submitted') && (
              <>
                <button 
                  className="btn-moderate verify" 
                  onClick={handleVerifyCreator} 
                  disabled={actionLoading}
                  style={{
                    opacity: actionLoading ? 0.5 : 1,
                    cursor: actionLoading ? 'not-allowed' : 'pointer'
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: '6px' }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                  Verify Seller
                </button>
                <button className="btn-moderate reject" onClick={handleRejectCreator} disabled={actionLoading}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: '6px' }}><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
                  Reject Verification
                </button>
              </>
            )}
            <button className="btn-moderate close-btn" onClick={() => setSelectedCreator(null)}>Close</button>
          </div>
        }
      >
        {selectedCreator && (
          <div className="creator-details">
            {isProfileIncomplete(extendedProfile, documents) && (
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                backgroundColor: '#fff7ed',
                border: '1px solid #ffedd5',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '24px',
                color: '#9a3412',
                fontFamily: "'Inter', sans-serif"
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2.5" style={{ marginRight: '12px', flexShrink: 0, marginTop: '2px' }}>
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
                <div style={{ fontSize: '14px' }}>
                  <strong style={{ display: 'block', marginBottom: '4px' }}>Incomplete Profile & Documents</strong>
                  <span style={{ color: '#c2410c', lineHeight: '1.5' }}>
                    This creator has not completed all profile details or is missing mandatory KYC documents (Government ID Proof & Address Proof). You can still proceed with manual verification.
                  </span>
                </div>
              </div>
            )}
            <div className="profile-main">
              <div className="avatar">
                {extendedProfile?.profile_image ? (
                  <img src={extendedProfile.profile_image} alt={selectedCreator.name} />
                ) : (
                  selectedCreator.name.charAt(0)
                )}
              </div>
              <div className="info">
                <h3>{selectedCreator.name}</h3>
                <p>{selectedCreator.email}</p>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span className={`status-badge ${selectedCreator.status.toLowerCase()}`}>Store: {selectedCreator.status}</span>
                  <span className="ver-badge" style={{ background: getVerificationStatusColor(extendedProfile?.verification_status || 'Not Submitted') }}>
                    ID: {extendedProfile?.verification_status || 'Not Submitted'}
                  </span>
                </div>
              </div>
            </div>

            <div className="details-section">
              <h4>Basic Information</h4>
              <div className="detail-grid">
                <div className="detail-item">
                  <strong>Full Name</strong>
                  <span>{extendedProfile?.full_name || selectedCreator.name || '--'}</span>
                </div>
                <div className="detail-item">
                  <strong>Phone</strong>
                  <span>{extendedProfile?.phone || '--'}</span>
                </div>
                <div className="detail-item">
                  <strong>Date of Birth</strong>
                  <span>{extendedProfile?.date_of_birth || '--'}</span>
                </div>
                <div className="detail-item">
                  <strong>Gender</strong>
                  <span>{extendedProfile?.gender || '--'}</span>
                </div>
                <div className="detail-item full-width">
                  <strong>Bio / About Creator</strong>
                  <p className="bio-text">{extendedProfile?.bio || 'No bio provided.'}</p>
                </div>
              </div>
            </div>

            <div className="details-section">
              <h4>Business Information</h4>
              <div className="detail-grid business-grid">
                <div className="detail-item">
                  <strong>Business Name</strong>
                  <span>{extendedProfile?.business_name || '--'}</span>
                </div>
                <div className="detail-item">
                  <strong>Business Type</strong>
                  <span>{extendedProfile?.business_type || '--'}</span>
                </div>
                <div className="detail-item full-width">
                  <strong>Address</strong>
                  <span>{extendedProfile?.address || '--'}</span>
                </div>
                <div className="detail-item">
                  <strong>City</strong>
                  <span>{extendedProfile?.city || '--'}</span>
                </div>
                <div className="detail-item">
                  <strong>State / Country</strong>
                  <span>{extendedProfile?.state ? `${extendedProfile.state}, ${extendedProfile.country}` : '--'}</span>
                </div>
              </div>
            </div>

            <div className="details-section">
              <h4>Verification Documents</h4>
              {docsLoading ? (
                <div className="docs-loader">Loading documents...</div>
              ) : documents.length === 0 ? (
                <div className="empty-docs-box">
                  <div className="folder-icon-wrap">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                  </div>
                  <h5>No verification documents</h5>
                  <p>No verification documents have been uploaded yet.</p>
                </div>
              ) : (
                <div className="docs-list">
                  {documents.map((doc, idx) => (
                    <div className="doc-row" key={doc.id || idx}>
                      <div className="doc-info">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                        <div className="doc-meta">
                          <strong>{doc.document_type}</strong>
                          <span>Uploaded: {doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString() : 'N/A'}</span>
                        </div>
                      </div>
                      <div className="doc-actions">
                        <span className="doc-status-pill" style={{ color: getVerificationStatusColor(doc.status), borderColor: getVerificationStatusColor(doc.status) }}>
                          {doc.status}
                        </span>
                        <a href={doc.document_url} target="_blank" rel="noopener noreferrer" className="btn-view-doc">View</a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <style jsx>{`
        .admin-creators { display: flex; flex-direction: column; gap: 32px; }
        .page-header { display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; flex-wrap: wrap; }
        .header-text h2 { font-size: 24px; font-weight: 800; color: #1e293b; margin: 0; }
        .header-text p { color: #64748b; margin: 4px 0 0 0; }
        .header-actions { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
        
        .creators-card {
          background: #fff;
          border-radius: 24px;
          padding: 24px;
          border: 1px solid #f1f5f9;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
        }

        .status-badge {
          padding: 4px 10px;
          border-radius: 10px;
          font-size: 11px;
          font-weight: 700;
        }
        .status-badge.active { background: #dcfce7; color: #166534; }
        .status-badge.pending { background: #fef3c7; color: #92400e; }
        .status-badge.disabled { background: #fee2e2; color: #b91c1c; }

        .ver-badge {
          padding: 4px 10px;
          border-radius: 10px;
          font-size: 11px;
          font-weight: 700;
          color: #fff;
        }

        .creator-details { display: flex; flex-direction: column; gap: 20px; max-height: none; overflow: visible; }
        .profile-main { display: flex; align-items: center; gap: 16px; margin-bottom: 4px; }
        .avatar {
          width: 64px; height: 64px; background: #8b5cf6; color: #fff;
          border-radius: 20px; display: flex; align-items: center; justify-content: center;
          font-size: 24px; font-weight: 800; overflow: hidden;
        }
        .avatar img {
          width: 100%; height: 100%; object-fit: cover;
        }
        .info h3 { font-size: 18px; font-weight: 700; color: #1e293b; margin: 0; }
        .info p { font-size: 14px; color: #64748b; margin: 4px 0 8px 0; }
        
        .details-section {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .details-section h4 {
          font-size: 14px;
          font-weight: 800;
          color: #1e293b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin: 0;
          padding-bottom: 6px;
          border-bottom: 1px dashed #cbd5e1;
        }

        .detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px 20px; padding: 16px; background: #f8fafc; border-radius: 16px; }
        .detail-item { display: flex; flex-direction: column; gap: 4px; }
        .detail-item strong { font-size: 11px; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.5px; }
        .detail-item span { font-size: 14px; font-weight: 700; color: #334155; }
        .detail-item.full-width { grid-column: 1 / -1; }

        .bio-text {
          font-size: 14px;
          color: #475569;
          margin: 0;
          line-height: 1.5;
        }

        /* Docs Styles */
        .docs-loader, .no-docs-message {
          padding: 16px;
          text-align: center;
          color: #94a3b8;
          font-size: 14px;
        }
        .docs-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .doc-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 14px 16px;
          background: #f8fafc;
          border: 1px solid #f1f5f9;
          border-radius: 12px;
        }
        .doc-info {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .doc-meta {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .doc-meta strong {
          font-size: 14px;
          color: #334155;
        }
        .doc-meta span {
          font-size: 11px;
          color: #94a3b8;
        }
        .doc-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .doc-status-pill {
          padding: 2px 8px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 700;
          background: #fff;
          border: 1px solid;
        }
        .btn-view-doc {
          background: #fff;
          border: 1px solid #cbd5e1;
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 700;
          color: #475569;
          border-radius: 8px;
          text-decoration: none;
          transition: all 0.2s;
        }
        .btn-view-doc:hover {
          background: #f1f5f9;
        }

        /* Modal Footer Moderate */
        .modal-footer-actions {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
          width: 100%;
        }
        .btn-moderate {
          padding: 8px 16px;
          border-radius: 12px;
          font-weight: 700;
          font-size: 14px;
          cursor: pointer;
          border: none;
          transition: all 0.2s;
        }
        .btn-moderate.verify {
          background: linear-gradient(135deg, #10b981, #059669);
          color: #fff;
        }
        .btn-moderate.verify:hover {
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);
        }
        .btn-moderate.reject {
          background: linear-gradient(135deg, #ef4444, #dc2626);
          color: #fff;
        }
        .btn-moderate.reject:hover {
          box-shadow: 0 4px 12px rgba(239, 68, 68, 0.2);
        }

        /* Global Overview Styles (Desktop) */
        .overview-section {
          margin-bottom: 32px;
          width: 100%;
        }
        .overview-section h4 {
          font-size: 18px;
          font-weight: 800;
          color: #1e293b;
          margin: 0 0 16px 0;
        }
        .summary-cards {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 24px;
        }
        .summary-card {
          background: #fff;
          border-radius: 20px;
          padding: 24px;
          display: flex;
          align-items: flex-start;
          gap: 16px;
          box-shadow: 0 10px 25px -5px rgba(0,0,0,0.02), 0 8px 10px -6px rgba(0,0,0,0.02);
          border: 2px solid #f8fafc;
          cursor: pointer;
          transition: all 0.2s ease-in-out;
        }
        .summary-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 30px -5px rgba(0,0,0,0.05), 0 8px 15px -6px rgba(0,0,0,0.05);
        }
        .summary-card.active-purple {
          border: 2px solid #8b5cf6;
          box-shadow: 0 12px 30px -5px rgba(139, 92, 246, 0.15);
          background: #fafafa;
        }
        .summary-card.active-green {
          border: 2px solid #10b981;
          box-shadow: 0 12px 30px -5px rgba(16, 185, 129, 0.15);
          background: #fafafa;
        }
        .summary-card.active-orange {
          border: 2px solid #f59e0b;
          box-shadow: 0 12px 30px -5px rgba(245, 158, 11, 0.15);
          background: #fafafa;
        }
        .summary-card.active-red {
          border: 2px solid #ef4444;
          box-shadow: 0 12px 30px -5px rgba(239, 68, 68, 0.15);
          background: #fafafa;
        }
        .icon-wrap {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .purple-bg { background: #f3e8ff; }
        .green-bg { background: #dcfce7; }
        .orange-bg { background: #fef3c7; }
        .red-bg { background: #fee2e2; }
        
        .card-data {
          display: flex;
          flex-direction: column;
        }
        .card-label {
          font-size: 13px;
          font-weight: 600;
          color: #64748b;
          margin: 0 0 4px 0;
        }
        .card-val {
          font-size: 28px;
          font-weight: 800;
          color: #1e293b;
          margin: 0;
          line-height: 1.2;
        }

        .desktop-view-only {
          display: block;
        }
        .mobile-view-only {
          display: none;
        }

        @media (max-width: 768px) {
          .desktop-view-only {
            display: none !important;
          }
          .mobile-view-only {
            display: block !important;
          }
          
          .creators-card {
            background: transparent !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
          }
          
          .page-header {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 16px !important;
          }
          
          .header-actions {
            width: 100% !important;
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 12px !important;
          }
          
          .date-filter-group {
            display: flex !important;
            width: 100% !important;
            justify-content: space-between !important;
            gap: 12px !important;
          }
          
          .date-filter-group > div {
            flex: 1 !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 4px !important;
          }
          
          .date-filter-group input {
            width: 100% !important;
            padding: 10px 12px !important;
            font-size: 14px !important;
            border: 1px solid #cbd5e1 !important;
            border-radius: 12px !important;
            outline: none !important;
          }
          
          .header-actions > div:last-child {
            width: 100% !important;
          }

          /* Overview section */
          .overview-section {
            margin-top: 10px !important;
            margin-bottom: 10px !important;
            width: 100%;
          }
          .overview-section h4 {
            font-size: 16px;
            font-weight: 800;
            color: #1e293b;
            margin: 0 0 16px 0;
          }
          .summary-cards {
            display: grid !important;
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 12px !important;
          }
          .summary-card {
            background: #fff;
            border-radius: 16px;
            padding: 14px;
            display: flex;
            align-items: flex-start;
            gap: 10px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.02);
            border: 2px solid #f1f5f9;
            cursor: pointer;
          }
          .icon-wrap {
            width: 36px;
            height: 36px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          }
          .purple-bg { background: #f3e8ff; }
          .green-bg { background: #dcfce7; }
          .orange-bg { background: #fef3c7; }
          .red-bg { background: #fee2e2; }
          
          .card-data {
            display: flex;
            flex-direction: column;
          }
          .card-label {
            font-size: 11px;
            font-weight: 600;
            color: #64748b;
            margin: 0 0 2px 0;
          }
          .card-val {
            font-size: 20px;
            font-weight: 800;
            color: #1e293b;
            margin: 0;
            line-height: 1.2;
          }
          
          /* Mobile List Header */
          .mobile-list-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 10px !important;
            margin-bottom: 10px !important;
          }
          .mobile-list-header h3 {
            font-size: 16px;
            font-weight: 800;
            color: #1e293b;
            margin: 0;
          }
          .sort-btn {
            background: #fff;
            border: 1px solid #e2e8f0;
            width: 36px;
            height: 36px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.2s;
          }
          .sort-btn:hover {
            background: #f8fafc;
          }

          /* Creators List */
          .mobile-creators-list {
            display: flex;
            flex-direction: column;
            gap: 16px;
            margin-bottom: 24px;
          }
          .mobile-creator-card {
            background: #fff;
            border-radius: 16px;
            padding: 16px;
            border: 1px solid #f1f5f9;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.02);
            display: flex;
            flex-direction: column;
            gap: 14px;
            position: relative;
          }
          
          .creator-header-section {
            display: flex;
            gap: 16px;
            align-items: flex-start;
          }
          
          .creator-avatar {
            width: 44px;
            height: 44px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #fff;
            font-weight: 800;
            font-size: 16px;
            flex-shrink: 0;
          }
          
          .creator-meta-stack {
            display: flex;
            flex-direction: column;
            gap: 6px;
            flex: 1;
            padding-right: 24px;
          }
          
          .creator-name-text {
            font-size: 15px;
            font-weight: 800;
            color: #1e293b;
            margin: 0;
          }
          
          .email-text {
            font-size: 13px;
            color: #64748b;
            font-weight: 500;
            word-break: break-all;
          }
          
          .store-name-text {
            font-size: 13px;
            color: #475569;
            font-weight: 700;
          }
          
          .status-pill {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 4px 10px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 700;
            width: fit-content;
          }
          .status-pill.active { background: #dcfce7; color: #166534; }
          .status-pill.pending { background: #fef3c7; color: #92400e; }
          .status-pill.rejected { background: #fee2e2; color: #b91c1c; }
          
          .status-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
          }
          .status-dot.active { background: #166534; }
          .status-dot.pending { background: #92400e; }
          .status-dot.rejected { background: #b91c1c; }

          .revenue-text {
            font-size: 13px;
            font-weight: 700;
            color: #1e293b;
          }
          
          .chevron-icon {
            position: absolute;
            top: 24px;
            right: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          
          .mobile-card-actions {
            display: flex;
            gap: 8px;
            margin-top: 4px;
            border-top: 1px solid #f1f5f9;
            padding-top: 12px;
          }
          
          .mobile-card-actions .btn-action {
            padding: 8px 12px !important;
            font-size: 12px !important;
            font-weight: 700 !important;
            border-radius: 10px !important;
            cursor: pointer;
            transition: all 0.2s;
            height: auto !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            border: none;
          }
          
          .mobile-card-actions .btn-details {
            background: #f1f5f9 !important;
            color: #475569 !important;
            flex: 1.5 !important;
          }
          .mobile-card-actions .btn-approve {
            background: #f3e8ff !important;
            color: #8b5cf6 !important;
            flex: 1 !important;
          }
          .mobile-card-actions .btn-reject {
            background: #fee2e2 !important;
            color: #ef4444 !important;
            flex: 1 !important;
          }
          .mobile-card-actions .btn-disable {
            background: #fff !important;
            border: 1px solid #fca5a5 !important;
            color: #ef4444 !important;
            flex: 1 !important;
          }
          .mobile-card-actions .btn-enable {
            background: #f3e8ff !important;
            color: #8b5cf6 !important;
            flex: 1 !important;
          }
          
          .table-footer {
            flex-direction: column-reverse !important;
            gap: 16px !important;
            align-items: center !important;
            margin-top: 24px !important;
          }
        }

        /* Empty verification docs dashed container styling */
        .empty-docs-box {
          border: 2px dashed #cbd5e1;
          border-radius: 16px;
          padding: 32px 24px;
          text-align: center;
          background: #f8fafc;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin: 12px 0;
          width: 100%;
        }
        .folder-icon-wrap {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: #f1f5f9;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .empty-docs-box h5 {
          font-size: 15px;
          font-weight: 800;
          color: #1e293b;
          margin: 0;
        }
        .empty-docs-box p {
          font-size: 13px;
          color: #64748b;
          margin: 0;
          max-width: 280px;
          line-height: 1.4;
        }

        /* Desktop close button styling */
        .btn-moderate.close-btn {
          background: #fff;
          border: 1px solid #cbd5e1;
          color: #475569;
        }
        .btn-moderate.close-btn:hover {
          background: #f8fafc;
        }

        /* Responsive Modal adjustments */
        @media (max-width: 576px) {
          .profile-main {
            gap: 16px !important;
            align-items: flex-start !important;
          }
          .profile-main .avatar {
            width: 56px !important;
            height: 56px !important;
            border-radius: 12px !important;
            font-size: 20px !important;
          }
          .profile-main .info h3 {
            font-size: 16px !important;
          }
          .profile-main .info p {
            font-size: 13px !important;
            margin-bottom: 6px !important;
          }
          .detail-grid {
            grid-template-columns: repeat(3, 1fr) !important;
            gap: 12px !important;
          }
          .business-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
          .business-grid .detail-item.full-width {
            grid-column: span 2 !important;
          }
          .modal-footer-actions {
            flex-direction: column !important;
            gap: 10px !important;
          }
          .modal-footer-actions .btn-moderate {
            width: 100% !important;
            justify-content: center !important;
            display: flex !important;
            align-items: center !important;
            padding: 12px 16px !important;
            font-size: 14px !important;
          }
        }
      `}</style>
    </div>
  );
}
