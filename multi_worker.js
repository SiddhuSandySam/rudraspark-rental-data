const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const registry = require('./registry_manager');

/**
 * WORKER CONFIGURATION
 */
const args = process.argv.slice(2);
const WORKER_ID = args[0] !== undefined ? parseInt(args[0]) : 0;
const TOTAL_WORKERS = args[1] !== undefined ? parseInt(args[1]) : 1;

const RENTAL_HUB_URL = "https://script.google.com/macros/s/AKfycbwyVByXtm5VYsEPOBrGEMYaI8LhYk9ZHq77BaPwruZIKGn9E-ewVhkta-IYf3k7jfhLjA/exec";
const SYNC_FIRESTORE_ENABLED = false;
const SYNC_SHEET_ENABLED = true;
const HEADLESS = process.env.CI ? true : false; // 🚀 Headless on GitHub Actions, visible browser on Laptop!
const COOL_DOWN_MS = 1000;
const MAX_SESSION_TIME_MS = 330 * 60 * 1000; // 🚀 5.5 Hours Marathon Run!
const START_TIMESTAMP = Date.now();

// FILE PATHS
const CONFIG_FILE = path.join(__dirname, 'config.json');
const REGISTRY_FILE = path.join(__dirname, 'master_registry.json');
const PROGRESS_FILE = path.join(__dirname, `progress_W${WORKER_ID}.json`);
const FAILED_SYNC_FILE = path.join(__dirname, `failed_sync_W${WORKER_ID}.json`);
const BACKUP_LEADS_FILE = path.join(__dirname, `backup_leads_W${WORKER_ID}.json`);
const SERVICE_ACCOUNT_FILE = path.join(__dirname, 'serviceAccountKey.json');

// --- STARTUP HEADER ---
console.log("\n===============================================");
console.log(`   RUDRASPARK RENTAL WORKER ${WORKER_ID} | VERSION: V1.0 | DATA-ARMOR-HYBRID`);
console.log("===============================================\n");

// INITIALIZE FIREBASE (OPTIONAL)
let db;
if (fs.existsSync(SERVICE_ACCOUNT_FILE)) {
    const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_FILE));
    if (getApps().length === 0) initializeApp({ credential: cert(serviceAccount) });
    db = getFirestore();
    console.log(`Rental Worker ${WORKER_ID} | INFO | Firebase Initialized.`);
}

// GLOBAL STATE
let config = JSON.parse(fs.readFileSync(CONFIG_FILE));
let stateUrls = {};
let currentTargetUrl = RENTAL_HUB_URL;
let lastFullSyncTime = 0;

let progress = { stateIndex: 0, cityIndex: 0, categoryIndex: 0, subcategoryIndex: 0, lastRegistrySync: 0 };

async function loadProgress() {
    if (fs.existsSync(PROGRESS_FILE)) {
        progress = JSON.parse(fs.readFileSync(PROGRESS_FILE));
        console.log(`Rental Worker ${WORKER_ID} | INFO | Local Progress Loaded.`);
    }
}

let sheetBuffer = [];
let firestoreBuffer = [];
let isFlushing = false;
let newLeadsCount = 0;
const BATCH_LIMIT = 50;

async function saveProgress() {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function flushBuffers(isExiting = false) {
    if (isFlushing && !isExiting) return;
    if (isFlushing && isExiting) { while (isFlushing) { await new Promise(r => setTimeout(r, 500)); } }
    if (sheetBuffer.length === 0 && firestoreBuffer.length === 0) return;

    isFlushing = true;
    const mode = isExiting ? "EXIT" : "SYNC";

    try {
        // 1. Firestore Sync
        if (firestoreBuffer.length > 0 && db && SYNC_FIRESTORE_ENABLED) {
            console.log(`Rental Worker ${WORKER_ID} | [${mode}] | Firestore: Saving ${firestoreBuffer.length} rental leads...`);
            const leads = [...firestoreBuffer];
            try {
                for (let i = 0; i < leads.length; i += 50) {
                    const chunk = leads.slice(i, i + 50);
                    const batch = db.batch();
                    chunk.forEach(p => {
                        const phone = p.id.replace('rental_', '');
                        batch.set(db.collection('rental_providers').doc(p.id), p, { merge: true });
                        batch.set(db.collection('scraped_rental_phones').doc(phone), { timestamp: Date.now() });
                    });
                    await batch.commit();
                }
                console.log(`Rental Worker ${WORKER_ID} | [SYNC] | ✅ Firestore: Success. Saved ${leads.length} rental leads.`);
                firestoreBuffer = firestoreBuffer.filter(p => !leads.includes(p));
            } catch (e) {
                console.error(`Rental Worker ${WORKER_ID} | [SYNC] | ❌ Firestore Failed: ${e.message}. Retrying in next cycle...`);
            }
        }

        // 2. Google Sheets Sync
        if (sheetBuffer.length > 0 && SYNC_SHEET_ENABLED) {
            const groupedLeads = {};
            sheetBuffer.forEach(p => {
                const s = p.state || "Unknown";
                if (!groupedLeads[s]) groupedLeads[s] = [];
                groupedLeads[s].push(p);
            });

            let overallSuccess = true;
            for (const stateName of Object.keys(groupedLeads)) {
                let leadsToSync = groupedLeads[stateName];
                const targetUrl = stateUrls[stateName] || currentTargetUrl;

                const leadNames = leadsToSync.map(l => l.businessName || l.id).join(", ");
                console.log(`Rental Worker ${WORKER_ID} | [${mode}] | 🚀 Routing ${leadsToSync.length} rental leads to [${stateName}] Sheet...`);
                console.log(`Rental Worker ${WORKER_ID} | [DATA] | Leads: [${leadNames}]`);

                let retryAttempt = 0;
                let stateSuccess = false;

                // 🚀 INFINITE RETRY UNTIL GOOGLE SHEET CONFIRMS SUCCESS
                while (!stateSuccess) {
                    retryAttempt++;
                    if (retryAttempt > 1) {
                        const waitTime = Math.min(15000 * retryAttempt, 60000);
                        console.log(`Rental Worker ${WORKER_ID} | ⏳ Retry ${retryAttempt} for [${stateName}] in ${waitTime/1000}s...`);
                        await new Promise(r => setTimeout(r, waitTime));
                    }

                    try {
                        const response = await axios.post(targetUrl, { type: "BATCH_PROVIDER_SYNC", providers: leadsToSync }, { timeout: 240000 });
                        const resData = String(response.data);

                        if (resData.includes("Success") || resData.includes("Complete") || resData.includes("already exists")) {
                            console.log(`Rental Worker ${WORKER_ID} | [${mode}] | ✅ [${stateName}] Sync Success for: [${leadNames}]`);
                            stateSuccess = true;
                        } else {
                            const logData = resData.length > 100 ? resData.substring(0, 100) + "..." : resData;
                            console.warn(`Rental Worker ${WORKER_ID} | [${mode}] | ⚠️ [${stateName}] Server Response: ${logData}. Retrying...`);
                        }
                    } catch (e) {
                        console.error(`Rental Worker ${WORKER_ID} | [${mode}] | ❌ [${stateName}] Sync Error: ${e.message}. Retrying...`);
                    }
                }
                if (!stateSuccess) overallSuccess = false;
            }

            if (overallSuccess) {
                sheetBuffer = [];
                if (fs.existsSync(BACKUP_LEADS_FILE)) {
                    fs.unlinkSync(BACKUP_LEADS_FILE);
                    console.log(`Rental Worker ${WORKER_ID} | [${mode}] | 🧹 Success! Local backup [${path.basename(BACKUP_LEADS_FILE)}] deleted.`);
                }
                if (fs.existsSync(FAILED_SYNC_FILE)) fs.unlinkSync(FAILED_SYNC_FILE);
            } else {
                console.error(`Rental Worker ${WORKER_ID} | [${mode}] | 🛑 Sync Failed after retries. Backup kept for safety.`);
            }
        }
    } finally { isFlushing = false; }
}

async function syncFromSatellite(targetUrl) {
    if (!targetUrl) return;
    let cleanUrl = targetUrl.trim().split('?')[0];
    try {
        const response = await axios.get(`${cleanUrl}?type=get_ids`, { timeout: 90000 });
        if (Array.isArray(response.data)) {
            registry.addBatch(response.data);
            console.log(`Rental Worker ${WORKER_ID} | [SYNC] | ✅ Registry Updated.`);
            lastFullSyncTime = Date.now();
        }
    } catch (e) {}
}

let isStopping = false;
async function gracefulShutdown(isError = false) {
    if (isStopping) return;
    isStopping = true;
    console.log(`\nRental Worker ${WORKER_ID} | [EXIT] | 🛑 Shutdown initiated. Securing data...`);

    if (sheetBuffer.length > 0 || firestoreBuffer.length > 0) {
        try {
            const combinedLeads = [...new Set([...sheetBuffer, ...firestoreBuffer])];
            fs.writeFileSync(FAILED_SYNC_FILE, JSON.stringify(combinedLeads, null, 2));
            console.log(`Rental Worker ${WORKER_ID} | [EXIT] | 📦 Emergency backup created (${combinedLeads.length} leads).`);
        } catch (e) {
            console.error(`Rental Worker ${WORKER_ID} | [EXIT] | Backup Failed: ${e.message}`);
        }
    }

    try {
        await flushBuffers(true);
        console.log(`Rental Worker ${WORKER_ID} | [EXIT] | 🏁 FINAL SYNC COMPLETED.`);

        if (fs.existsSync(FAILED_SYNC_FILE)) fs.unlinkSync(FAILED_SYNC_FILE);
        if (fs.existsSync(BACKUP_LEADS_FILE)) fs.unlinkSync(BACKUP_LEADS_FILE);
    } catch (e) {
        console.error(`Rental Worker ${WORKER_ID} | [EXIT] | Final sync failed, keeping local backup.`);
    } finally {
        await saveProgress();
        process.exit(isError ? 1 : 0);
    }
}

process.on('SIGINT', () => gracefulShutdown(false));
process.on('SIGTERM', () => gracefulShutdown(false));

async function extractPortfolio(page) {
    try {
        console.log(`Rental Worker ${WORKER_ID} | 📸 | Extracting Portfolio...`);
        if (page.isClosed()) return [];

        const photoBtn = await page.$('button[data-value="Photos"], button[aria-label*="Photo"], button[aria-label*="फ़ोटो"], .m67q60 button');
        let galleryOpened = false;

        if (photoBtn && await photoBtn.isVisible()) {
            try {
                await photoBtn.click({ force: true, timeout: 3000 });
                await page.waitForTimeout(3000);
                galleryOpened = true;
            } catch (clickErr) {}
        }

        if (!galleryOpened) {
            const mainImg = await page.$('button[aria-label^="Photo of"], img[src*="googleusercontent.com/p/"]');
            if (mainImg && await mainImg.isVisible()) {
                try {
                    await mainImg.click({ force: true, timeout: 3000 });
                    await page.waitForTimeout(3000);
                    galleryOpened = true;
                } catch (clickErr) {}
            }
        }

        const allUrls = new Set();
        const loopCount = galleryOpened ? 15 : 5;

        for (let i = 0; i < loopCount; i++) {
            if (page.isClosed()) break;
            const batch = await page.evaluate((isGallery) => {
                const found = [];
                const container = isGallery ? (document.querySelector('.m6x62c-v77d8b-view-container, .DxyBCb, div[role="grid"]') || document.body) : document.body;

                const elements = container.querySelectorAll('img, div[style*="background-image"]');
                elements.forEach(el => {
                    let src = el.tagName === 'IMG' ? (el.src || el.getAttribute('src') || el.dataset.src) : "";
                    if (!src) {
                        const style = el.getAttribute('style') || "";
                        const match = style.match(/url\(["']?(.*?)["']?\)/);
                        if (match) src = match[1];
                    }

                    if (src && src.includes('googleusercontent.com') && !src.includes('base64')) {
                        const isProfile = src.includes('/a/') || src.includes('/a-/') || src.includes('=s32') || src.includes('=s64');
                        const isPhoto = src.includes('/p/') || src.includes('/video/');

                        if (isProfile && !isPhoto) return;

                        let parent = el.parentElement;
                        let isReviewIcon = false;
                        for (let j = 0; j < 4; j++) {
                            if (!parent) break;
                            const aria = (parent.getAttribute('aria-label') || "").toLowerCase();
                            if (parent.tagName === 'BUTTON' && (parent.classList.contains('WEBjve') || aria.includes('review'))) {
                                isReviewIcon = true;
                                break;
                            }
                            parent = parent.parentElement;
                        }
                        if (isReviewIcon) return;

                        const clean = src.split('=')[0].split('/s')[0].split('/w')[0].split('/h')[0];
                        found.push(clean + '=s1000');
                    }
                });
                return found;
            }, galleryOpened);

            batch.forEach(url => allUrls.add(url));

            await page.evaluate((isGallery) => {
                const scrollable = isGallery ? document.querySelector('.m6x62c-v77d8b-view-container, .DxyBCb, div[role="grid"]') : null;
                if (scrollable) scrollable.scrollBy(0, 1200);
                else window.scrollBy(0, 1000);
            }, galleryOpened);
            await page.waitForTimeout(1000);
        }

        const portfolio = Array.from(allUrls).filter(u => !u.includes('mapslogo')).slice(0, 45);

        if (galleryOpened) {
            try { await page.keyboard.press('Escape'); } catch (escErr) {}
            const backBtn = await page.$('button[aria-label="Back"], .VfPpkd-icon-LgbsSe, button[aria-label="Close"]');
            if (backBtn && await backBtn.isVisible()) {
                try { await backBtn.click({ force: true, timeout: 3000 }); } catch (clickErr) {}
            }
            await page.waitForTimeout(1000);
        }

        console.log(`Rental Worker ${WORKER_ID} | 📸 | Result: ${portfolio.length} images. First 2 URLs:`);
        portfolio.slice(0, 2).forEach((url, i) => console.log(`   [${i+1}] ${url}`));

        return portfolio;
    } catch (e) { console.log(`Rental Worker ${WORKER_ID} | ⚠️ | Portfolio Error: ${e.message}`); return []; }
}

async function scrapeIndividualProfile(page, businessName, city, state, categoryId, subcategory) {
    try {
        const mapsTitle = await page.$eval('h1.DUwDvf', el => el.innerText).catch(() => "");
        if (mapsTitle && !mapsTitle.toLowerCase().includes(businessName.toLowerCase().substring(0, 4)) &&
            !businessName.toLowerCase().includes(mapsTitle.toLowerCase().substring(0, 4))) {
            console.log(`Rental Worker ${WORKER_ID} | [🛑] | SKIP | Title Mismatch. Maps: ${mapsTitle} vs List: ${businessName}`);
            return 0;
        }

        await page.waitForSelector('button[data-item-id^="phone"]', { timeout: 15000 }).catch(() => {});
        const phoneStr = await page.$eval('button[data-item-id^="phone"]', el => el.innerText).catch(() => "");
        const cleanPhone = phoneStr.replace(/[^0-9]/g, '').slice(-10);

        const firstDigit = cleanPhone[0];
        if (!cleanPhone || cleanPhone.length < 10 || !['6', '7', '8', '9'].includes(firstDigit)) {
            console.log(`Rental Worker ${WORKER_ID} | [🛑] | SKIP | Business: ${businessName} | Reason: Invalid/Junk Phone (${cleanPhone})`);
            return 0;
        }

        if (registry.has(cleanPhone)) {
            return { status: "DUPLICATE", phone: cleanPhone, businessName: businessName };
        }

        await page.waitForSelector('button[data-item-id="address"]', { timeout: 15000 }).catch(() => {});
        const fullAddress = await page.$eval('button[data-item-id="address"]', el => el.innerText).catch(() => "N/A");
        const cleanFullAddress = fullAddress.replace('\n', '').replace('', '').trim();

        if (cleanFullAddress === "N/A" || !cleanFullAddress) {
            console.log(`Rental Worker ${WORKER_ID} | [🛑] | SKIP | Business: ${businessName} | Reason: No Address Found`);
            return 0;
        }

        const addressParts = cleanFullAddress.split(',').map(p => p.trim());
        let detectedCity = city;
        let detectedLocality = city;
        let detectedState = state;

        if (addressParts.length >= 3) {
            let stateIdx = addressParts.length - 1;
            if (addressParts[stateIdx].toLowerCase() === "india" && addressParts.length >= 4) stateIdx--;
            const statePart = addressParts[stateIdx];

            if (!statePart.toLowerCase().includes(state.toLowerCase())) {
                console.log(`Rental Worker ${WORKER_ID} | [🛑] | SKIP | Business: ${businessName} | Reason: State Mismatch (Detected: ${statePart}, Expected: ${state})`);
                return 0;
            }
            detectedCity = addressParts[stateIdx - 1];
            detectedState = statePart;
            detectedLocality = addressParts.length >= 4 ? addressParts[stateIdx - 2] : detectedCity;
        }

        const urlCoords = page.url().match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || page.url().match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
        let latitude = urlCoords ? parseFloat(urlCoords[1]) : 0;
        let longitude = urlCoords ? parseFloat(urlCoords[2]) : 0;

        const isLatValid = latitude > 6.0 && latitude < 38.5;
        const isLonValid = longitude > 68.0 && longitude < 98.5;
        if (!isLatValid || !isLonValid) {
            console.log(`Rental Worker ${WORKER_ID} | [🛑] | SKIP | Business: ${businessName} | Reason: Ocean Coordinates (${latitude}, ${longitude})`);
            return 0;
        }

        let portfolio = await extractPortfolio(page);
        if (portfolio.length === 0) { await page.waitForTimeout(3000); portfolio = await extractPortfolio(page); }

        if (!portfolio || portfolio.length === 0) {
            console.log(`Rental Worker ${WORKER_ID} | [🛑] | SKIP | Business: ${businessName} | Reason: No Portfolio Images Found`);
            return 0;
        }

        const provider = {
            id: `rental_${cleanPhone}`,
            businessName: businessName,
            primaryCategoryId: categoryId,
            subcategory: subcategory,
            experienceYears: Math.floor(Math.random() * 5) + 1,
            serviceMode: "Local",
            city: detectedCity, locality: detectedLocality, state: state,
            startingPrice: 0, priceUnit: "Per Day",
            whatsappNumber: cleanPhone, callNumber: cleanPhone,
            aboutDescription: `Professional ${subcategory} equipment available for rent in ${detectedCity}. High-quality equipment guaranteed by local experts.`,
            isApproved: true, isVerified: false, rating: 0.0,
            profilePhotoUrl: portfolio[0] ? portfolio[0].split('=')[0] + '=w500-h500-k-no' : "",
            recommendationCount: 0, portfolioUrls: portfolio,
            searchKeywords: [businessName, detectedCity, subcategory, state],
            lastSeen: Date.now(), callCount: 0, fullAddress: cleanFullAddress,
            isNumberHidden: false, referredBy: "RENTAL_SCRAPER", referralBonusPaid: false, fcmToken: "",
            notificationsEnabled: true, latitude: latitude, longitude: longitude
        };

        const requiredFields = ['businessName', 'whatsappNumber', 'city', 'state', 'latitude', 'longitude', 'profilePhotoUrl'];
        const missingFields = requiredFields.filter(f => !provider[f] || provider[f] === 0 || provider[f] === "0");

        if (missingFields.length > 0) {
            console.log(`Rental Worker ${WORKER_ID} | [🛑] | REJECT | Business: ${businessName} | Reason: Missing fields (${missingFields.join(', ')})`);
            return 0;
        }

        if (SYNC_FIRESTORE_ENABLED && db) firestoreBuffer.push(provider);
        if (SYNC_SHEET_ENABLED) sheetBuffer.push(provider);

        try {
            let currentBackup = [];
            if (fs.existsSync(BACKUP_LEADS_FILE)) {
                try { currentBackup = JSON.parse(fs.readFileSync(BACKUP_LEADS_FILE)); } catch (e) { currentBackup = []; }
            }
            currentBackup.push(provider);
            fs.writeFileSync(BACKUP_LEADS_FILE, JSON.stringify(currentBackup, null, 2));
        } catch (e) {}

        if (sheetBuffer.length >= BATCH_LIMIT || firestoreBuffer.length >= BATCH_LIMIT) await flushBuffers();
        const finalPhone = cleanPhone.replace(/[^0-9]/g, '').slice(-10);
        console.log(`Rental Worker ${WORKER_ID} | 🎉 | ADDED | ${businessName} | Phone: ${finalPhone} (Total: ${++newLeadsCount})`);
        registry.add(cleanPhone);
        return 1;
    } catch (err) { return 0; }
}

async function scrapeCombination(page, city, state, categoryId, subcategory) {
    if (isStopping || page.isClosed()) return 0;
    try {
        await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(subcategory + " in " + city + ", " + state)}`, { timeout: 60000, waitUntil: 'domcontentloaded' }).catch(() => {});

        const status = await Promise.race([
            page.waitForSelector('a.hfpxzc', { timeout: 45000 }).then(() => "LIST").catch(() => new Promise(() => {})),
            page.waitForSelector('h1.DUwDvf', { timeout: 30000 }).then(() => "SINGLE").catch(() => new Promise(() => {})),
            page.waitForSelector('div.fvP2If', { timeout: 20000 }).then(() => "EMPTY").catch(() => new Promise(() => {})),
            page.waitForTimeout(65000).then(() => "TIMEOUT")
        ]);

        if (status === "EMPTY") {
            console.log(`Rental Worker ${WORKER_ID} | [-] | No results for ${subcategory} in ${city}.`);
            return 0;
        }

        if (status === "TIMEOUT") {
            console.log(`Rental Worker ${WORKER_ID} | [!] | Page Load Timeout for ${subcategory}. Skipping...`);
            return 0;
        }

        if (status === "SINGLE") {
            const name = await page.$eval('h1.DUwDvf', el => el.innerText).catch(() => "Unknown");
            if (name.trim().toLowerCase() === city.trim().toLowerCase() || name.trim().toLowerCase() === state.trim().toLowerCase()) {
                console.log(`Rental Worker ${WORKER_ID} | [-] | City Map Pin (${name}) loaded for ${subcategory} in ${city}. No business found.`);
                return 0;
            }
            console.log(`Rental Worker ${WORKER_ID} | 🎯 | Direct Business Profile detected: ${name}`);
            return await scrapeIndividualProfile(page, name, city, state, categoryId, subcategory);
        }

        for (let i = 0; i < 8; i++) {
            if (isStopping || page.isClosed()) break;
            await page.mouse.wheel(0, 4000);
            await page.waitForTimeout(1500);
        }

        let streak = 0;
        let foundCount = 0;
        const MAX_LISTINGS = 100;

        for (let i = 0; i < MAX_LISTINGS; i++) {
            if (isStopping || page.isClosed()) break;
            const listings = await page.$$('a.hfpxzc');
            if (i >= listings.length) break;
            const listing = listings[i];
            const nameRaw = await listing.getAttribute('aria-label').catch(() => "Unknown");

            try {
                await listing.scrollIntoViewIfNeeded({ timeout: 3000 });
                await listing.click({ force: true, timeout: 3000 });
            } catch (clickErr) {
                console.log(`Rental Worker ${WORKER_ID} | ⏩ | SKIP | Unclickable/Detached listing element.`);
                continue;
            }

            let updated = false;
            for (let r = 0; r < 12; r++) {
                const title = await page.$eval('h1.DUwDvf', el => el.innerText).catch(() => "");
                if (title.toLowerCase().includes(nameRaw.toLowerCase().substring(0, 4))) { updated = true; break; }
                await page.waitForTimeout(1000);
            }
            if (!updated) continue;

            const res = await scrapeIndividualProfile(page, nameRaw, city, state, categoryId, subcategory);
            if (res === 1) {
                foundCount++;
                streak = 0;
            } else {
                streak++;
                if (res && res.status === "DUPLICATE") {
                    const bName = res.businessName || nameRaw || "Unknown";
                    console.log(`Rental Worker ${WORKER_ID} | ⏩ | SKIP | ${bName} | Phone: ${res.phone} | Duplicate (Streak: ${streak}/4)`);
                } else {
                    console.log(`Rental Worker ${WORKER_ID} | 🛑 | SKIP | ${nameRaw} | Invalid/Poor Quality (Streak: ${streak}/4)`);
                }

                if (streak >= 4) {
                    console.log(`Rental Worker ${WORKER_ID} | 🎯 | STREAK HIT | 4 consecutive duplicates/skips. Moving to next sub-category...`);
                    return foundCount;
                }
            }
        }
        return foundCount;
    } catch (e) {
        console.warn(`Rental Worker ${WORKER_ID} | ⚠️ | Scrape warning in ${city}: ${e.message}`);
        return 0;
    }
}

async function runOrchestrator() {
    if (WORKER_ID > 0) {
        const startupDelay = WORKER_ID * 60 * 1000;
        console.log(`Rental Worker ${WORKER_ID} | STAGGER | Waiting ${WORKER_ID} minute(s) before initialization...`);
        await new Promise(r => setTimeout(r, startupDelay));
    }

    await loadProgress();

    const browser = await chromium.launch({ headless: HEADLESS });
    const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' });
    const page = await context.newPage();

    try {
        console.log(`Rental Worker ${WORKER_ID} | INFO | Fetching Dynamic Config from Rental Hub Sheet...`);
        const hubResp = await axios.get(`${RENTAL_HUB_URL}?type=config&nocache=true`, { timeout: 30000 });
        if (hubResp.data && hubResp.data.config) {
            if (hubResp.data.locations && hubResp.data.locations.length > 0) {
                config.states = hubResp.data.locations;
            }
            if (hubResp.data.categories && hubResp.data.categories.length > 0) {
                config.categories = hubResp.data.categories;
            }
            if (hubResp.data.stateUrls) {
                stateUrls = hubResp.data.stateUrls;
            }
            console.log(`Rental Worker ${WORKER_ID} | INFO | Live Config Loaded from Hub! Active States: ${Object.keys(stateUrls).join(', ')}`);
        }
    } catch (e) {
        console.warn(`Rental Worker ${WORKER_ID} | WARN | Could not fetch live config from Hub: ${e.message}. Using local config.json fallback.`);
    }

    try {
        for (let sIdx = progress.stateIndex; sIdx < config.states.length; sIdx++) {
            if (sheetBuffer.length > 0 || firestoreBuffer.length > 0) {
                console.log(`Rental Worker ${WORKER_ID} | INFO | Finalizing previous state data before transition...`);
                await flushBuffers();
            }

            const state = config.states[sIdx]; progress.stateIndex = sIdx;
            currentTargetUrl = stateUrls[state.name] || RENTAL_HUB_URL;

            await syncFromSatellite(currentTargetUrl);

            let cities = WORKER_ID % 2 === 0 ? [...state.cities].reverse() : [...state.cities];
            for (let catIdx = progress.categoryIndex; catIdx < config.categories.length; catIdx++) {
                if (catIdx % TOTAL_WORKERS !== WORKER_ID) { progress.cityIndex = 0; continue; }

                const category = config.categories[catIdx]; progress.categoryIndex = catIdx;
                console.log(`\nRental Worker ${WORKER_ID} | [CAT START] | 📂 Starting Category ${catIdx + 1}/${config.categories.length}: ${category.name}\n`);

                for (let cIdx = progress.cityIndex; cIdx < cities.length; cIdx++) {
                    const city = cities[cIdx]; progress.cityIndex = cIdx;
                    console.log(`Rental Worker ${WORKER_ID} | [CITY START] | 🏙️ Entering City: ${city} (City ${cIdx + 1}/${cities.length})`);

                    for (let subIdx = progress.subcategoryIndex; subIdx < category.sub.length; subIdx++) {
                        if (isStopping) break;

                        if (Date.now() - START_TIMESTAMP > MAX_SESSION_TIME_MS) {
                            console.log(`\nRental Worker ${WORKER_ID} | [TIMER] | Session limit reached. Syncing and restarting...`);
                            await gracefulShutdown(false); return;
                        }

                        const subcategory = category.sub[subIdx]; progress.subcategoryIndex = subIdx;

                        const wait = Math.floor(Math.random() * 10000) + 10000;
                        console.log(`\nRental Worker ${WORKER_ID} | WAIT | Resting for ${wait/1000}s...`);
                        await page.waitForTimeout(wait);

                        console.log(`Rental Worker ${WORKER_ID} | SCAN | Sub-cat ${subIdx + 1}/${category.sub.length} | ${subcategory} in ${city}`);
                        await scrapeCombination(page, city, state.name, category.id, subcategory);
                        console.log(`Rental Worker ${WORKER_ID} | [FINISH] | Done with Sub-cat ${subIdx + 1}/${category.sub.length} (${subcategory}).`);

                        await saveProgress();
                    }
                    if (isStopping) break;
                    console.log(`\nRental Worker ${WORKER_ID} | [CITY COMPLETED] | 🏙️ Done with City ${cIdx + 1}/${cities.length} (${city}). Moving next...\n`);

                    if (sheetBuffer.length > 0 || firestoreBuffer.length > 0) await flushBuffers();
                    progress.subcategoryIndex = 0;
                }
                if (isStopping) break;
                console.log(`\nRental Worker ${WORKER_ID} | [CAT COMPLETED] | 📂 Finished Category ${catIdx + 1}/${config.categories.length} (${category.name}). Switching next...\n`);
                progress.cityIndex = 0;
            }
            if (isStopping) break;
            progress.categoryIndex = 0;
        }

        console.log(`\n===============================================`);
        console.log(`🏁 RENTAL MISSION ACCOMPLISHED: ALL STATES COMPLETED!`);
        console.log(`===============================================\n`);

        progress.stateIndex = config.states.length;
        progress.cityIndex = 0;
        progress.categoryIndex = 0;
        progress.subcategoryIndex = 0;
        await saveProgress();

        await gracefulShutdown(false);

    } catch (fatal) {
        console.error(`Rental Worker ${WORKER_ID} | [FATAL] | Loop Error: ${fatal.message}`);
        await gracefulShutdown(true);
    }
}

runOrchestrator();
