const axios = require('axios');

const SERVICE_HUB_URL = "https://script.google.com/macros/s/AKfycbwusItVLmzBrHG_kTXCno7pjLoQRMlnmN6vps8QvgHf3oxEA6eSuSNg0KmsBxYAcsPKeg/exec";
const PROJECT_ID = "kaamwale-3d9b3";
const API_KEY = "AIzaSyANXYQYEKvHsffYp0aD-cslONVZWr2H3dg";
const FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const PHONE = "9136910676";
const UID = "k69ijCqMovRxyApVHEmCuNRvPTR2";

async function prepareServiceShadow() {
    console.log("🛠️ Preparing Fresh Service Shadow Profile for 9136910676...");

    // Delete existing claimed user doc from Firestore providers
    try {
        await axios.delete(`${FIRESTORE_BASE_URL}/providers/${UID}?key=${API_KEY}`);
        console.log("   ✅ Deleted claimed doc providers/" + UID + " from Firestore");
    } catch (e) {}

    const serviceShadow = {
        id: `shadow_${PHONE}`,
        businessName: "Sandesh Koli Spring Boot Services",
        primaryCategoryId: "cat_tech",
        subcategory: "Spring Boot Developer",
        experienceYears: 4,
        serviceMode: "Remote & Onsite",
        city: "Wahal",
        locality: "Ulwe, Wahal",
        state: "Maharashtra",
        startingPrice: 5000,
        priceUnit: "Per Project",
        whatsappNumber: PHONE,
        callNumber: PHONE,
        aboutDescription: "Professional Spring Boot Developer services in Wahal, Maharashtra. Contact for quality tech solutions.",
        isApproved: true,
        isVerified: false,
        rating: 0.0,
        profilePhotoUrl: "https://lh3.googleusercontent.com/p/AF1QipN32QzTq2_s_1a=s1000",
        recommendationCount: 0,
        portfolioUrls: ["https://lh3.googleusercontent.com/p/AF1QipN32QzTq2_s_1a=s1000"],
        searchKeywords: ["Sandesh Koli", "Wahal", "Spring Boot Developer", "Maharashtra"],
        lastSeen: Date.now(),
        callCount: 0,
        fullAddress: "Ulwe, Wahal, Navi Mumbai, Maharashtra 410206",
        isNumberHidden: false,
        referredBy: "SYSTEM_SCRAPER",
        referralBonusPaid: false,
        fcmToken: "",
        notificationsEnabled: true,
        latitude: 18.9568587,
        longitude: 73.0352081
    };

    // Save shadow to Firestore
    try {
        const fields = {};
        for (const [key, val] of Object.entries(serviceShadow)) {
            if (typeof val === 'string') fields[key] = { stringValue: val };
            else if (typeof val === 'number') {
                if (Number.isInteger(val)) fields[key] = { integerValue: String(val) };
                else fields[key] = { doubleValue: val };
            }
            else if (typeof val === 'boolean') fields[key] = { booleanValue: val };
            else if (Array.isArray(val)) {
                fields[key] = { arrayValue: { values: val.map(v => ({ stringValue: String(v) })) } };
            }
        }
        await axios.patch(`${FIRESTORE_BASE_URL}/providers/shadow_${PHONE}?key=${API_KEY}`, { fields });
        console.log("   🎉 Created Firestore shadow_9136910676");
    } catch (e) {
        console.error("   ❌ Firestore Shadow Fail:", e.message);
    }

    // Save shadow to Service Google Sheet with persistent retry
    let success = false;
    let attempt = 0;
    while (!success) {
        attempt++;
        try {
            const res = await axios.post(SERVICE_HUB_URL, {
                type: "BATCH_PROVIDER_SYNC",
                providers: [serviceShadow]
            }, { timeout: 60000 });
            const dataStr = String(res.data || "");
            if (dataStr.includes("Success") || dataStr.includes("Complete")) {
                console.log("   🎉 Service Sheet Response:", dataStr);
                success = true;
            } else {
                console.warn(`   ⚠️ Service Sheet Busy (Attempt ${attempt}): ${dataStr.substring(0, 80)}. Retrying in 5s...`);
                await new Promise(r => setTimeout(r, 5000));
            }
        } catch (e) {
            console.error(`   ❌ Service Sheet Error (Attempt ${attempt}): ${e.message}. Retrying in 5s...`);
            await new Promise(r => setTimeout(r, 5000));
        }
    }
}

prepareServiceShadow();
