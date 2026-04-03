// db.js - IndexedDB 封裝
const DB_NAME = 'CarSystemDB';
const DB_VERSION = 1;

class AppDB {
    constructor() {
        this.db = null;
    }

    async init() {
        if (this.db) return;
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (event) => {
                console.error("IndexedDB error:", event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                // 1. 人員名單
                if (!db.objectStoreNames.contains('passengers')) {
                    db.createObjectStore('passengers', { keyPath: 'name' });
                }
                // 2. 座位安排
                if (!db.objectStoreNames.contains('assignments')) {
                    db.createObjectStore('assignments', { keyPath: 'name' });
                }
                // 3. 系統設定
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
                // 4. 車輛鎖定狀態
                if (!db.objectStoreNames.contains('locks')) {
                    db.createObjectStore('locks', { keyPath: 'vehicle_id' });
                }
            };
        });
    }

    async _getAll(storeName) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async _get(storeName, key) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async _put(storeName, data) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async _delete(storeName, key) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async _addIfNotExist(storeName, data) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const checkReq = store.get(data[store.keyPath]);
            checkReq.onsuccess = () => {
                if (!checkReq.result) {
                    const putReq = store.add(data);
                    putReq.onsuccess = () => resolve();
                    putReq.onerror = () => reject(putReq.error);
                } else {
                    resolve(); // 已存在，忽略
                }
            };
            checkReq.onerror = () => reject(checkReq.error);
        });
    }

    // --- 業務邏輯對應 ---

    async getPassengersAndAssignments() {
        const passengers = await this._getAll('passengers');
        const assignments = await this._getAll('assignments');
        
        const assignmentMap = {};
        assignments.forEach(a => {
            assignmentMap[a.name] = a;
        });

        return passengers.map(p => {
            const assign = assignmentMap[p.name];
            return {
                name: p.name,
                gender: p.gender,
                vehicle_id: assign ? assign.vehicle_id : null,
                seat_index: assign ? assign.seat_index : null
            };
        });
    }

    async addPassenger(name, gender) {
        await this._addIfNotExist('passengers', { name, gender });
    }

    async updatePassengerGender(name, gender) {
        // 如果跨性別拖曳，更新性別 (由 db.put 直接覆蓋)
        await this._put('passengers', { name, gender });
    }

    async saveAssignment(name, vehicle_id, seat_index) {
        await this._put('assignments', { name, vehicle_id, seat_index });
    }

    async removeAssignment(name) {
        await this._delete('assignments', name);
    }

    async deletePassenger(name) {
        await this._delete('passengers', name);
        await this._delete('assignments', name);
    }

    async getSetting(key) {
        const res = await this._get('settings', key);
        return res || {};
    }

    async saveSetting(key, value) {
        await this._put('settings', { key, value });
    }

    async getLocks() {
        return await this._getAll('locks');
    }

    async saveLock(vehicle_id, is_locked) {
        await this._put('locks', { vehicle_id, is_locked });
    }

    // --- 資料庫匯出與匯入 ---
    async exportData() {
        return {
            passengers: await this._getAll('passengers'),
            assignments: await this._getAll('assignments'),
            settings: await this._getAll('settings'),
            locks: await this._getAll('locks')
        };
    }

    async importData(data) {
        if (!data) return false;
        await this.init();
        
        return new Promise((resolve, reject) => {
            const stores = ['passengers', 'assignments', 'settings', 'locks'];
            const transaction = this.db.transaction(stores, 'readwrite');
            
            transaction.onerror = (e) => reject(e.target.error);
            transaction.oncomplete = () => resolve(true);

            stores.forEach(storeName => {
                const store = transaction.objectStore(storeName);
                store.clear(); // 清空舊資料
                if (data[storeName] && Array.isArray(data[storeName])) {
                    data[storeName].forEach(item => {
                        store.put(item);
                    });
                }
            });
        });
    }
}

// 實例化為全局對象
window.appDB = new AppDB();
