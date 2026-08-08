import { apiService } from './apiService.js';
import { db } from './mockDatabase.js';
import { socketClient } from './socketClient.js';

function saveSession(user, token) {
  const session = { userId: user.id, role: user.role, token, user };
  localStorage.setItem('58express_session', JSON.stringify(session));
  socketClient.authenticate(token);
  const existing = db.findById('users', user.id);
  if (existing) db.update('users', user.id, user);
  else db.insert('users', user);
}

export const authService = {
  async login(identifier, password, role = null) {
    const result = await apiService.post('/auth/login', { identifier, password, role });
    if (!result?.user || !result?.token) return { success: false, error: result?.error || 'INVALID_CREDENTIALS' };
    saveSession(result.user, result.token);
    return { success: true, user: result.user, token: result.token };
  },

  async register(userData, role) {
    const result = await apiService.post('/auth/register', { ...userData, role });
    if (!result?.user || !result?.token) return { success: false, error: result?.error || 'REGISTRATION_FAILED' };
    saveSession(result.user, result.token);
    return { success: true, user: result.user, token: result.token };
  },

  logout() {
    socketClient.clearAuthentication();
    localStorage.removeItem('58express_session');
    return { success: true };
  },

  getCurrentUser() {
    const session = this.getSession();
    return session?.user || (session?.userId ? db.findById('users', session.userId) : null);
  },

  isAuthenticated() {
    return Boolean(this.getSession()?.token);
  },

  getSession() {
    try { return JSON.parse(localStorage.getItem('58express_session') || 'null'); }
    catch { return null; }
  },

  async refreshSession() {
    const user = await apiService.get('/auth/me');
    const session = this.getSession();
    if (!user || !session?.token) return null;
    saveSession(user, session.token);
    return user;
  },

  async updateProfile(updates) {
    const session = this.getSession();
    if (!session) return { success: false, error: 'AUTH_REQUIRED' };
    const updatedUser = await apiService.patch('/auth/me', updates);
    if (!updatedUser) return { success: false, error: 'UPDATE_FAILED' };
    saveSession(updatedUser, session.token);
    return { success: true, user: updatedUser };
  }
};
