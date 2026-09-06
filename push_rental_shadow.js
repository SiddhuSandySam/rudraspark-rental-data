const axios = require('axios');

const RENTAL_HUB_URL = "https://script.google.com/macros/s/AKfycbwyVByXtm5VYsEPOBrGEMYaI8LhYk9ZHq77BaPwruZIKGn9E-ewVhkta-IYf3k7jfhLjA/exec";
const PHONE = "9136910676";

const rentalShadow = {
    id: `rental_${PHONE}`,
    businessName: "Sandesh Koli DSLR Camera & Studio Gear Rentals",
    primaryCategoryId: "cat_camera_rent",
    subcategory: "DSLR Camera Rent",
    experienceYears: 4,
    serviceMode: "Local",
    city: "Wahal",
    locality: "Ulwe, Wahal",
    state: "Maharashtra",
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
    lastSeen: Date.now(),
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

async function pushRentalShadow() {
    console.log("📦 Pushing Rental Shadow Profile (rental_9136910676) to Rental Main Hub...");
    let success = false;
    let attempt = 0;
    while (!success) {
        attempt++;
        try {
            const res = await axios.post(RENTAL_HUB_URL, {
                type: "BATCH_PROVIDER_SYNC",
                providers: [rentalShadow]
            }, { timeout: 60000 });
            const dataStr = String(res.data || "");
            if (dataStr.includes("Success") || dataStr.includes("Complete")) {
                console.log("   🎉 Rental Hub Response:", dataStr);
                success = true;
            } else {
                console.warn(`   ⚠️ Rental Hub Busy (Attempt ${attempt}): ${dataStr.substring(0, 80)}. Retrying in 5s...`);
                await new Promise(r => setTimeout(r, 5000));
            }
        } catch (e) {
            console.error(`   ❌ Rental Hub Error (Attempt ${attempt}): ${e.message}. Retrying in 5s...`);
            await new Promise(r => setTimeout(r, 5000));
        }
    }
}

pushRentalShadow();
