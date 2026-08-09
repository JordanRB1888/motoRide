import { socket } from './socketClient.js';

// Read-through UI cache. SQLite through the API is always the source of truth.
class ClientCache {
  constructor() {
    this.prefix = '58express_cache_';
  }

  getCollection(name) {
    try { return JSON.parse(localStorage.getItem(`${this.prefix}${name}`) || '[]'); }
    catch { return []; }
  }

  setCollection(name, data) {
    try {
      localStorage.setItem(`${this.prefix}${name}`, JSON.stringify(Array.isArray(data) ? data : []));
      socket.emit(`cache:${name}:updated`, data);
    } catch (error) {
      console.warn(`Unable to cache ${name}`, error);
    }
  }

  insert(collection, item) {
    const data = this.getCollection(collection);
    const next = { ...item, id: item.id || crypto.randomUUID(), createdAt: item.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    data.push(next);
    this.setCollection(collection, data);
    return next;
  }

  update(collection, id, updates) {
    const data = this.getCollection(collection);
    const index = data.findIndex(item => item.id === id);
    if (index < 0) return null;
    data[index] = { ...data[index], ...updates, updatedAt: new Date().toISOString() };
    this.setCollection(collection, data);
    return data[index];
  }

  delete(collection, id) {
    const data = this.getCollection(collection);
    const filtered = data.filter(item => item.id !== id);
    if (filtered.length === data.length) return false;
    this.setCollection(collection, filtered);
    return true;
  }

  findById(collection, id) {
    return this.getCollection(collection).find(item => item.id === id) || null;
  }

  findAll(collection, filter) {
    const data = this.getCollection(collection);
    if (!filter) return data;
    return data.filter(item => Object.entries(filter).every(([key, value]) => item[key] === value));
  }

  query(collection, predicate) {
    const data = this.getCollection(collection);
    if (typeof predicate === 'function') return data.filter(predicate);
    if (predicate && typeof predicate === 'object') return data.filter(item => Object.entries(predicate).every(([key, value]) => item[key] === value));
    return data;
  }
}

export const db = new ClientCache();

export function seedDatabase() {
  // Remove the legacy demonstration database; no domain data is created in the browser.
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('58express_db_')) localStorage.removeItem(key);
  }
}
