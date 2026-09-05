/**
 * RUDRASPARK RENTAL CONFIG SYNC BOT
 * 🚀 Syncs config.json with latest categories & locations from hub_data.json.
 */

const fs = require('fs');
const path = require('path');

const HUB_DATA_FILE = path.join(__dirname, 'hub_data.json');
const CONFIG_FILE = path.join(__dirname, 'config.json');

function sync() {
    console.log("\n===============================================");
    console.log("🔄 RENTAL CONFIG SYNC BOT | Hub -> Config.json");
    console.log("===============================================\n");

    if (!fs.existsSync(HUB_DATA_FILE)) {
        console.error("❌ ERROR: hub_data.json not found. Run auto_sync_grids.js first.");
        process.exit(1);
    }

    try {
        const hubData = JSON.parse(fs.readFileSync(HUB_DATA_FILE));
        let newConfig = {};

        if (hubData.locations && Array.isArray(hubData.locations)) {
            console.log(`📍 Found ${hubData.locations.length} states in Hub.`);
            newConfig.states = hubData.locations.map(l => ({
                name: l.state,
                cities: Array.isArray(l.cities) ? l.cities : (String(l.cities).split(',').map(c => c.trim()))
            }));
            console.log("✅ States synced.");
        }

        if (hubData.categories && Array.isArray(hubData.categories)) {
            console.log(`📂 Found ${hubData.categories.length} categories in Hub.`);
            newConfig.categories = hubData.categories;
            console.log("✅ Categories synced.");
        }

        if (hubData.config) {
            newConfig.config = hubData.config;
        }

        fs.writeFileSync(CONFIG_FILE, JSON.stringify(newConfig, null, 2));
        console.log(`\n✨ SUCCESS: config.json updated with latest Rental Hub data.`);

        const totalCities = newConfig.states ? newConfig.states.reduce((acc, s) => acc + s.cities.length, 0) : 0;
        console.log(`📊 Stats: ${newConfig.states?.length || 0} States | ${totalCities} Cities | ${newConfig.categories?.length || 0} Categories`);
        console.log("===============================================\n");

    } catch (e) {
        console.error(`❌ CRITICAL ERROR during sync: ${e.message}`);
        process.exit(1);
    }
}

sync();
