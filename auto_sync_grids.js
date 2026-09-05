/**
 * RUDRASPARK RENTAL SMART DATA SYNC ROBOT
 * 🚀 Generates grid JSON files and hub_data.json for jsDelivr CDN.
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const RENTAL_HUB_URL = "https://script.google.com/macros/s/AKfycbwyVByXtm5VYsEPOBrGEMYaI8LhYk9ZHq77BaPwruZIKGn9E-ewVhkta-IYf3k7jfhLjA/exec";
const LAST_SYNC_FILE = path.join(__dirname, 'last_sync.json');
const HUB_DATA_FILE = path.join(__dirname, 'hub_data.json');

const isFullSync = process.argv.includes('--full');

function getGridId(lat, lon) {
    if (!lat || !lon || lat === 0 || lon === 0) return null;
    return `g_${Math.floor(lat * 10)}_${Math.floor(lon * 10)}`;
}

async function startRobotSync() {
    const SYNC_START_TIME = Date.now();
    const LOOKBACK_BUFFER = 15 * 60 * 1000;

    console.log(`🤖 RENTAL MASTER ROBOT | ${isFullSync ? 'FULL SYNC 🌑' : 'INCREMENTAL SYNC 📡'}`);

    let lastSyncTime = 0;
    if (!isFullSync && fs.existsSync(LAST_SYNC_FILE)) {
        try {
            const savedData = JSON.parse(fs.readFileSync(LAST_SYNC_FILE));
            lastSyncTime = savedData.timestamp || 0;
        } catch (e) {}
    }

    const hubResp = await axios.get(`${RENTAL_HUB_URL}?type=app_data&nocache=true`, { timeout: 90000 });
    const appData = hubResp.data;
    if (!appData.stateUrls) throw new Error("Invalid Rental Hub Data");

    // Write master hub_data.json for CDN
    fs.writeFileSync(HUB_DATA_FILE, JSON.stringify(appData, null, 2));
    console.log(`✨ Saved master hub_data.json for CDN.`);

    const states = Object.keys(appData.stateUrls);
    for (const stateName of states) {
        const stateUrl = appData.stateUrls[stateName];
        const folderName = `${stateName.toLowerCase().replace(/ /g, '_')}_grids`;
        const gridDir = path.join(__dirname, folderName);

        if (isFullSync && fs.existsSync(gridDir)) {
            console.log(`   🧹 [${stateName}] Cleaning old grids for fresh Full Sync...`);
            fs.rmSync(gridDir, { recursive: true, force: true });
        }
        if (!fs.existsSync(gridDir)) fs.mkdirSync(gridDir, { recursive: true });

        console.log(`🏙️ PROCESSING STATE: ${stateName}`);

        let allNewProviders = [];
        let offset = 0;
        let hasMore = true;

        let effectiveSince = (lastSyncTime > 0 && !isFullSync) ? (lastSyncTime - LOOKBACK_BUFFER) : 0;
        if (effectiveSince < 0) effectiveSince = 0;

        while (hasMore) {
            let finalUrl = `${stateUrl}?type=providers&offset=${offset}&limit=5000&nocache=true`;
            if (effectiveSince > 0) finalUrl += `&since=${effectiveSince}`;

            const resp = await axios.get(finalUrl, { timeout: 300000 });
            if (Array.isArray(resp.data)) {
                allNewProviders.push(...resp.data);
                if (resp.data.length < 5000) hasMore = false;
                else offset += resp.data.length;
            } else break;
        }

        if (allNewProviders.length > 0) {
            const newLeadsMap = {};
            const newLeadIds = new Set(allNewProviders.map(p => p.id));

            allNewProviders.forEach(p => {
                const gid = getGridId(p.latitude, p.longitude);
                if (gid) {
                    if (!newLeadsMap[gid]) newLeadsMap[gid] = [];
                    newLeadsMap[gid].push(p);
                }
            });

            if (isFullSync) {
                Object.keys(newLeadsMap).forEach(gid => {
                    fs.writeFileSync(path.join(gridDir, `${gid}.json`), JSON.stringify(newLeadsMap[gid]));
                });
            } else {
                const gridFiles = fs.readdirSync(gridDir).filter(f => f.endsWith('.json'));
                gridFiles.forEach(file => {
                    const filePath = path.join(gridDir, file);
                    const gid = file.replace('.json', '');
                    try {
                        let gridData = JSON.parse(fs.readFileSync(filePath));
                        const filteredData = gridData.filter(p => !newLeadIds.has(p.id));
                        if (newLeadsMap[gid]) {
                            filteredData.push(...newLeadsMap[gid]);
                            delete newLeadsMap[gid];
                        }
                        if (filteredData.length === 0) fs.unlinkSync(filePath);
                        else fs.writeFileSync(filePath, JSON.stringify(filteredData));
                    } catch (e) { console.error(`   ⚠️ Grid Error [${file}]: ${e.message}`); }
                });
                Object.keys(newLeadsMap).forEach(gid => {
                    fs.writeFileSync(path.join(gridDir, `${gid}.json`), JSON.stringify(newLeadsMap[gid]));
                });
            }
            console.log(`   ✨ State ${stateName} Synced: ${allNewProviders.length} records updated.`);
        }
    }

    fs.writeFileSync(LAST_SYNC_FILE, JSON.stringify({ timestamp: SYNC_START_TIME }, null, 2));
    console.log(`🚀 RENTAL SYNC ROBOT MISSION ACCOMPLISHED!`);
}

startRobotSync().catch(err => { console.error(err); process.exit(1); });
