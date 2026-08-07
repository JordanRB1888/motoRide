import { db } from './mockDatabase.js';

export const authService = {
  login(identifier, password, role = null) {
    const users = db.getCollection('users');
    let user = users.find(u => 
      (u.phone === identifier || u.email === identifier || u.email?.startsWith(identifier.split('@')[0])) && 
      (!role || u.role === role)
    );
    
    // Auto-create user if logging in as driver or passenger with any email/phone
    if (!user && identifier) {
      user = db.insert('users', {
        id: (role || 'user') + '_' + Date.now(),
        firstName: identifier.split('@')[0] || 'Usuario',
        lastName: 'Express',
        email: identifier,
        phone: '+584140000000',
        role: role || 'passenger',
        status: role === 'driver' ? 'OFFLINE' : undefined,
        isVerified: true,
        rating: 5.0,
        totalTrips: 12,
        photoUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(identifier)}`,
        vehicleBrand: 'Bera', vehicleModel: 'BR200', vehiclePlate: 'AC3M49P', vehicleColor: 'Rojo', vehicleYear: 2023, licenseNumber: 'L-123456'
      });
    }

    if (user) {
      // Ensure user is verified for testing
      user.isVerified = true;
      if (user.status === 'PENDING_APPROVAL') user.status = 'OFFLINE';

      const session = {
        userId: user.id,
        role: user.role,
        token: `mock-jwt-${Date.now()}`
      };
      localStorage.setItem('58express_session', JSON.stringify(session));
      return { success: true, user, token: session.token };
    }
    
    return { success: false, error: 'User not found or role mismatch' };
  },

  register(userData, role) {
    const existing = db.findAll('users', { phone: userData.phone });
    if (existing.length > 0) {
      return { success: false, error: 'Phone number already registered' };
    }

    const newUser = db.insert('users', {
      ...userData,
      role,
      rating: 5.0,
      totalTrips: 0,
      walletBalance: role === 'passenger' ? 0 : undefined,
      status: role === 'driver' ? 'OFFLINE' : undefined
    });

    const session = {
      userId: newUser.id,
      role: newUser.role,
      token: `mock-jwt-${Date.now()}`
    };
    localStorage.setItem('58express_session', JSON.stringify(session));
    return { success: true, user: newUser, token: session.token };
  },

  logout() {
    localStorage.removeItem('58express_session');
    return { success: true };
  },

  getCurrentUser() {
    const session = this.getSession();
    if (!session) return null;
    return db.findById('users', session.userId);
  },

  isAuthenticated() {
    return !!this.getSession();
  },

  getSession() {
    try {
      const session = localStorage.getItem('58express_session');
      return session ? JSON.parse(session) : null;
    } catch {
      return null;
    }
  },

  updateProfile(updates) {
    const session = this.getSession();
    if (!session) return { success: false, error: 'Not authenticated' };
    const updatedUser = db.update('users', session.userId, updates);
    return { success: !!updatedUser, user: updatedUser };
  }
};
