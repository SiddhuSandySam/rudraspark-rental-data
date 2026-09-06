const axios = require('axios');

const PROJECT_ID = "kaamwale-3d9b3";
const API_KEY = "AIzaSyANXYQYEKvHsffYp0aD-cslONVZWr2H3dg";
const FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const PHONE = "9136910676";
const UID = "k69ijCqMovRxyApVHEmCuNRvPTR2";
const STATE = "Maharashtra";

async function deleteFirestoreDoc(collection, docId) {
    try {
        const url = `${FIRESTORE_BASE_URL}/${collection}/${docId}?key=${API_KEY}`;
        await axios.delete(url);
        console.log(`   ✅ Firestore Deleted: ${collection}/${docId}`);
    } catch (e) {
        if (e.response && e.response.status === 404) {
            console.log(`   ℹ️ Firestore Doc Already Clean: ${collection}/${docId}`);
        }
    }
}

async function createFirestoreShadowDoc(collection, docId, data) {
    try {
        const url = `${FIRESTORE_BASE_URL}/${collection}/${docId}?key=${API_KEY}`;
        const fields = {};

        for (const [key, val] of Object.entries(data)) {
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

        await axios.patch(url, { fields });
        console.log(`   🎉 Firestore Shadow Created: ${collection}/${docId}`);
    } catch (e) {
        console.error(`   ❌ Firestore Shadow Creation Fail [${collection}/${docId}]:`, e.response ? JSON.stringify(e.response.data) : e.message);
    }
}

async function seedFirestoreOnly() {
    console.log("\n===============================================");
    console.log("🔥 SEEDING FIRESTORE WITH EXACT SAME DATA");
    console.log("===============================================\n");

    // 1. Delete claimed docs
    await deleteFirestoreDoc("providers", UID);
    await deleteFirestoreDoc("providers", `shadow_${PHONE}`);
    await deleteFirestoreDoc("rental_providers", UID);
    await deleteFirestoreDoc("rental_providers", `rental_${PHONE}`);

    // 2. Service Shadow Profile
    const serviceShadow = {
        id: `shadow_${PHONE}`,
        businessName: "Sandesh Koli Spring Boot Services",
        primaryCategoryId: "cat_tech",
        subcategory: "Spring Boot Developer",
        experienceYears: 4,
        serviceMode: "Remote & Onsite",
        city: "Wahal",
        locality: "Ulwe, Wahal",
        state: STATE,
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
        lastSeen: 1788705314597,
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

    // 3. Rental Shadow Profile
    const rentalShadow = {
        id: `rental_${PHONE}`,
        businessName: "Sandesh Koli DSLR Camera & Studio Gear Rentals",
        primaryCategoryId: "cat_camera_rent",
        subcategory: "DSLR Camera Rent",
        experienceYears: 4,
        serviceMode: "Local",
        city: "Wahal",
        locality: "Ulwe, Wahal",
        state: STATE,
        startingPrice: 1000,
        priceUnit: "Per Day",
        whatsappNumber: PHONE,
        callNumber: PHONE,
        aboutDescription: "Professional DSLR Camera & Studio Gear available for rent in Wahal, Navi Mumbai. High quality equipment guaranteed.",
        isApproved: true,
        isVerified: false,
        rating: 0.0,
        profilePhotoUrl: "https://lh3.googleusercontent.com/p/AF1QipM52XqY=s1000",
        recommendationCount: 0,
        portfolioUrls: ["https://lh3.googleusercontent.com/p/AF1QipM52XqY=s1000"],
        searchKeywords: ["Sandesh Koli", "Wahal", "DSLR Camera Rent", "Maharashtra"],
        lastSeen: 1788708400000,
        callCount: 0,
        fullAddress: "Ulwe, Wahal, Navi Mumbai, Maharashtra 410206",
        isNumberHidden: false,
        referredBy: "RENTAL_SCRAPER",
        referralBonusPaid: false,
        fcmToken: "",
        notificationsEnabled: true,
        latitude: 18.9568587,
        longitude: 73.0352081
    };

    await createFirestoreShadowDoc("providers", `shadow_${PHONE}`, serviceShadow);
    await createFirestoreShadowDoc("rental_providers", `rental_${PHONE}`, rentalShadow);

    console.log("\n===============================================");
    console.log("✨ FIRESTORE SEEDED! EXACT SAME DATA MATCHED!");
    console.log("===============================================\n");
}

seedFirestoreOnly();
