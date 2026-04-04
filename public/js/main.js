let selectedPeople = new Set();
let draggedPersonGender = null;

// PWA Service Worker 註冊
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker 註冊成功', reg.scope))
            .catch(err => console.log('Service Worker 註冊失敗', err));
    });
}

// 初始化:載入資料並繪製介面
async function init() {
    try {
        await window.appDB.init();

        // Initialize Google Sync if available
        if (window.initGoogleSync) window.initGoogleSync();

        // 載入車輛數設定
        const vehicleCountData = await window.appDB.getSetting('vehicleCount');
        if (vehicleCountData.value) {
            document.getElementById('vehicleCount').value = vehicleCountData.value;
        }

        // 載入更新紀錄
        const updateNotesData = await window.appDB.getSetting('updateNotesList');
        if (updateNotesData && updateNotesData.value) {
            updateNotesList = JSON.parse(updateNotesData.value);
        }
        renderUpdateNotes();

        // 載入鎖定狀態
        const locks = await window.appDB.getLocks();
        const lockMap = {};
        locks.forEach(lock => {
            lockMap[lock.vehicle_id] = lock.is_locked;
        });

        // 載入車主資訊
        const ownersData = await window.appDB.getSetting('vehicleOwners');
        const ownerMap = ownersData.value ? JSON.parse(ownersData.value) : {};

        // 載入人員資料與分配結果
        const data = await window.appDB.getPassengersAndAssignments();
        
        // 1. 繪製車輛框架
        renderVehicleFramework(lockMap, ownerMap);

        // 2. 清空名單顯示區
        document.getElementById('maleList').innerHTML = '<h4>👨 乾道名單 (待分配)</h4>';
        document.getElementById('femaleList').innerHTML = '<h4>👩 坤道名單 (待分配)</h4>';

        // 3. 分配人員到對應位置
        data.forEach(p => {
            const el = createPersonElement(p.name, p.gender);

            if (p.vehicle_id) {
                const vehicle = document.getElementById(`vehicle-${p.vehicle_id}`);
                if (vehicle) {
                    const seats = vehicle.querySelectorAll('.seat');
                    if (seats[p.seat_index]) {
                        seats[p.seat_index].innerHTML = '';
                        seats[p.seat_index].appendChild(el);
                    }
                }
            } else {
                document.getElementById(`${p.gender}List`).appendChild(el);
            }
        });
    } catch (err) {
        console.error(err);
        alert("資料庫載入失敗");
    }
}

// 建立人員 DOM 元件
function createPersonElement(name, gender) {
    const el = document.createElement('div');
    el.className = `draggable ${gender}`;
    el.textContent = name;
    el.draggable = true;
    el.id = "person-" + name;
    el.dataset.gender = gender;
    
    // 點擊選取/取消選取
    el.onclick = (e) => {
        e.stopPropagation();
        const isInLocked = e.target.closest('.vehicle')?.classList.contains('locked');
        if (isInLocked) return;
        
        if (selectedPeople.has(name)) {
            selectedPeople.delete(name);
            el.classList.remove('selected');
        } else {
            selectedPeople.add(name);
            el.classList.add('selected');
        }
    };
    
    el.ondragstart = (e) => {
        const isLocked = e.target.closest('.vehicle')?.classList.contains('locked');
        if (isLocked) {
            e.preventDefault();
            return;
        }
        draggedPersonGender = gender;
        e.dataTransfer.setData('text/plain', name);
    };
    
    // 檢查是否在鎖定車輛內
    setTimeout(() => {
        const isInLocked = el.closest('.vehicle')?.classList.contains('locked');
        if (isInLocked) {
            el.classList.add('in-locked-vehicle');
            el.draggable = false;
        }
    }, 0);
    
    return el;
}

// 繪製車輛 HTML 結構
function renderVehicleFramework(lockMap = {}, ownerMap = {}) {
    const container = document.getElementById('vehicle-container');
    container.innerHTML = '';
    const count = document.getElementById('vehicleCount').value;

    for (let i = 1; i <= count; i++) {
        const v = document.createElement('div');
        v.className = 'vehicle';
        v.id = `vehicle-${i}`;
        
        if (lockMap[i]) {
            v.classList.add('locked');
        }
        
        const lockIcon = lockMap[i] ? '🔒' : '🔓';
        const ownerName = ownerMap[i] || '';
        
        v.innerHTML = `
            <div class="vehicle-header">
                <div class="vehicle-title-row">
                    <strong>🚐 第 ${i} 車</strong>
                    <div>
                        <button class="reset-vehicle-btn" onclick="resetVehicle(${i})" style="background: none; border: 1px solid #ddd; font-size: 18px; padding: 5px 10px; border-radius: 50%; cursor: pointer; color: #ff9800; margin-right: 5px;" title="重置該車輛">🔄</button>
                        <button class="lock-btn" onclick="toggleLock(${i})">${lockIcon}</button>
                    </div>
                </div>
                <input type="text" class="vehicle-owner-input" 
                       placeholder="輸入車主姓名" 
                       value="${ownerName}"
                       onchange="saveVehicleOwner(${i}, this.value)">
            </div>
            <div class="seat-container"></div>
        `;
        const sc = v.querySelector('.seat-container');
        for (let j = 0; j < 8; j++) {
            const s = document.createElement('div');
            s.className = 'seat';
            s.innerText = "空位";
            s.ondragover = e => e.preventDefault();
            s.ondrop = (e) => handleSeatDrop(e, i, j);
            sc.appendChild(s);
        }
        container.appendChild(v);
    }
}

// 儲存車輛數
async function saveVehicleCount() {
    const count = document.getElementById('vehicleCount').value;
    await window.appDB.saveSetting('vehicleCount', count);
    init();
}

// 儲存車主資訊
async function saveVehicleOwner(vehicleId, ownerName) {
    const data = await window.appDB.getSetting('vehicleOwners');
    const ownerMap = data.value ? JSON.parse(data.value) : {};
    
    ownerMap[vehicleId] = ownerName;
    await window.appDB.saveSetting('vehicleOwners', JSON.stringify(ownerMap));
}

function allowDrop(e) {
    e.preventDefault();
}

// 新增人員到資料庫
async function addPerson(gender) {
    const name = document.getElementById('nameInput').value.trim();
    if (!name) return;
    await window.appDB.addPassenger(name, gender);
    document.getElementById('nameInput').value = '';
    init();
}

// 處理:掉進座位
async function handleSeatDrop(e, vId, sIdx) {
    e.preventDefault();
    const vehicle = document.getElementById(`vehicle-${vId}`);
    if (vehicle.classList.contains('locked')) return;

    const targetSeat = e.target.closest('.seat');
    if (targetSeat && targetSeat.children.length === 0) {
        const name = e.dataTransfer.getData('text/plain');
        if (!name) return;

        await window.appDB.saveAssignment(name, vId, sIdx);
        init();
    }
}

// 處理:掉在空白處視同「移除安排」
async function dropToVoid(e) {
    if (e.target.closest('.seat') || e.target.closest('.list')) return;
    
    const name = e.dataTransfer.getData('text/plain');
    if (name) {
        await window.appDB.removeAssignment(name);
        draggedPersonGender = null;
        init();
    }
}

// 處理:掉進名單區
async function dropToList(e, targetGender) {
    e.preventDefault();
    const name = e.dataTransfer.getData('text/plain');
    if (name) {
        await window.appDB.removeAssignment(name);
        
        if (draggedPersonGender && draggedPersonGender !== targetGender) {
            await window.appDB.updatePassengerGender(name, targetGender);
        }
        
        draggedPersonGender = null;
        init();
    }
}

// 刪除選取的人員
async function deleteSelected() {
    if (selectedPeople.size === 0) {
        alert('請先選取要刪除的人員');
        return;
    }
    
    const names = Array.from(selectedPeople).join('、');
    if (confirm(`確定要將以下人員從資料庫永久刪除嗎?\n\n${names}`)) {
        for (const name of selectedPeople) {
            await window.appDB.deletePassenger(name);
        }
        selectedPeople.clear();
        init();
    }
}

// 清除所有人員（包含名單列中，但忽略已鎖定車輛內的人員）
async function clearAllPersons() {
    const data = await window.appDB.getPassengersAndAssignments();
    
    // 找出所有未被鎖定的人員
    const locks = await window.appDB.getLocks();
    const lockMap = {};
    locks.forEach(lock => {
        lockMap[lock.vehicle_id] = lock.is_locked;
    });

    const peopleToDelete = data.filter(p => !p.vehicle_id || !lockMap[p.vehicle_id]);

    if (peopleToDelete.length === 0) {
        alert('沒有可以清除的人員（目前所有人員皆在已鎖定的車輛內）。');
        return;
    }

    if (confirm(`確定要將這 ${peopleToDelete.length} 位人員(包含名單列及未鎖定車位的人員)從系統永久刪除嗎？`)) {
        for (const p of peopleToDelete) {
            await window.appDB.deletePassenger(p.name);
            selectedPeople.delete(p.name);
        }
        
        if (confirm('是否要連同【未鎖定車輛】的「車主姓名」也一併清除？')) {
            const ownersData = await window.appDB.getSetting('vehicleOwners');
            if (ownersData && ownersData.value) {
                const ownerMap = JSON.parse(ownersData.value);
                let ownerUpdated = false;
                for (const vId in ownerMap) {
                    if (!lockMap[vId]) { // 中略已鎖定車輛的車主
                        delete ownerMap[vId];
                        ownerUpdated = true;
                    }
                }
                if (ownerUpdated) {
                    await window.appDB.saveSetting('vehicleOwners', JSON.stringify(ownerMap));
                }
            }
        }
        
        init();
    }
}

// 重置該車輛的所有人員
async function resetVehicle(vehicleId) {
    const data = await window.appDB.getPassengersAndAssignments();
    const passengersInCar = data.filter(p => p.vehicle_id == vehicleId);

    if (passengersInCar.length === 0) {
        alert('此車輛目前沒有人員可以重置');
        return;
    }

    if (confirm(`確定要重新分配第 ${vehicleId} 車的 ${passengersInCar.length} 位人員嗎？ (將回到待分配名單)`)) {
        for (const p of passengersInCar) {
            await window.appDB.removeAssignment(p.name);
            selectedPeople.delete(p.name);
        }
        init();
    }
}

// 鎖定切換
async function toggleLock(id) {
    const v = document.getElementById(`vehicle-${id}`);
    const btn = v.querySelector('.lock-btn');
    const isLocked = v.classList.toggle('locked');
    btn.innerText = isLocked ? '🔒' : '🔓';
    
    await window.appDB.saveLock(id, isLocked ? 1 : 0);
}

// 匯入 Excel 功能
async function importExcel(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

            let importCount = 0;
            
            for (let i = 0; i < jsonData.length; i++) {
                const row = jsonData[i];
                if (i === 0 && (row[0] === '乾道' || row[0] === '姓名')) continue;
                
                if (row[0] && row[0].toString().trim()) {
                    const name = row[0].toString().trim();
                    try { await window.appDB.addPassenger(name, 'male'); importCount++; } catch(e){}
                }
                
                if (row[1] && row[1].toString().trim()) {
                    const name = row[1].toString().trim();
                    try { await window.appDB.addPassenger(name, 'female'); importCount++; } catch(e){}
                }
            }

            alert(`✅ 成功匯入人員！`);
            event.target.value = '';
            init();
        } catch (err) {
            console.error(err);
            alert('❌ Excel 匯入失敗！');
        }
    };
    reader.readAsArrayBuffer(file);
}

// 匯出 Excel 功能
async function exportExcel() {
    try {
        const data = await window.appDB.getPassengersAndAssignments();
        const ownersData = await window.appDB.getSetting('vehicleOwners');
        const ownerMap = ownersData.value ? JSON.parse(ownersData.value) : {};

        const ws_data = [['姓名', '性別', '車輛', '座位', '車主']];

        data.forEach(p => {
            const gender = p.gender === 'male' ? '乾道' : '坤道';
            const vehicle = p.vehicle_id ? `第 ${p.vehicle_id} 車` : '未分配';
            const seat = p.vehicle_id ? `座位 ${p.seat_index + 1}` : '-';
            const owner = p.vehicle_id ? (ownerMap[p.vehicle_id] || '-') : '-';
            
            ws_data.push([p.name, gender, vehicle, seat, owner]);
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(ws_data);
        
        ws['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 10 }, { wch: 12 }];
        
        XLSX.utils.book_append_sheet(wb, ws, '車輛安排');
        
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        XLSX.writeFile(wb, `車輛安排_${date}.xlsx`);
        
        alert('✅ Excel 匯出成功！');
    } catch (err) {
        console.error(err);
        alert('❌ Excel 匯出失敗');
    }
}

// 匯出 PNG 功能
async function exportPNG() {
    try {
        const selected = document.querySelectorAll('.draggable.selected');
        selected.forEach(el => el.classList.remove('selected'));

        await new Promise(resolve => setTimeout(resolve, 100));

        const endElement = document.getElementById('vehicle-container');
        const tempContainer = document.createElement('div');
        tempContainer.style.cssText = 'background: #f4f7f9; padding: 20px; width: 1200px; max-width: 1200px; box-sizing: border-box; margin: 0 auto; overflow: visible; font-family: sans-serif; display: flex; flex-direction: column; align-items: center;';
        
        tempContainer.appendChild(endElement.cloneNode(true));
        document.body.appendChild(tempContainer);

        const canvas = await html2canvas(tempContainer, {
            scale: 2,
            backgroundColor: '#f4f7f9',
            logging: false,
            useCORS: true
        });

        document.body.removeChild(tempContainer);
        selected.forEach(el => el.classList.add('selected'));

        const imgData = canvas.toDataURL('image/png');
        
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const link = document.createElement('a');
        link.download = `車位安排圖_${date}.png`;
        link.href = imgData;
        link.click();
        
        alert('✅ PNG 圖片匯出成功！');
    } catch (err) {
        console.error(err);
        alert('❌ PNG 匯出失敗');
    }
}

// 側邊欄切換
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const body = document.body;
    sidebar.classList.toggle('open');
    body.classList.toggle('sidebar-open');
}

let updateNotesList = [];

function renderUpdateNotes() {
    const listDiv = document.getElementById('notes-list');
    listDiv.innerHTML = '';
    
    if (updateNotesList.length === 0) {
        listDiv.innerHTML = '<div style="color: #999; font-size: 13px; text-align: center; padding: 10px;">目前尚無任何更新公告</div>';
        return;
    }

    updateNotesList.forEach(note => {
        const item = document.createElement('div');
        item.style.cssText = 'background: #fdfdfd; padding: 10px; border-radius: 5px; border: 1px solid #e0e0e0;';
        item.innerHTML = `
            <div style="font-size: 12px; color: #888; margin-bottom: 5px;">📅 ${note.date}</div>
            <div style="white-space: pre-wrap; font-size: 14px; color: #333; margin-bottom: 10px;">${note.text}</div>
            <div style="display: flex; gap: 5px; justify-content: flex-end;">
                <button onclick="editNote(${note.id})" style="background: #2196f3; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;">✏️ 編輯</button>
                <button onclick="deleteNote(${note.id})" style="background: #ef5350; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;">🗑️ 刪除</button>
            </div>
        `;
        listDiv.appendChild(item);
    });
}

// 更新日誌 發佈
async function publishUpdateNotes() {
    const textarea = document.getElementById('update-notes-area');
    const text = textarea.value.trim();
    if (!text) return;

    const editId = document.getElementById('editing-note-id').value;
    
    if (editId) {
        // 編輯模式
        const note = updateNotesList.find(n => n.id == editId);
        if (note) {
            note.text = text;
        }
        document.getElementById('editing-note-id').value = '';
        document.getElementById('cancel-edit-btn').style.display = 'none';
    } else {
        // 新增模式
        const now = new Date();
        const dateStr = now.toLocaleString('zh-TW', { hour12: false });
        updateNotesList.unshift({
            id: Date.now(),
            text: text,
            date: dateStr
        });
    }

    await window.appDB.saveSetting('updateNotesList', JSON.stringify(updateNotesList));
    textarea.value = '';
    renderUpdateNotes();
}

function editNote(id) {
    const note = updateNotesList.find(n => n.id == id);
    if (note) {
        document.getElementById('update-notes-area').value = note.text;
        document.getElementById('editing-note-id').value = note.id;
        document.getElementById('cancel-edit-btn').style.display = 'block';
    }
}

function cancelEditNote() {
    document.getElementById('update-notes-area').value = '';
    document.getElementById('editing-note-id').value = '';
    document.getElementById('cancel-edit-btn').style.display = 'none';
}

async function deleteNote(id) {
    if (confirm('確定要刪除這則貼文嗎？')) {
        updateNotesList = updateNotesList.filter(n => n.id != id);
        await window.appDB.saveSetting('updateNotesList', JSON.stringify(updateNotesList));
        renderUpdateNotes();
    }
}

// 進度儲存 - 匯出
async function exportJSONBackup() {
    try {
        const dbData = await window.appDB.exportData();
        const jsonStr = JSON.stringify(dbData, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const link = document.createElement('a');
        link.download = `車位安排進度_${date}.json`;
        link.href = url;
        link.click();
        
        URL.revokeObjectURL(url);
    } catch (e) {
        alert('❌ 匯出失敗');
        console.error(e);
    }
}

// 進度儲存 - 匯入
async function importJSONBackup(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = JSON.parse(e.target.result);
            await window.appDB.importData(data);
            alert('✅ 成功匯入進度！');
            // 直接重新渲染
            location.reload();
        } catch (err) {
            console.error(err);
            alert('❌ 匯入失敗！請確認檔案格式是否正確。');
        }
    };
    reader.readAsText(file);
    event.target.value = ''; // 清空檔案選擇
}

// 供外部綁定事件
window.toggleSidebar = toggleSidebar;
window.publishUpdateNotes = publishUpdateNotes;
window.editNote = editNote;
window.cancelEditNote = cancelEditNote;
window.deleteNote = deleteNote;
window.exportPNG = exportPNG;
window.exportJSONBackup = exportJSONBackup;
window.importJSONBackup = importJSONBackup;
window.resetVehicle = resetVehicle;

// 頁面開啟時啟動
window.onload = init;
