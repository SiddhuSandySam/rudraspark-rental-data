const axios = require('axios');

/**
 * 🧪 TEST CLAIM SYNC DIRECTLY TO RENTAL MAIN HUB
 * Simulates the exact HTTP POST sent by the Android App when claiming.
 */

const RENTAL_HUB_URL = "https://script.google.com/macros/s/AKfycbwyVByXtm5VYsEPOBrGEMYaI8LhYk9ZHq77BaPwruZIKGn9E-ewVhkta-IYf3k7jfhLjA/exec";

const claimPayload = {
    type: "PROVIDER_SYNC",
    id: "k69ijCqMovRxyApVHEmCuNRvPTR2",
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
    whatsappNumber: "9136910676",
    callNumber: "9136910676",
    aboutDescription: "Professional DSLR Camera & Studio Gear available for rent in Wahal, Navi Mumbai. High quality equipment guaranteed.",
    isApproved: true,
    isVerified: true,
    rating: 0.0,
    profilePhotoUrl: "https://lh3.googleusercontent.com/p/AF1QipM52XqY=s1000",
    recommendationCount: 0,
    portfolioUrls: ["https://lh3.googleusercontent.com/p/AF1QipM52XqY=s1000"],
    searchKeywords: ["Sandesh Koli", "Wahal", "DSLR Camera Rent", "Maharashtra"],
    lastSeen: Date.now(),
    callCount: 0,
    fullAddress: "Ulwe, Wahal, Navi Mumbai, Maharashtra 410206",
    isNumberHidden: false,
    referredBy: "USER_CLAIMED_RENTAL",
    referralBonusPaid: false,
    fcmToken: "",
    notificationsEnabled: true,
    latitude: 18.9568587,
    longitude: 73.0352081
};

async function testClaimSync() {
    console.log("🚀 Sending Claim Sync Payload to Rental Main Hub...");
    try {
        const response = await axios.post(RENTAL_HUB_URL, claimPayload, { timeout: 60000 });
        console.log("   ✅ Hub Response:", response.data);
    } catch (e) {
        console.error("   ❌ Sync Failed:", e.message);
    }
}

testClaimSync();
