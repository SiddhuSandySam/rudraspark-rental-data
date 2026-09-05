/**
 * RUDRASPARK RENTAL DATA COUNTER 📊
 */

const fs = require('fs');
const path = require('path');

const root = __dirname;
let grandTotal = 0;
const results = [];

console.log("\n===============================================");
console.log("📊 RUDRASPARK RENTAL GLOBAL DATA REPORT");
console.log("===============================================\n");

const files = fs.readdirSync(root);

files.forEach(dir => {
    if (dir.endsWith('_grids')) {
        let stateCount = 0;
        const dirPath = path.join(root, dir);

        try {
            const gridFiles = fs.readdirSync(dirPath);
            gridFiles.forEach(file => {
                if (file.endsWith('.json')) {
                    try {
                        const content = fs.readFileSync(path.join(dirPath, file));
                        const data = JSON.parse(content);
                        if (Array.isArray(data)) {
                            stateCount += data.length;
                        }
                    } catch (e) {}
                }
            });

            const stateName = dir.replace('_grids', '').toUpperCase().replace(/_/g, ' ');
            results.push({ state: stateName, count: stateCount });
            grandTotal += stateCount;
        } catch (err) {}
    }
});

results.sort((a, b) => b.count - a.count);

results.forEach(res => {
    console.log(`📍 ${res.state.padEnd(20)} : ${res.count.toLocaleString().padStart(10)} rental items`);
});

console.log("\n-----------------------------------------------");
console.log(`🔥 GRAND TOTAL RENTAL   : ${grandTotal.toLocaleString().padStart(10)} items`);
console.log("===============================================\n");
