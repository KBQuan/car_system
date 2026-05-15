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

        // Initialize Supabase Sync if available
        if (window.syncManager && !window.syncManager.started) {
            window.syncManager.started = true;
            await window.syncManager.init();
            // 如果 syncManager 成功加入了房間，它會自己再呼叫一次 init()
            // 如果沒加入房間（沒 room 參數），則繼續執行下方的本地加載
            if (window.syncManager.currentRoom) return;
        }

        // 載入車輛數設定
        const vehicleCountData = await window.appDB.getSetting('vehicleCount');
        if (vehicleCountData.value) {
            document.getElementById('vehicleCount').value = vehicleCountData.value;
        }

        await loadUserSettings();
        await loadSystemConfig(); // 載入系統動態設定 (版本、說明書、房間預設)

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
        const maleCount = data.filter(p => p.gender === 'male' && !p.vehicle_id).length;
        const femaleCount = data.filter(p => p.gender === 'female' && !p.vehicle_id).length;

        document.getElementById('maleList').innerHTML = `<h4 style="display: flex; align-items: center; gap: 8px; width: 100%;"><i data-lucide="user"></i> 乾道名單 <span class="count-badge">${maleCount}</span></h4>`;
        document.getElementById('femaleList').innerHTML = `<h4 style="display: flex; align-items: center; gap: 8px; width: 100%;"><i data-lucide="user"></i> 坤道名單 <span class="count-badge">${femaleCount}</span></h4>`;


        // 3. 分配人員到對應位置
        data.forEach(p => {
            let gender = p.gender;
            if (!gender || (gender !== 'male' && gender !== 'female')) {
                gender = 'male'; // 預設防呆
            }
            const el = createPersonElement(p.name, gender);

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
        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (err) {

        console.error("初始化失敗:", err);
        alert("資料庫載入失敗！\n錯誤資訊: " + (err.message || err));
    }
}

// 建立人員 DOM 元件
function createPersonElement(name, gender) {
    const el = document.createElement('div');
    el.className = `draggable ${gender} glow-border`;
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

    const vehicleIds = [];
    for (let i = 1; i <= count; i++) {
        vehicleIds.push(i);
    }
    vehicleIds.sort((a, b) => {
        const aLocked = !!lockMap[a];
        const bLocked = !!lockMap[b];
        if (aLocked === bLocked) return a - b;
        return aLocked ? 1 : -1;
    });

    for (const i of vehicleIds) {
        const v = document.createElement('div');
        v.className = 'vehicle glow-border';
        v.id = `vehicle-${i}`;

        if (lockMap[i]) {
            v.classList.add('locked');
        }

        const lockIcon = lockMap[i] ? 'lock' : 'unlock';
        const ownerName = ownerMap[i] || '';

        v.innerHTML = `
            <div class="vehicle-header">
                <div class="vehicle-title-row">
                    <strong style="display: flex; align-items: center; gap: 8px;">
                        <i data-lucide="truck" style="width: 18px; height: 18px;"></i> 第 ${i} 車
                    </strong>
                    <div style="display: flex; gap: 5px;">
                        <button class="reset-vehicle-btn" onclick="resetVehicle(${i})" style="background: none; border: 1px solid #ddd; width: 32px; height: 32px; padding: 0; border-radius: 50%; cursor: pointer; color: #ff9800; display: flex; align-items: center; justify-content: center;" title="重置該車輛">
                            <i data-lucide="refresh-cw" style="width: 16px; height: 16px;"></i>
                        </button>
                        <button class="lock-btn" onclick="toggleLock(${i})" style="width: 32px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center;">
                            <i data-lucide="${lockIcon}" style="width: 16px; height: 16px;"></i>
                        </button>
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
    if (typeof lucide !== 'undefined') lucide.createIcons();
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
        if (window.syncManager) window.syncManager.isBulkOperating = true;

        for (const name of selectedPeople) {
            await window.appDB.deletePassenger(name);
        }

        if (window.syncManager && window.syncManager.currentRoom) {
            await window.syncManager.pushFullState();
        } else if (window.syncManager) {
            window.syncManager.isBulkOperating = false;
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
        if (window.syncManager) window.syncManager.isBulkOperating = true;

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

        if (window.syncManager && window.syncManager.currentRoom) {
            await window.syncManager.pushFullState();
        } else if (window.syncManager) {
            window.syncManager.isBulkOperating = false;
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
        if (window.syncManager) window.syncManager.isBulkOperating = true;

        for (const p of passengersInCar) {
            await window.appDB.removeAssignment(p.name);
            selectedPeople.delete(p.name);
        }

        if (window.syncManager && window.syncManager.currentRoom) {
            await window.syncManager.pushFullState();
        } else if (window.syncManager) {
            window.syncManager.isBulkOperating = false;
        }

        init();
    }
}

// 鎖定切換
async function toggleLock(id) {
    const v = document.getElementById(`vehicle-${id}`);
    const btn = v.querySelector('.lock-btn');
    const isLocked = v.classList.toggle('locked');

    btn.innerHTML = `<i data-lucide="${isLocked ? 'lock' : 'unlock'}" style="width: 16px; height: 16px;"></i>`;
    if (typeof lucide !== 'undefined') lucide.createIcons();


    await window.appDB.saveLock(id, isLocked ? 1 : 0);

    // 將車輛依鎖定狀態與編號重新排序，鎖定的車輛移至最後
    const container = document.getElementById('vehicle-container');
    const vehicles = Array.from(container.children);
    vehicles.sort((a, b) => {
        const aLocked = a.classList.contains('locked');
        const bLocked = b.classList.contains('locked');
        const aId = parseInt(a.id.replace('vehicle-', ''));
        const bId = parseInt(b.id.replace('vehicle-', ''));

        if (aLocked === bLocked) {
            return aId - bId;
        }
        return aLocked ? 1 : -1;
    });

    vehicles.forEach(veh => container.appendChild(veh));

    // 確保同步到雲端
    if (window.syncManager) {
        await window.syncManager.pushChange('locks', 'put', { vehicle_id: id, is_locked: isLocked ? 1 : 0 });
    }
}


// 匯入 Excel 功能
async function importExcel(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

            let importCount = 0;

            // 開啟大量匯入防護鎖
            if (window.syncManager) window.syncManager.isBulkOperating = true;

            for (let i = 0; i < jsonData.length; i++) {
                const row = jsonData[i];
                if (i === 0 && (row[0] === '乾道' || row[0] === '姓名')) continue;

                if (row[0] && row[0].toString().trim()) {
                    const name = row[0].toString().trim();
                    try { await window.appDB.addPassenger(name, 'male'); importCount++; } catch (e) { }
                }

                if (row[1] && row[1].toString().trim()) {
                    const name = row[1].toString().trim();
                    try { await window.appDB.addPassenger(name, 'female'); importCount++; } catch (e) { }
                }
            }

            // 完成匯入後，推送完整狀態覆蓋雲端房間，並解開防護鎖
            if (window.syncManager && window.syncManager.currentRoom) {
                await window.syncManager.pushFullState();
            } else if (window.syncManager) {
                window.syncManager.isBulkOperating = false;
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
    reader.onload = async function (e) {
        try {
            const data = JSON.parse(e.target.result);

            if (window.syncManager) window.syncManager.isBulkOperating = true;

            await window.appDB.importData(data);

            if (window.syncManager && window.syncManager.currentRoom) {
                await window.syncManager.pushFullState();
            } else if (window.syncManager) {
                window.syncManager.isBulkOperating = false;
            }

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
window.exportPNG = exportPNG;
window.exportJSONBackup = exportJSONBackup;
window.importJSONBackup = importJSONBackup;
window.resetVehicle = resetVehicle;
window.deleteSelected = deleteSelected;
window.clearAllPersons = clearAllPersons;
window.init = init;

// 邊框發光追蹤
window.addEventListener('mousemove', (e) => {
    // 如果全域停用發光，則不執行邏輯
    if (document.body.classList.contains('glow-disabled')) return;

    const glowElements = document.querySelectorAll('.glow-border');
    glowElements.forEach(el => {
        const rect = el.getBoundingClientRect();
        // 只有當滑鼠在元素附近一定範圍內才更新，提升效能
        const buffer = 150;
        if (e.clientX >= rect.left - buffer && e.clientX <= rect.right + buffer &&
            e.clientY >= rect.top - buffer && e.clientY <= rect.bottom + buffer) {
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            el.style.setProperty('--mouse-x', `${x}px`);
            el.style.setProperty('--mouse-y', `${y}px`);
        }
    });
});

// 使用者個人設定相關
async function loadUserSettings() {
    const settingsData = await window.appDB.getSetting('userGlowSettings');
    const settings = settingsData && settingsData.value ? JSON.parse(settingsData.value) : {
        color: '#808080',
        size: 150,
        opacity: 0.7,
        enabled: true
    };

    applyUserSettings(settings);
}

function applyUserSettings(settings) {
    const r = parseInt(settings.color.slice(1, 3), 16);
    const g = parseInt(settings.color.slice(3, 5), 16);
    const b = parseInt(settings.color.slice(5, 7), 16);

    const opacity = settings.opacity !== undefined ? settings.opacity : 0.7;
    const enabled = settings.enabled !== undefined ? settings.enabled : true;

    document.documentElement.style.setProperty('--glow-color', `rgba(${r}, ${g}, ${b}, ${opacity})`);
    document.documentElement.style.setProperty('--glow-size', `${settings.size}px`);

    // 處理全域啟用/停用
    if (enabled) {
        document.body.classList.remove('glow-disabled');
        const detailPanel = document.getElementById('glowSettingsDetail');
        if (detailPanel) detailPanel.style.opacity = "1";
        if (detailPanel) detailPanel.style.pointerEvents = "auto";
    } else {
        document.body.classList.add('glow-disabled');
        const detailPanel = document.getElementById('glowSettingsDetail');
        if (detailPanel) detailPanel.style.opacity = "0.5";
        if (detailPanel) detailPanel.style.pointerEvents = "none";
    }

    // 更新 UI 顯示
    const toggle = document.getElementById('glowEnabledToggle');
    if (toggle) toggle.checked = enabled;

    const picker = document.getElementById('glowColorPicker');
    if (picker) picker.value = settings.color;

    const colorDisplay = document.getElementById('colorValueDisplay');
    if (colorDisplay) colorDisplay.textContent = settings.color.toUpperCase();

    const opSlider = document.getElementById('glowOpacitySlider');
    if (opSlider) opSlider.value = opacity;

    const opDisplay = document.getElementById('opacityValueDisplay');
    if (opDisplay) opDisplay.textContent = `${Math.round(opacity * 100)}%`;

    const slider = document.getElementById('glowSizeSlider');
    if (slider) slider.value = settings.size;

    const sizeDisplay = document.getElementById('sizeValueDisplay');
    if (sizeDisplay) sizeDisplay.textContent = `${settings.size}px`;

    // 更新預設按鈕啟動狀態
    document.querySelectorAll('.preset-btn').forEach(btn => {
        const btnHex = btn.style.backgroundColor;
        // 簡單判斷背景色是否匹配 (Hex 轉 RGB 比較複雜，這裡先簡單處理)
        btn.classList.toggle('active', btn.title === settings.color);
    });
}

async function changeGlowColor(hex) {
    const settingsData = await window.appDB.getSetting('userGlowSettings');
    const settings = settingsData && settingsData.value ? JSON.parse(settingsData.value) : { color: '#808080', size: 150, opacity: 0.7, enabled: true };

    settings.color = hex;
    await window.appDB.saveSetting('userGlowSettings', JSON.stringify(settings));
    applyUserSettings(settings);
}

async function updateGlowSize(size) {
    const settingsData = await window.appDB.getSetting('userGlowSettings');
    const settings = settingsData && settingsData.value ? JSON.parse(settingsData.value) : { color: '#808080', size: 150, opacity: 0.7, enabled: true };

    settings.size = parseInt(size);
    await window.appDB.saveSetting('userGlowSettings', JSON.stringify(settings));
    applyUserSettings(settings);
}

async function updateGlowOpacity(opacity) {
    const settingsData = await window.appDB.getSetting('userGlowSettings');
    const settings = settingsData && settingsData.value ? JSON.parse(settingsData.value) : { color: '#808080', size: 150, opacity: 0.7, enabled: true };

    settings.opacity = parseFloat(opacity);
    await window.appDB.saveSetting('userGlowSettings', JSON.stringify(settings));
    applyUserSettings(settings);
}

async function toggleGlow(enabled) {
    const settingsData = await window.appDB.getSetting('userGlowSettings');
    const settings = settingsData && settingsData.value ? JSON.parse(settingsData.value) : { color: '#808080', size: 150, opacity: 0.7, enabled: true };

    settings.enabled = enabled;
    await window.appDB.saveSetting('userGlowSettings', JSON.stringify(settings));
    applyUserSettings(settings);
}

function previewGlow(e, el) {
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    el.style.setProperty('--mouse-x', `${x}px`);
    el.style.setProperty('--mouse-y', `${y}px`);
}

async function resetSettings() {
    const defaultSettings = { color: '#808080', size: 150, opacity: 0.7, enabled: true };
    await window.appDB.saveSetting('userGlowSettings', JSON.stringify(defaultSettings));
    applyUserSettings(defaultSettings);
}

window.changeGlowColor = changeGlowColor;
window.updateGlowSize = updateGlowSize;
window.updateGlowOpacity = updateGlowOpacity;
window.toggleGlow = toggleGlow;
window.previewGlow = previewGlow;
window.resetSettings = resetSettings;

// --- 管理者權限控管 ---

/**
 * 檢查目前是否具備管理者權限 (從 URL 參數或來源頁面判斷)
 */
function checkAdminStatus() {
    const urlParams = new URLSearchParams(window.location.search);
    const isAdmin = urlParams.get('admin') === 'true';

    if (isAdmin) {
        document.body.classList.add('admin-mode');
        // 顯示所有管理者專用元素
        document.querySelectorAll('.admin-only').forEach(el => {
            el.style.display = 'block';
        });

        // 調整登入/登出按鈕顯示
        const loginLink = document.getElementById('adminLoginLink');
        const logoutBtn = document.getElementById('adminLogoutBtn');
        if (loginLink) {
            loginLink.style.display = 'none';
        }
        if (logoutBtn) {
            logoutBtn.style.display = 'flex';
            logoutBtn.style.alignItems = 'center';
            logoutBtn.style.justifyContent = 'center';
            logoutBtn.style.gap = '8px';
            logoutBtn.innerHTML = '<i data-lucide="unlock" style="width: 18px; height: 18px;"></i> 登出管理模式';
        }
        if (typeof lucide !== 'undefined') lucide.createIcons();


        console.log("Lucide: 目前處於管理者模式");

    }
}

/**
 * 登出管理者模式
 */
function logoutAdmin() {
    if (confirm("確定要登出管理模式並返回一般檢視嗎？")) {
        // 移除 URL 中的 admin 參數並重新整理
        const url = new URL(window.location.href);
        url.searchParams.delete('admin');
        window.location.href = url.pathname;
    }
}

window.logoutAdmin = logoutAdmin;

// 修改載入邏輯，加入權限檢查
// 將需要全域訪問的函式掛載到 window
window.logoutAdmin = logoutAdmin;
window.checkAdminStatus = checkAdminStatus;

// 使用 addEventListener 替代 window.onload 以增加穩定性
window.addEventListener('load', async () => {
    try {
        await init();
        checkAdminStatus();
        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (err) {
        console.error("Initialization failed:", err);
    }
});



/**
 * 載入系統全域設定 (由 admin_index.html 管理，優先從 Supabase 抓取)
 */
async function loadSystemConfig() {
    const GLOBAL_ROOM = 'SYSTEM_GLOBAL';
    const supabase = window.getSupabase();

    // 試著從 Supabase 抓取全域設定
    let remoteSettings = {};
    if (supabase) {
        try {
            const { data, error } = await supabase
                .from('settings')
                .select('*')
                .eq('room_id', GLOBAL_ROOM);

            if (!error && data) {
                data.forEach(s => {
                    remoteSettings[s.key] = s.value;
                    // 同步到本地 DB 以備離線使用
                    window.appDB.saveSetting(s.key, s.value, false); // false 表示不觸發同步推送到當前房間
                });
            }
        } catch (e) {
            console.warn("[System] 抓取雲端全域設定失敗，將使用本地快取", e);
        }
    }

    // 1. 載入版本號
    const versionData = await window.appDB.getSetting('system_version');
    const versionVal = remoteSettings['system_version'] || versionData.value;
    if (versionVal) {
        document.querySelectorAll('.version-info').forEach(el => {
            el.innerHTML = `${versionVal} <i data-lucide="copyright" style="width: 12px; height: 12px;"></i>`;
        });
        if (typeof lucide !== 'undefined') lucide.createIcons();

    }

    // 2. 載入說明書內容
    const manualData = await window.appDB.getSetting('user_manual');
    const manualVal = remoteSettings['user_manual'] || manualData.value;
    if (manualVal) {
        const container = document.querySelector('#manualModal .manual-body');
        if (container) container.innerHTML = manualVal;
    }

    // 2b. 載入近期更新內容
    const updatesData = await window.appDB.getSetting('recent_updates');
    const updatesVal = remoteSettings['recent_updates'] || updatesData.value;
    const updatesBody = document.getElementById('updatesBody');
    if (updatesBody) {
        if (updatesVal) {
            updatesBody.innerHTML = updatesVal;
        } else {
            updatesBody.innerHTML = `
<div style="text-align:center; padding: 30px 20px; color:#94a3b8;">
    <div style="font-size: 40px; margin-bottom: 12px;">📋</div>
    <p style="font-weight:600; color:#64748b; margin-bottom: 6px;">尚未發布近期更新</p>
    <p style="font-size: 13px; margin: 0;">管理員可至<strong>管理後台 → 系統設定 → 近期更新編輯</strong>撰寫並同步內容。</p>
</div>`;
        }
    }

    // 3. 載入房間預設
    const roomsData = await window.appDB.getSetting('room_presets');
    const roomsVal = remoteSettings['room_presets'] || roomsData.value;
    if (roomsVal) {
        try {
            const roomList = JSON.parse(roomsVal);
            renderRoomPresets(roomList);
        } catch (e) { console.error("解析房間預設失敗", e); }
    }
}

/**
 * 渲染房間預設選單
 */
function renderRoomPresets(roomList) {
    const container = document.getElementById('roomPresetContainer');
    if (!container) return;

    if (!roomList || !roomList.length) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    container.innerHTML = '<small style="color: #666; display: block; margin-bottom: 5px;">快速選擇房間：</small>';
    const select = document.createElement('select');
    select.style.cssText = 'width: 100%; margin-bottom: 10px; font-size: 14px; padding: 8px; border-radius: 4px; border: 1px solid #ddd;';
    select.innerHTML = '<option value="">-- 請選擇房間 --</option>';

    roomList.forEach(room => {
        const opt = document.createElement('option');
        opt.value = room;
        opt.textContent = room;
        select.appendChild(opt);
    });

    select.onchange = () => {
        if (select.value) {
            document.getElementById('roomIdInput').value = select.value;
        }
    };

    container.appendChild(select);
}
