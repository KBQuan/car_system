// js/sync-manager.js - 處理 Supabase 與本地 IndexedDB 的即時同步

class SyncManager {
    constructor() {
        this.currentRoom = null;
        this.supabase = null;
        this.isSyncing = false; // 防止循環同步
    }

    async init() {
        this.supabase = window.getSupabase();
        // 檢查 URL 是否有房間 ID
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
            console.error("Supabase 未配置，無法開啟協作模式");
            return;
        }

        this.currentRoom = roomId;
        console.log(`[Sync] 加入房間: ${this.currentRoom}`);

        // 1. 更新 UI 狀態
        document.getElementById('roomStatus').style.display = 'block';
        document.getElementById('activeRoomId').textContent = this.currentRoom;

        // 2. 從遠端撈取最新資料並覆寫本地
        await this.pullFromRemote();

        // 3. 開啟即時監聽
        this.subscribeToChanges();

        // 4. 更新網址列
        const url = new URL(window.location);
        url.searchParams.set('room', this.currentRoom);
        window.history.pushState({}, '', url);

        // 5. 觸發介面初始化
        if (window.init) window.init();
    }

    async pullFromRemote() {
        if (!this.currentRoom || !this.supabase) return;
        
        try {
            const [
                { data: passengers },
                { data: assignments },
                { data: settings },
                { data: locks }
            ] = await Promise.all([
                this.supabase.from('passengers').select('*').eq('room_id', this.currentRoom),
                this.supabase.from('assignments').select('*').eq('room_id', this.currentRoom),
                this.supabase.from('settings').select('*').eq('room_id', this.currentRoom),
                this.supabase.from('locks').select('*').eq('room_id', this.currentRoom)
            ]);

            // 格式轉換並導入本地 DB
            await window.appDB.importData({
                passengers: passengers || [],
                assignments: assignments || [],
                settings: settings || [],
                locks: locks || []
            });
        } catch (err) {
            console.error("[Sync] 下載資料失敗:", err);
        }
    }

    subscribeToChanges() {
        const tables = ['passengers', 'assignments', 'settings', 'locks'];
        
        tables.forEach(table => {
            this.supabase
                .channel(`room-${this.currentRoom}-${table}`)
                .on('postgres_changes', 
                    { event: '*', schema: 'public', table: table, filter: `room_id=eq.${this.currentRoom}` }, 
                    (payload) => {
                        console.log(`[Sync] 收到 ${table} 變動:`, payload);
                        this.handleRemoteChange(table, payload);
                    }
                )
                .subscribe();
        });
    }

    async handleRemoteChange(table, payload) {
        if (this.isSyncing) return;

        const { eventType, new: newRow, old: oldRow } = payload;
        
        // 更新本地 IndexedDB
        // 為了避免複雜的狀態比對，這裡直接根據事件執行對應的 db 操作
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

            // 重新渲染畫面
            if (window.init) window.init();
        } catch (err) {
            console.error("[Sync] 本地更新失敗:", err);
        }
    }

    async pushChange(table, action, data) {
        if (!this.currentRoom || !this.supabase || this.isSyncing) return;

        this.isSyncing = true;
        try {
            if (action === 'put') {
                const payload = { ...data, room_id: this.currentRoom };
                await this.supabase.from(table).upsert(payload);
            } else if (action === 'delete') {
                const key = table === 'locks' ? 'vehicle_id' : (table === 'settings' ? 'key' : 'name');
                await this.supabase.from(table).delete().eq(key, data).eq('room_id', this.currentRoom);
            } else if (action === 'clear') {
                await this.supabase.from(table).delete().eq('room_id', this.currentRoom);
            }
        } catch (err) {
            console.warn("[Sync] 資料上傳失敗 (可能尚未建立表格或權限問題):", err);
        } finally {
            this.isSyncing = false;
        }
    }

    async leaveRoom() {
        if (!this.currentRoom) return;

        console.log(`[Sync] 退出房間: ${this.currentRoom}`);

        // 1. 斷開所有即時連線頻道
        if (this.supabase) {
            this.supabase.removeAllChannels();
        }

        // 2. 清除狀態
        this.currentRoom = null;

        // 3. 更新 UI
        document.getElementById('roomStatus').style.display = 'none';
        document.getElementById('roomIdInput').value = '';

        // 4. 清除 URL 參數
        const url = new URL(window.location);
        url.searchParams.delete('room');
        window.history.pushState({}, '', url);

        alert('已退出同步模式，切換回本地儲存。');
    }
}

window.syncManager = new SyncManager();

// 全局綁定
window.joinRoom = () => {
    const roomId = document.getElementById('roomIdInput').value.trim();
    if (confirm(`加入房間「${roomId}」將會覆蓋您目前的本地資料，是否繼續？`)) {
        window.syncManager.joinRoom(roomId);
    }
};

window.leaveRoom = () => {
    window.syncManager.leaveRoom();
};
