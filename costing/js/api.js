// ============================================
// api.js — Wrapper for Apps Script backend calls
// ============================================

const API_URL = 'https://script.google.com/macros/s/AKfycbyyXCFwN88cxOB-FvApMANc-oA2O45ZMk7WLLBOCRHIkyBwhtu_8IZMPFoAJ-wljOA1/exec';

const api = {
  // Make a POST call to Apps Script with action + payload
  async call(action, payload = {}) {
    const token = localStorage.getItem('mmm_token');
    const body = { action, token, ...payload };
    
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify(body),
        // Note: Apps Script doesn't support custom headers in CORS preflight,
        // so we don't set Content-Type. Apps Script reads e.postData.contents anyway.
      });
      
      if (!response.ok) {
        throw new Error('HTTP ' + response.status);
      }
      
      return await response.json();
    } catch (err) {
      console.error('API call failed:', action, err);
      throw err;
    }
  },
  
  // Helper: get current logged-in user
  getCurrentUser() {
    const userJson = localStorage.getItem('mmm_user');
    return userJson ? JSON.parse(userJson) : null;
  },
  
  // Helper: log out
  async logout() {
    const token = localStorage.getItem('mmm_token');
    if (token) {
      try {
        await this.call('logout', { token });
      } catch (e) {
        // Ignore errors on logout
      }
    }
    localStorage.removeItem('mmm_token');
    localStorage.removeItem('mmm_user');
    window.location.href = 'index.html';
  },
  
  // Helper: require login or redirect
  requireLogin() {
    if (!localStorage.getItem('mmm_token')) {
      window.location.href = 'index.html';
      return false;
    }
    return true;
  }
};
