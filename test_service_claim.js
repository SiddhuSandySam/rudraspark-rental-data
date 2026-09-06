const axios = require('axios');

const SERVICE_HUB_URL = "https://script.google.com/macros/s/AKfycbwusItVLmzBrHG_kTXCno7pjLoQRMlnmN6vps8QvgHf3oxEA6eSuSNg0KmsBxYAcsPKeg/exec";

const servicePayload = {
    type: "PROVIDER_SYNC",
    id: "k69ijCqMovRxyApVHEmCuNRvPTR2",
    businessName: "Sandesh Koli Spring Boot Developer Services",
    primaryCategoryId: "cat_tech",
    subcategory: "Spring Boot Developer",
    experienceYears: 4,
    serviceMode: "Remote & Onsite",
    city: "Wahal",
    locality: "Ulwe, Wahal",
    state: "Maharashtra",
    startingPrice: 5000,
    priceUnit: "Per Project",
    whatsappNumber: "9136910676",
    callNumber: "9136910676",
    aboutDescription: "Professional Spring Boot Developer services in Wahal, Maharashtra. Contact for quality tech solutions.",
    isApproved: true,
    isVerified: true,
    rating: 0.0,
    profilePhotoUrl: "https://lh3.googleusercontent.com/p/AF1QipN32QzTq2_s_1a=s1000",
    recommendationCount: 0,
    portfolioUrls: ["https://lh3.googleusercontent.com/p/AF1QipN32QzTq2_s_1a=s1000"],
    searchKeywords: ["Sandesh Koli", "Wahal", "Spring Boot Developer", "Maharashtra"],
    lastSeen: Date.now(),
    callCount: 0,
    fullAddress: "Ulwe, Wahal, Navi Mumbai, Maharashtra 410206",
    isNumberHidden: false,
    referredBy: "USER_CLAIMED",
    referralBonusPaid: false,
    fcmToken: "",
    notificationsEnabled: true,
    latitude: 18.9568587,
    longitude: 73.0352081
};

async function testServiceClaim() {
    console.log("🚀 Sending Service Claim Sync Payload to Service Main Hub...");
    try {
        const response = await axios.post(SERVICE_HUB_URL, servicePayload, { timeout: 60000 });
        console.log("   ✅ Service Hub Response:", response.data);
    } catch (e) {
        console.error("   ❌ Service Sync Failed:", e.message);
    }
}

testServiceClaim();
