const { chromium } = require('playwright');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * 🚀 RUDRASPARK RENTAL HYBRID IMAGE REFRESHER & REPAIR
 * Handles image refreshing & portfolio repairs for Rental items.
 */

const args = process.argv.slice(2);
const WORKER_ID = args[0] !== undefined ? parseInt(args[0]) : 0;
const TOTAL_WORKERS = args[1] !== undefined ? parseInt(args[1]) : 1;

const RENTAL_HUB_URL = "https://script.google.com/macros/s/AKfycbwyVByXtm5VYsEPOBrGEMYaI8LhYk9ZHq77BaPwruZIKGn9E-ewVhkta-IYf3k7jfhLjA/exec";
const CONFIG_FILE = path.join(__dirname, 'config.json');

const summary = { updated: [], discovered: [], deactivated: [] };
let syncBatch = [];
let doneBatch = [];

let config = { states: [] };
if (fs.existsSync(CONFIG_FILE)) {
    try { config = JSON.parse(fs.readFileSync(CONFIG_FILE)); } catch (e) {}
}

function writeLog(msg) {
    const timestamp = new Date().toLocaleString();
    console.log(`[Rental-Refresher-W${WORKER_ID}] [${timestamp}] ${msg}`);
    fs.appendFileSync(path.join(__dirname, `refresh_logs_W${WORKER_ID}.txt`), `[${timestamp}] ${msg}\n`);
}

async function flushBatches() {
    writeLog("⚡ STARTING RENTAL BATCH FLUSH...");
    if (syncBatch.length > 0) {
        const leadsToSync = [...syncBatch];
        writeLog(`📤 Syncing ${leadsToSync.length} rental leads to Sheet...`);

        let success = false;
        let attempt = 0;
        while (!success) {
            attempt++;
            try {
                const r = await axios.post(RENTAL_HUB_URL, { type: "BATCH_PROVIDER_SYNC", providers: leadsToSync }, { timeout: 180000 });
                const resData = String(r.data || "");
                const logData = resData.length > 100 ? resData.substring(0, 100) + "..." : resData;

                if (resData.includes("Success") || resData.includes("Complete") || resData.includes("Maharashtra") || resData.includes("config") || resData.includes("already exists")) {
                    writeLog(`   ✅ Hub Response [A${attempt}]: ${logData}`);
                    syncBatch = syncBatch.filter(p => !leadsToSync.includes(p));
                    success = true;
                } else if (resData.includes("Lock timeout")) {
                    writeLog(`   ⚠️ Server Lock Busy (Attempt ${attempt}). Sleeping 15s before retry...`);
                    await new Promise(r => setTimeout(r, 15000));
                } else {
                    writeLog(`   ❌ Server Error [A${attempt}]: ${logData}. Retrying in 10s...`);
                    await new Promise(r => setTimeout(r, 10000));
                }
            } catch (e) {
                writeLog(`   ⚠️ Sync Attempt ${attempt} Network Fail: ${e.message}. Retrying in 15s...`);
                await new Promise(r => setTimeout(r, 15000));
            }
        }
    }

    if (doneBatch.length > 0) {
        const idsToClean = [...doneBatch];
        writeLog(`🧹 Cleaning ${idsToClean.length} items from Rental Queue...`);
        let success = false;
        let attempt = 0;
        while (!success) {
            attempt++;
            try {
                const r = await axios.post(RENTAL_HUB_URL, { type: "MARK_REFRESH_DONE", ids: idsToClean }, { timeout: 180000 });
                const resData = String(r.data || "");
                const logData = resData.length > 100 ? resData.substring(0, 100) + "..." : resData;

                if (resData.includes("Success") || resData.includes("Cleaned") || resData.includes("Complete")) {
                    doneBatch = doneBatch.filter(id => !idsToClean.includes(id));
                    writeLog(`   ✅ Queue Cleanup Response [A${attempt}]: ${logData}`);
                    success = true;
                } else if (resData.includes("Lock timeout")) {
                    writeLog(`   ⚠️ Cleanup Fail [A${attempt}]: ${logData}. Sleeping 15s before retry...`);
                    await new Promise(r => setTimeout(r, 15000));
                } else {
                    writeLog(`   ⚠️ Cleanup Fail [A${attempt}]: ${logData}. Retrying in 10s...`);
                    await new Promise(r => setTimeout(r, 10000));
                }
            } catch (e) {
                writeLog(`   ⚠️ Cleanup Exception [A${attempt}]: ${e.message}. Retrying in 15s...`);
                await new Promise(r => setTimeout(r, 15000));
            }
        }
    }
    writeLog("⚡ RENTAL BATCH FLUSH COMPLETED.");
}

async function extractPhone(page) {
    const selectors = ['button[data-item-id^="phone"]', 'button[aria-label*="Phone"]', '.CsEnBe[aria-label*="Phone"]', 'a[href^="tel:"]'];
    for (let sel of selectors) {
        try {
            const text = await page.$eval(sel, el => el.innerText || el.getAttribute('aria-label') || el.getAttribute('href') || "");
            const clean = text.replace(/[^0-9]/g, '');
            if (clean.length >= 8) return clean;
        } catch (e) {}
    }
    return "NOT_FOUND";
}

async function extractPortfolio(page) {
    try {
        writeLog("   📸 Deep Scraping Rental Portfolio...");
        if (page.isClosed()) return [];

        const topTab = await page.$('button[data-value="Photos"], button[aria-label^="Photos"], a[aria-label^="Photos"]');
        let galleryOpened = false;

        if (topTab && await topTab.isVisible()) {
            try {
                await topTab.click({ force: true, timeout: 3000 });
                await page.waitForTimeout(3000);
                galleryOpened = true;
            } catch (e) {}
        }

        if (!galleryOpened) {
            const mainImg = await page.$('button[aria-label^="Photo of"], img[src*="googleusercontent.com/p/"]');
            if (mainImg && await mainImg.isVisible()) {
                try {
                    await mainImg.click({ force: true, timeout: 3000 });
                    await page.waitForTimeout(3000);
                    galleryOpened = true;
                } catch (e) {}
            }
        }

        const allUrls = new Set();
        const loopCount = galleryOpened ? 20 : 8;

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

        const portfolio = Array.from(allUrls).filter(u => !u.includes('mapslogo')).slice(0, 35);

        if (galleryOpened) {
            try { await page.keyboard.press('Escape'); } catch (escErr) {}
            const closeSelectors = ['button[aria-label="Back"]', 'button[aria-label="Close"]', '.VfPpkd-icon-LgbsSe'];
            for (let sel of closeSelectors) {
                const btn = await page.$(sel);
                if (btn && await btn.isVisible()) {
                    try { await btn.click({ force: true, timeout: 3000 }); } catch (clickErr) {}
                    await page.waitForTimeout(1000);
                    break;
                }
            }
        }

        return portfolio;
    } catch (e) { return []; }
}

async function processProfile(page, task, dbPhone, nameRaw) {
    try {
        writeLog(`   🔍 Processing Rental Profile: ${nameRaw}`);

        let titleMatched = false;
        for (let r = 0; r < 5; r++) {
            const mapsTitle = await page.$eval('h1.DUwDvf', el => el.innerText).catch(() => "");
            if (mapsTitle.toLowerCase().includes(nameRaw.toLowerCase().substring(0, 5))) {
                titleMatched = true;
                break;
            }
            await page.waitForTimeout(1000);
        }

        if (!titleMatched) {
            writeLog(`   🛑 Skip: Profile Title Mismatch. (Expected: ${nameRaw})`);
            return false;
        }

        const mapsPhone = await extractPhone(page);
        const cleanMapsPhone = mapsPhone !== "NOT_FOUND" ? mapsPhone.replace(/[^0-9]/g, '').slice(-10) : "NOT_FOUND";
        writeLog(`   📱 Maps Phone: ${cleanMapsPhone} | Expected: ${dbPhone}`);

        const isMatch = (cleanMapsPhone !== "NOT_FOUND") && (dbPhone.includes(cleanMapsPhone) || cleanMapsPhone.includes(dbPhone));

        const url = page.url();
        let lat = 0, lon = 0;
        const pm = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
        if (pm) { lat = parseFloat(pm[1]); lon = parseFloat(pm[2]); }

        const addrRaw = await page.$eval('button[data-item-id="address"]', el => el.innerText).catch(() => "N/A");
        const cleanAddr = addrRaw.replace('\n', '').replace('', '').trim();
        if (cleanAddr === "N/A" || !cleanAddr) { writeLog("   🛑 Skip: No valid address found."); return false; }

        const portfolio = await extractPortfolio(page);
        if (portfolio.length === 0) { writeLog("   🛑 Skip: No portfolio images extracted."); return false; }

        const provider = {
            id: isMatch ? task.id : `rental_${cleanMapsPhone}`,
            businessName: nameRaw, primaryCategoryId: task.categoryId, subcategory: task.subcategory,
            experienceYears: 4, serviceMode: "Local",
            city: task.city, locality: task.city, state: task.state,
            startingPrice: 0, priceUnit: "Per Day",
            whatsappNumber: cleanMapsPhone, callNumber: cleanMapsPhone,
            aboutDescription: `Professional ${task.subcategory} equipment available for rent in ${task.city}.`,
            isApproved: true, isVerified: false, rating: 0.0,
            profilePhotoUrl: portfolio[0] ? portfolio[0].split('=')[0] + '=w500-h500-k-no' : "",
            recommendationCount: 0, portfolioUrls: portfolio,
            searchKeywords: [nameRaw, task.city, task.subcategory, task.state],
            lastSeen: Date.now(), callCount: 0, fullAddress: cleanAddr,
            isNumberHidden: false, referredBy: "RENTAL_REFRESHER",
            referralBonusPaid: false, fcmToken: "", notificationsEnabled: true,
            latitude: lat, longitude: lon
        };

        syncBatch.push(provider);
        writeLog(`   📦 Added to Batch (${syncBatch.length}/10) | Type: ${isMatch ? "REPAIR" : "DISCOVERY"}`);
        if (isMatch) summary.updated.push(`${nameRaw} (${dbPhone})`);
        else summary.discovered.push(`${nameRaw} (${cleanMapsPhone})`);
        return true;
    } catch (e) { writeLog(`   ⚠️ Profile Error: ${e.message}`); return false; }
}

async function runWorker() {
    writeLog(`🚀 RudraSpark Rental Image Refresher Starting...`);
    try {
        const queueResp = await axios.post(RENTAL_HUB_URL, { type: "GET_REFRESH_QUEUE" });
        const allTasks = Array.isArray(queueResp.data) ? queueResp.data : [];
        if (allTasks.length === 0) return writeLog("✅ Queue Empty. Exiting.");
        const myTasks = allTasks.filter((_, index) => index % TOTAL_WORKERS === WORKER_ID);
        writeLog(`📋 My Tasks: ${myTasks.length} assigned.`);

        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();

        for (const task of myTasks) {
            if (!task.city || !task.categoryId || !task.subcategory) { doneBatch.push(task.id); continue; }
            const dbPhone = String(task.id).replace('rental_', '');
            const searchQuery = `${task.name}, ${task.city}, ${task.state}`;
            writeLog(`\n━━━━━━━━━━━━━━ TASK: ${task.name} ━━━━━━━━━━━━━━`);
            try {
                await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`, { timeout: 60000 });
                await page.waitForTimeout(4000);
                const status = await Promise.race([
                    page.waitForSelector('a.hfpxzc', { timeout: 15000 }).then(() => "LIST").catch(() => null),
                    page.waitForSelector('h1.DUwDvf', { timeout: 15000 }).then(() => "SINGLE").catch(() => null)
                ]);
                if (status === "SINGLE") {
                    const name = await page.$eval('h1.DUwDvf', el => el.innerText).catch(() => "Unknown");
                    await processProfile(page, task, dbPhone, name);
                } else if (status === "LIST") {
                    const listings = await page.$$('a.hfpxzc');
                    for (let i = 0; i < Math.min(listings.length, 5); i++) {
                        const items = await page.$$('a.hfpxzc');
                        if (!items[i]) break;
                        const nameRaw = await items[i].getAttribute('aria-label').catch(() => "Unknown");
                        await items[i].click({ force: true });
                        await page.waitForTimeout(3000);
                        if (await processProfile(page, task, dbPhone, nameRaw)) break;
                        const back = await page.$('button[aria-label*="Back"]');
                        if (back) { await back.click(); await page.waitForTimeout(1500); }
                    }
                }
                doneBatch.push(task.id);
                if (syncBatch.length >= 10 || doneBatch.length >= 10) await flushBatches();
            } catch (err) { writeLog(`❌ Loop Error: ${err.message}`); }
        }
        await flushBatches();
        await browser.close();
        writeLog("\n" + "=".repeat(50));
        writeLog("📊 RENTAL REFRESHER SUMMARY");
        writeLog(`✅ UPDATED: ${summary.updated.length}\n🌟 DISCOVERED: ${summary.discovered.length}`);
        writeLog("=".repeat(50));
    } catch (e) { writeLog(`🔥 Fatal Error: ${e.message}`); }
}
runWorker();
