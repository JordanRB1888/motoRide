import { db } from './mockDatabase.js';
import { socket } from './mockSocket.js';
import { fareCalculator } from './fareCalculator.js';

class MockPayment {
  getWalletBalance(userId) {
    const user = db.findById('users', userId);
    return user ? (user.walletBalance || 0) : 0;
  }

  topUpWallet(userId, amount, method, reference) {
    const user = db.findById('users', userId);
    if (!user) return false;

    const newBalance = (user.walletBalance || 0) + amount;
    db.update('users', userId, { walletBalance: newBalance });

    const transaction = db.insert('transactions', {
      userId,
      type: 'TOP_UP',
      amount,
      currency: 'USD',
      method,
      reference,
      status: 'completed'
    });

    socket.emit(`wallet:${userId}:updated`, { balance: newBalance });
    return newBalance;
  }

  processPayment(tripId, userId, amount, method) {
    if (method === 'WALLET') {
      const user = db.findById('users', userId);
      if (user && user.walletBalance >= amount) {
        const newBalance = user.walletBalance - amount;
        db.update('users', userId, { walletBalance: newBalance });
        
        db.insert('transactions', {
          userId,
          tripId,
          type: 'RIDE_PAYMENT',
          amount: -amount,
          currency: 'USD',
          method,
          status: 'completed'
        });
        socket.emit(`wallet:${userId}:updated`, { balance: newBalance });
        return true;
      }
      return false; // Insufficient funds
    } else {
      // Simulate external payment verification delay
      setTimeout(() => {
        db.insert('transactions', {
          userId,
          tripId,
          type: 'RIDE_PAYMENT',
          amount: -amount,
          currency: 'USD',
          method,
          status: 'completed'
        });
      }, 1000);
      return true;
    }
  }

  processDriverPayout(tripId, driverId, amount) {
    const config = fareCalculator.getPricingConfig();
    const commission = amount * config.systemCommission;
    const driverEarnings = amount - commission;

    const driver = db.findById('users', driverId);
    if (!driver) return false;

    const newBalance = (driver.walletBalance || 0) + driverEarnings;
    db.update('users', driverId, { walletBalance: newBalance });

    db.insert('transactions', {
      userId: driverId,
      tripId,
      type: 'DRIVER_EARNING',
      amount: driverEarnings,
      currency: 'USD',
      status: 'completed'
    });

    db.insert('transactions', {
      userId: 'SYSTEM',
      tripId,
      type: 'COMMISSION',
      amount: commission,
      currency: 'USD',
      status: 'completed'
    });

    socket.emit(`wallet:${driverId}:updated`, { balance: newBalance });
    return true;
  }

  getTransactionHistory(userId) {
    return db.findAll('transactions', { userId })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  getSystemRevenue() {
    const commissions = db.findAll('transactions', { type: 'COMMISSION' });
    return commissions.reduce((sum, tx) => sum + tx.amount, 0);
  }
}

export const paymentService = new MockPayment();
