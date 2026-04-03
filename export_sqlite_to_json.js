const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const db = new sqlite3.Database('c:/Users/Master/Desktop/康/car-system/passengers.db', (err) => {
    if (err) {
        console.error(err.message);
        process.exit(1);
    }
    console.log('Connected to SQLite database.');
});

const backupData = {
    passengers: [],
    assignments: [],
    settings: [],
    locks: []
};

db.serialize(() => {
    db.all(`SELECT * FROM passengers`, [], (err, rows) => {
        if (!err && rows) backupData.passengers = rows;
    });
    db.all(`SELECT * FROM assignments`, [], (err, rows) => {
        if (!err && rows) backupData.assignments = rows;
    });
    db.all(`SELECT * FROM settings`, [], (err, rows) => {
        if (!err && rows) backupData.settings = rows;
    });
    db.all(`SELECT * FROM vehicle_locks`, [], (err, rows) => {
        if (!err && rows) backupData.locks = rows;
    });
});

db.close((err) => {
    if (err) console.error(err);
    fs.writeFileSync('c:/Users/Master/Desktop/康/car-system/car-system-backup.json', JSON.stringify(backupData, null, 2));
    console.log('Successfully exported database to c:/Users/Master/Desktop/康/car-system/car-system-backup.json');
});
