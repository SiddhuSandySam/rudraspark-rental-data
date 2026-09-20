/**
 * RUDRASPARK RENTAL CONFIG SYNC BOT (V4.4 - COMPREHENSIVE JUNK CITY FILTER)
 * 🚀 Syncs config.json with latest categories & locations from hub_data.json.
 * Filters out invalid junk city words, landmarks, and non-city address fragments.
 */

const fs = require('fs');
const path = require('path');

const HUB_DATA_FILE = path.join(__dirname, 'hub_data.json');
const CONFIG_FILE = path.join(__dirname, 'config.json');

const JUNK_CITIES = [
    'infront', 'camp', 'zone', 'new', 'old', 'dat', 'sco', 'scf', 'near', 'opp', 'opposite',
    'block', 'phase', 'sector', 'street', 'road', 'marg', 'lane', 'flat', 'plot', 'shop',
    'floor', 'building', 'society', 'apartment', 'complex', 'center', 'centre', 'chowk',
    'circle', 'bypass', 'yard', 'ward', 'gali', 'khasra', 'dist', 'district', 'state',
    'india', 'chhatrapati', 'nagar', 'colony', 'area', 'sub', 'rural', 'urban', 'town',
    'station', 'stand', 'stop', 'gate', 'market', 'bazaar', 'bazar', 'peth', 'tola', 'patti'
];

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
            newConfig.states = hubData.locations.map(l => {
                const rawCities = Array.isArray(l.cities) ? l.cities : (String(l.cities).split(',').map(c => c.trim()));
                const cleanCities = rawCities.filter(c => {
                    const cl = c.trim().toLowerCase();
                    const isPureNumber = /^[0-9\s\-\/\#\.]+$/.test(cl);
                    const isJunk = JUNK_CITIES.includes(cl);
                    const isStateName = cl === l.state.toLowerCase();
                    return cl.length > 1 && !isPureNumber && !isJunk && !isStateName;
                });
                return {
                    name: l.state,
                    cities: cleanCities
                };
            });
            console.log("✅ States synced & comprehensive junk city names filtered out.");
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
        console.log(`\n✨ SUCCESS: config.json updated with clean Rental Hub data.`);

        const totalCities = newConfig.states ? newConfig.states.reduce((acc, s) => acc + s.cities.length, 0) : 0;
        console.log(`📊 Stats: ${newConfig.states?.length || 0} States | ${totalCities} Clean Cities | ${newConfig.categories?.length || 0} Categories`);
        console.log("===============================================\n");

    } catch (e) {
        console.error(`❌ CRITICAL ERROR during sync: ${e.message}`);
        process.exit(1);
    }
}

sync();