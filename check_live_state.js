const axios = require('axios');

const PROJECT_ID = "kaamwale-3d9b3";
const API_KEY = "AIzaSyANXYQYEKvHsffYp0aD-cslONVZWr2H3dg";
const FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const SERVICE_SATELLITE_URL = "https://script.google.com/macros/s/AKfycbzbK2ij2FS5bQjWYgv3gYdyTohXlJsCQcOXrEn9TArWLTEh3kQU50zvTZa87w9tb2vM/exec";
const RENTAL_SATELLITE_URL = "https://script.google.com/macros/s/AKfycbwuyK4piN5jnYG1WOxIo_xua5BRcORroGHi-6EI04ycI_T-ALlP5eP83lZvN_InpWkyaw/exec";

const PHONE = "9136910676";

async function checkFirestoreDoc(collection, docId) {
    try {
        const url = `${FIRESTORE_BASE_URL}/${collection}/${docId}?key=${API_KEY}`;
        const res = await axios.get(url);
        console.log(`   📌 Firestore [${collection}/${docId}]: EXISTS! (isVerified: ${res.data.fields.isVerified?.booleanValue})`);
    } catch (e) {
        if (e.response && e.response.status === 404) {
            console.log(`   ❌ Firestore [${collection}/${docId}]: DOES NOT EXIST (404)`);
        } else {
            console.log(`   ⚠️ Firestore [${collection}/${docId}]: ${e.message}`);
        }
    }
}

async function checkSheetRow(url, tag) {
    try {
        const res = await axios.get(`${url}?type=providers&nocache=true`, { timeout: 30000 });
        const list = Array.isArray(res.data) ? res.data : [];
        const match = list.filter(p => String(p.whatsappNumber).includes(PHONE) || String(p.callNumber).includes(PHONE) || String(p.id).includes(PHONE));
        console.log(`   📊 Sheet [${tag}]: Found ${match.length} row(s) for ${PHONE}:`);
        match.forEach(p => console.log(`      -> ID: ${p.id} | Name: ${p.businessName} | Verified: ${p.isVerified} | ReferredBy: ${p.referredBy}`));
    } catch (e) {
        console.log(`   ⚠️ Sheet [${tag}] Error: ${e.message}`);
    }
}

async function runCheck() {
    console.log("\n===============================================");
    console.log("🔍 LIVE DIAGNOSIS FOR PHONE 9136910676");
    console.log("===============================================\n");

    console.log("1. FIRESTORE STATUS:");
    await checkFirestoreDoc("providers", "shadow_" + PHONE);
    await checkFirestoreDoc("providers", "k69ijCqMovRxyApVHEmCuNRvPTR2");
    await checkFirestoreDoc("rental_providers", "rental_" + PHONE);
    await checkFirestoreDoc("rental_providers", "k69ijCqMovRxyApVHEmCuNRvPTR2");

    console.log("\n2. GOOGLE SHEETS STATUS:");
    await checkSheetRow(SERVICE_SATELLITE_URL, "Service Sheet (RapidHelp_Providers_MH)");
    await checkSheetRow(RENTAL_SATELLITE_URL, "Rental Sheet (Rental_Maharashtra_Satellite)");

    console.log("\n===============================================\n");
}

runCheck();
