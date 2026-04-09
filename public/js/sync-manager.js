// js/sync-manager.js - 處理 Supabase 與本地 IndexedDB 的即時同步 (修復版)

class SyncManager {
    constructor() {
        this.currentRoom = null;
        this.supabase = null;
        this.isSyncing = false;
        this.started = false; 
    }

    async init() {
        this.supabase = window.getSupabase();
        const params = new URLSearchParams(window.location.search);
        const roomId = params.get('room');
        if (roomId) {
            document.getElementById('roomIdInput').value = roomId;
            await this.joinRoom(roomId);
        }
    }

    async joinRoom(roomId) {
        if (!roomId) return;
        this.supabase = window.getSupabase();
        if (!this.supabase) {
            console.error("[Sync] Supabase 客戶端未建立");
            return;
        }

        try {
            console.log(`[Sync] 正在連接至房間: ${roomId}`);
            
            // 1. 確保房間已存在 (雲端自動註冊)
            const { error: roomError } = await this.supabase
                .from('rooms')
                .upsert({ id: roomId, name: roomId }, { onConflict: 'id' });
            
            if (roomError) throw roomError;

            this.currentRoom = roomId;

            // 2. 更新 UI
            document.getElementById('roomStatus').style.display = 'block';
            document.getElementById('activeRoomId').textContent = this.currentRoom;

            // 3. 從遠端撈取完整資料並同步到本地
            await this.pullFromRemote();

            // 4. 開啟各資料表的即時監聽
            this.subscribeToChanges();

            // 5. 更新網址列
            const url = new URL(window.location);
            url.searchParams.set('room', this.currentRoom);
            window.history.pushState({}, '', url);

            // 6. 重新初始化介面
            if (window.init) window.init();
            
            console.log(`[Sync] 成功進入房間: ${this.currentRoom}`);
        } catch (err) {
            console.error("[Sync] 加入房間失敗:", err);
            alert("同步連線失敗，請檢查 API Key 或網路狀態");
        }
    }

    async pullFromRemote() {
        if (!this.currentRoom || !this.supabase) return;
        
        try {
            const [
                { data: p }, 
                { data: a }, 
                { data: s }, 
                { data: l }
            ] = await Promise.all([
                this.supabase.from('passengers').select('*').eq('room_id', this.currentRoom),
                this.supabase.from('assignments').select('*').eq('room_id', this.currentRoom),
                this.supabase.from('settings').select('*').eq('room_id', this.currentRoom),
                this.supabase.from('locks').select('*').eq('room_id', this.currentRoom)
            ]);

            await window.appDB.importData({
                passengers: p || [],
                assignments: a || [],
                settings: s || [],
                locks: l || []
            });
        } catch (err) {
            console.error("[Sync] 初始同步下載失敗:", err);
        }
    }

    subscribeToChanges() {
        if (!this.supabase || !this.currentRoom) return;

        // 清除舊頻道
        this.supabase.removeAllChannels();

        const tables = ['passengers', 'assignments', 'settings', 'locks'];
        tables.forEach(table => {
            this.supabase
                .channel(`public:${table}:${this.currentRoom}`)
                .on('postgres_changes', 
                    { event: '*', schema: 'public', table: table, filter: `room_id=eq.${this.currentRoom}` }, 
                    (payload) => {
                        console.debug(`[Sync] 收到遠端變動 (${table}):`, payload);
                        this.handleRemoteChange(table, payload);
                    }
                )
                .subscribe();
        });
    }

    async handleRemoteChange(table, payload) {
        if (this.isSyncing) return;

        const { eventType, new: newRow, old: oldRow } = payload;
        
        try {
            if (eventType === 'INSERT' || eventType === 'UPDATE') {
                if (table === 'passengers') await window.appDB._put('passengers', { name: newRow.name, gender: newRow.gender });
                if (table === 'assignments') await window.appDB._put('assignments', { name: newRow.name, vehicle_id: newRow.vehicle_id, seat_index: newRow.seat_index });
                if (table === 'settings') await window.appDB._put('settings', { key: newRow.key, value: newRow.value });
                if (table === 'locks') await window.appDB._put('locks', { vehicle_id: newRow.vehicle_id, is_locked: newRow.is_locked });
            } else if (eventType === 'DELETE') {
                const key = table === 'locks' ? 'vehicle_id' : (table === 'settings' ? 'key' : 'name');
                await window.appDB._delete(table, oldRow[key]);
            }
            if (window.init) window.init();
        } catch (err) {
            console.error("[Sync] 本地 DB 更新失敗:", err);
        }
    }

    async pushChange(table, action, data) {
        if (!this.currentRoom || !this.supabase || this.isSyncing) return;

        this.isSyncing = true;
        try {
            if (action === 'put') {
                const payload = { ...data, room_id: this.currentRoom };
                const { error } = await this.supabase.from(table).upsert(payload);
                if (error) throw error;
            } else if (action === 'delete') {
                const keyField = table === 'locks' ? 'vehicle_id' : (table === 'settings' ? 'key' : 'name');
                const { error } = await this.supabase.from(table).delete().eq(keyField, data).eq('room_id', this.currentRoom);
                if (error) throw error;
            } else if (action === 'clear') {
                const { error } = await this.supabase.from(table).delete().eq('room_id', this.currentRoom);
                if (error) throw error;
            }
        } catch (err) {
            console.warn(`[Sync] 雲端同步失敗 (${table}):`, err);
        } finally {
            this.isSyncing = false;
        }
    }

    async leaveRoom() {
        if (!this.currentRoom) return;
        if (this.supabase) this.supabase.removeAllChannels();
        this.currentRoom = null;
        document.getElementById('roomStatus').style.display = 'none';
        document.getElementById('roomIdInput').value = '';
        const url = new URL(window.location);
        url.searchParams.delete('room');
        window.history.pushState({}, '', url);
        alert('已退出同步模式，切換回本地儲存。');
    }
}

window.syncManager = new SyncManager();

window.joinRoom = () => {
    const roomId = document.getElementById('roomIdInput').value.trim();
    if (!roomId) return;
    if (confirm(`加入房間「${roomId}」將會覆蓋您目前的本地資料，是否繼續？`)) {
        window.syncManager.joinRoom(roomId);
    }
};

window.leaveRoom = () => {
    window.syncManager.leaveRoom();
};
