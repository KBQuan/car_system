const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
    console.log(`PWA 靜態伺服器運作中: http://localhost:${PORT}`);
    console.log(`請注意，系統的資料儲存已全面移至前端瀏覽器內的 IndexedDB`);
});