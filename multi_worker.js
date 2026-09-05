const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const registry = require('./registry_manager');

/**
 * 🚀 RUDRASPARK RENTAL MULTI-WORKER (V1 - DEDICATED RENTAL EDITION)
 */
const args = process.argv.slice(2);
const WORKER_ID = args[0] !== undefined ? parseInt(args[0]) : 0;
const TOTAL_WORKERS = args[1] !== undefined ? parseInt(args[1]) : 1;

// UPDATE THIS WITH YOUR RENTAL MAIN HUB SCRIPT URL
let RENTAL_HUB_URL = "https://script.google.com/macros/s/AKfycbwyVByXtm5VYsEPOBrGEMYaI8LhYk9ZHq77BaPwruZIKGn9E-ewVhkta-IYf3k7jfhLjA/exec";

const SYNC_FIRESTORE_ENABLED = false;
const SYNC_SHEET_ENABLED = true;
const HEADLESS = true;
const COOL_DOWN_MS = 1000;
const MAX_SESSION_TIME_MS = 330 * 60 * 1000;
const START_TIMESTAMP = Date.now();

// FILE PATHS
const CONFIG_FILE = path.join(__dirname, 'config.json');
const PROGRESS_FILE = path.join(__dirname, `progress_W${WORKER_ID}.json`);
const FAILED_SYNC_FILE = path.join(__dirname, `failed_sync_W${WORKER_ID}.json`);
const BACKUP_LEADS_FILE = path.join(__dirname, `backup_leads_W${WORKER_ID}.json`);
const SERVICE_ACCOUNT_FILE = path.join(__dirname, 'serviceAccountKey.json');

console.log("\n===============================================");
console.log(`   RUDRASPARK RENTAL WORKER ${WORKER_ID} | VERSION: V1.0`);
console.log("===============================================\n");

let db;
if (fs.existsSync(SERVICE_ACCOUNT_FILE)) {
    const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_FILE));
    if (getApps().length === 0) initializeApp({ credential: cert(serviceAccount) });
    db = getFirestore();
    console.log(`Rental Worker ${WORKER_ID} | INFO | Firebase Initialized.`);
}

let config = JSON.parse(fs.readFileSync(CONFIG_FILE));
let stateUrls = {};
let currentTargetUrl = RENTAL_HUB_URL;
let lastFullSyncTime = 0;

let progress = { stateIndex: 0, cityIndex: 0, categoryIndex: 0, subcategoryIndex: 0, lastRegistrySync: 0 };

async function loadProgress() {
    if (fs.existsSync(PROGRESS_FILE)) {
        progress = JSON.parse(fs.readFileSync(PROGRESS_FILE));
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
        if (firestoreBuffer.length > 0 && db && SYNC_FIRESTORE_ENABLED) {
            console.log(`Rental Worker ${WORKER_ID} | [${mode}] | Firestore: Saving ${firestoreBuffer.length} rental items...`);
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
                console.log(`Rental Worker ${WORKER_ID} | [SYNC] | ✅ Firestore: Saved ${leads.length} rental providers.`);
                firestoreBuffer = firestoreBuffer.filter(p => !leads.includes(p));
            } catch (e) {
                console.error(`Rental Worker ${WORKER_ID} | [SYNC] | ❌ Firestore Failed: ${e.message}`);
            }
        }

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
                console.log(`Rental Worker ${WORKER_ID} | [${mode}] | 🚀 Syncing ${leadsToSync.length} items to [${stateName}] Rental Sheet...`);

                let retryAttempt = 0;
                const MAX_RETRIES = 10;
                let stateSuccess = false;

                while (retryAttempt < MAX_RETRIES && !stateSuccess) {
                    retryAttempt++;
                    if (retryAttempt > 1) {
                        const waitTime = Math.min(15000 * retryAttempt, 60000);
                        console.log(`Rental Worker ${WORKER_ID} | ⏳ Retry ${retryAttempt}/${MAX_RETRIES} in ${waitTime/1000}s...`);
                        await new Promise(r => setTimeout(r, waitTime));
                    }

                    try {
                        const response = await axios.post(targetUrl, { type: "BATCH_PROVIDER_SYNC", providers: leadsToSync }, { timeout: 180000 });
                        const resData = String(response.data);

                        if (resData.includes("Success") || resData.includes("Complete")) {
                            console.log(`Rental Worker ${WORKER_ID} | [${mode}] | ✅ [${stateName}] Rental Sync Success!`);
                            stateSuccess = true;
                        } else {
                            console.warn(`Rental Worker ${WORKER_ID} | [${mode}] | ⚠️ Server Response: ${resData.substring(0, 80)}`);
                        }
                    } catch (e) {
                        console.error(`Rental Worker ${WORKER_ID} | [${mode}] | ❌ Sync Error: ${e.message}`);
                    }
                }
                if (!stateSuccess) overallSuccess = false;
            }

            if (overallSuccess) {
                sheetBuffer = [];
                if (fs.existsSync(BACKUP_LEADS_FILE)) fs.unlinkSync(BACKUP_LEADS_FILE);
                if (fs.existsSync(FAILED_SYNC_FILE)) fs.unlinkSync(FAILED_SYNC_FILE);
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
async function gracefulShutdown() {
    if (isStopping) return;
    isStopping = true;
    console.log(`\nRental Worker ${WORKER_ID} | [EXIT] | 🛑 Securing data before shutdown...`);
    try {
        await flushBuffers(true);
    } finally {
        await saveProgress();
        process.exit(0);
    }
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

async function extractPortfolio(page) {
    try {
        if (page.isClosed()) return [];
        const photoBtn = await page.$('button[data-value="Photos"], button[aria-label*="Photo"], .m67q60 button');
        let galleryOpened = false;

        if (photoBtn && await photoBtn.isVisible()) {
            try {
                await photoBtn.click({ force: true, timeout: 3000 });
                await page.waitForTimeout(3000);
                galleryOpened = true;
            } catch (clickErr) {}
        }

        const allUrls = new Set();
        const loopCount = galleryOpened ? 12 : 5;

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

        const portfolio = Array.from(allUrls).filter(u => !u.includes('mapslogo')).slice(0, 30);
        return portfolio;
    } catch (e) { return []; }
}

async function scrapeIndividualProfile(page, businessName, city, state, categoryId, subcategory) {
    try {
        const phoneStr = await page.$eval('button[data-item-id^="phone"]', el => el.innerText).catch(() => "");
        const cleanPhone = phoneStr.replace(/[^0-9]/g, '').slice(-10);

        const firstDigit = cleanPhone[0];
        if (!cleanPhone || cleanPhone.length < 10 || !['6', '7', '8', '9'].includes(firstDigit)) {
            return 0;
        }

        if (registry.has(cleanPhone)) {
            return { status: "DUPLICATE", phone: cleanPhone, businessName: businessName };
        }

        const fullAddress = await page.$eval('button[data-item-id="address"]', el => el.innerText).catch(() => "N/A");
        const cleanFullAddress = fullAddress.replace('\n', '').replace('', '').trim();

        if (cleanFullAddress === "N/A" || !cleanFullAddress) return 0;

        const urlCoords = page.url().match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || page.url().match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
        let latitude = urlCoords ? parseFloat(urlCoords[1]) : 0;
        let longitude = urlCoords ? parseFloat(urlCoords[2]) : 0;

        let portfolio = await extractPortfolio(page);
        if (portfolio.length === 0) { await page.waitForTimeout(2000); portfolio = await extractPortfolio(page); }

        const provider = {
            id: `rental_${cleanPhone}`,
            businessName: businessName,
            primaryCategoryId: categoryId,
            subcategory: subcategory,
            experienceYears: 4,
            serviceMode: "Local",
            city: city, locality: city, state: state,
            startingPrice: 0, priceUnit: "Per Day",
            whatsappNumber: cleanPhone, callNumber: cleanPhone,
            aboutDescription: `Professional ${subcategory} equipment available for rent in ${city}. Quality equipment guaranteed by verified local owners.`,
            isApproved: true, isVerified: false, rating: 0.0,
            profilePhotoUrl: portfolio[0] ? portfolio[0].split('=')[0] + '=w500-h500-k-no' : "",
            recommendationCount: 0, portfolioUrls: portfolio,
            searchKeywords: [businessName, city, subcategory, state],
            lastSeen: Date.now(), callCount: 0, fullAddress: cleanFullAddress,
            isNumberHidden: false, referredBy: "RENTAL_SCRAPER", referralBonusPaid: false, fcmToken: "",
            notificationsEnabled: true, latitude: latitude, longitude: longitude
        };

        firestoreBuffer.push(provider); sheetBuffer.push(provider);

        if (sheetBuffer.length >= BATCH_LIMIT || firestoreBuffer.length >= BATCH_LIMIT) await flushBuffers();
        const finalPhone = cleanPhone.replace(/[^0-9]/g, '').slice(-10);
        console.log(`Rental Worker ${WORKER_ID} | 🎉 | ADDED RENTAL | ${businessName} | Phone: ${finalPhone} (Total: ${++newLeadsCount})`);
        registry.add(cleanPhone);
        return 1;
    } catch (err) { return 0; }
}

async function scrapeCombination(page, city, state, categoryId, subcategory) {
    if (isStopping || page.isClosed()) return 0;
    try {
        await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(subcategory + " in " + city + ", " + state)}`, { timeout: 60000, waitUntil: 'domcontentloaded' }).catch(() => {});

        const status = await Promise.race([
            page.waitForSelector('a.hfpxzc', { timeout: 35000 }).then(() => "LIST").catch(() => new Promise(() => {})),
            page.waitForSelector('h1.DUwDvf', { timeout: 25000 }).then(() => "SINGLE").catch(() => new Promise(() => {})),
            page.waitForSelector('div.fvP2If', { timeout: 15000 }).then(() => "EMPTY").catch(() => new Promise(() => {})),
            page.waitForTimeout(40000).then(() => "TIMEOUT")
        ]);

        if (status === "EMPTY" || status === "TIMEOUT") return 0;

        if (status === "SINGLE") {
            const name = await page.$eval('h1.DUwDvf', el => el.innerText).catch(() => "Unknown");
            if (name.trim().toLowerCase() === city.trim().toLowerCase() || name.trim().toLowerCase() === state.trim().toLowerCase()) {
                return 0;
            }
            return await scrapeIndividualProfile(page, name, city, state, categoryId, subcategory);
        }

        for (let i = 0; i < 6; i++) {
            if (isStopping || page.isClosed()) break;
            await page.mouse.wheel(0, 3500);
            await page.waitForTimeout(1000);
        }

        let streak = 0;
        let foundCount = 0;
        const MAX_LISTINGS = 60;

        for (let i = 0; i < MAX_LISTINGS; i++) {
            if (isStopping || page.isClosed()) break;
            const listings = await page.$$('a.hfpxzc');
            if (i >= listings.length) break;
            const listing = listings[i];
            const nameRaw = await listing.getAttribute('aria-label').catch(() => "Unknown");

            try {
                await listing.scrollIntoViewIfNeeded({ timeout: 2500 });
                await listing.click({ force: true, timeout: 2500 });
            } catch (clickErr) {
                continue;
            }

            let updated = false;
            for (let r = 0; r < 10; r++) {
                const title = await page.$eval('h1.DUwDvf', el => el.innerText).catch(() => "");
                if (title.toLowerCase().includes(nameRaw.toLowerCase().substring(0, 4))) { updated = true; break; }
                await page.waitForTimeout(800);
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
                }

                if (streak >= 4) {
                    console.log(`Rental Worker ${WORKER_ID} | 🎯 | STREAK HIT | Moving to next sub-category...`);
                    return foundCount;
                }
            }
        }
        return foundCount;
    } catch (e) {
        return -1;
    }
}

async function runOrchestrator() {
    const browser = await chromium.launch({ headless: HEADLESS });
    const context = await browser.newContext();
    const page = await context.newPage();

    await loadProgress();

    // 🚀 LIVE CONFIG & STATE ROUTING FROM RENTAL MAIN HUB SHEET
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
            const state = config.states[sIdx]; progress.stateIndex = sIdx;
            currentTargetUrl = stateUrls[state.name] || RENTAL_HUB_URL;

            let cities = WORKER_ID % 2 === 0 ? [...state.cities].reverse() : [...state.cities];
            for (let catIdx = progress.categoryIndex; catIdx < config.categories.length; catIdx++) {
                if (catIdx % TOTAL_WORKERS !== WORKER_ID) { progress.cityIndex = 0; continue; }

                const category = config.categories[catIdx]; progress.categoryIndex = catIdx;
                console.log(`\nRental Worker ${WORKER_ID} | 📂 | CATEGORY | ${category.name}`);

                for (let cIdx = progress.cityIndex; cIdx < cities.length; cIdx++) {
                    const city = cities[cIdx]; progress.cityIndex = cIdx;
                    console.log(`Rental Worker ${WORKER_ID} | 🏙️ | CITY | Entering City: ${city}`);

                    for (let subIdx = progress.subcategoryIndex; subIdx < category.sub.length; subIdx++) {
                        if (isStopping) break;

                        const subcategory = category.sub[subIdx]; progress.subcategoryIndex = subIdx;

                        console.log(`Rental Worker ${WORKER_ID} | 🏷️ | SCAN | ${subcategory} in ${city}`);
                        const res = await scrapeCombination(page, city, state.name, category.id, subcategory);
                        if (res === -1) { await gracefulShutdown(); return; }

                        await saveProgress();
                    }
                    if (isStopping) break;
                    if (sheetBuffer.length > 0 || firestoreBuffer.length > 0) await flushBuffers();
                    progress.subcategoryIndex = 0;
                }
                if (isStopping) break;
                progress.cityIndex = 0;
            }
            if (isStopping) break;
            progress.categoryIndex = 0;
        }

        await gracefulShutdown();
    } catch (fatal) {
        await gracefulShutdown();
    }
}

runOrchestrator();
