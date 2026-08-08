import { socket } from './socketClient.js';
import { syncInsertSupabase, syncUpdateSupabase } from './supabaseClient.js';

class MockDatabase {
  constructor() {
    this.prefix = '58express_db_';
  }

  getCollection(name) {
    try {
      const data = localStorage.getItem(`${this.prefix}${name}`);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error(`Error reading collection ${name}:`, e);
      return [];
    }
  }

  setCollection(name, data) {
    try {
      localStorage.setItem(`${this.prefix}${name}`, JSON.stringify(data));
      socket.emit(`db:${name}:updated`, data);
    } catch (e) {
      console.error(`Error writing collection ${name}:`, e);
    }
  }

  insert(collection, item) {
    const data = this.getCollection(collection);
    const newItem = {
      ...item,
      id: item.id || crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    data.push(newItem);
    this.setCollection(collection, data);

    // Sync to Supabase in background
    syncInsertSupabase(collection, newItem).catch(() => {});

    return newItem;
  }

  update(collection, id, updates) {
    const data = this.getCollection(collection);
    const index = data.findIndex(item => item.id === id);
    if (index === -1) return null;
    
    data[index] = {
      ...data[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.setCollection(collection, data);

    // Sync to Supabase in background
    syncUpdateSupabase(collection, id, updates).catch(() => {});

    return data[index];
  }

  delete(collection, id) {
    const data = this.getCollection(collection);
    const filteredData = data.filter(item => item.id !== id);
    if (data.length === filteredData.length) return false;
    
    this.setCollection(collection, filteredData);
    return true;
  }

  findById(collection, id) {
    const data = this.getCollection(collection);
    return data.find(item => item.id === id) || null;
  }

  findAll(collection, filter) {
    const data = this.getCollection(collection);
    if (!filter) return data;
    return data.filter(item => {
      for (let key in filter) {
        if (item[key] !== filter[key]) return false;
      }
      return true;
    });
  }

  query(collection, predicate) {
    const data = this.getCollection(collection);
    if (typeof predicate === 'function') return data.filter(predicate);
    if (predicate && typeof predicate === 'object') {
      return data.filter(item => Object.entries(predicate).every(([key, value]) => item[key] === value));
    }
    return data;
  }
}

export const db = new MockDatabase();

export function seedDatabase() {
  if (localStorage.getItem('58express_db_maracaibo') !== 'true') {
    localStorage.removeItem('58express_db_seeded');
    localStorage.setItem('58express_db_maracaibo', 'true');
  }

  if (localStorage.getItem('58express_db_seeded') === 'true') {
    return;
  }

  // Production Settings / Pricing config
  const settings = {
    id: 'pricing_config',
    minFare: 1.50,
    baseFare: 0.50,
    rateKm: 0.30,
    rateMin: 0.05,
    surge: 1.0,
    systemCommission: 0.15,
    bcvRate: 874.50
  };

  const seedAdmin = { 
    id: 'admin_1', 
    firstName: 'Admin', 
    lastName: 'Principal', 
    phone: '+584140000000', 
    email: 'admin@58express.com', 
    role: 'admin' 
  };

  db.setCollection('users', [seedAdmin]);
  db.setCollection('settings', [settings]);
  db.setCollection('trips', []);
  db.setCollection('transactions', []);

  localStorage.setItem('58express_db_seeded', 'true');
  console.log('[Database] Production database initialized.');
}
