const axios = require('axios');

/**
 * 🧪 TEST SATELLITE ENGINE DEDUPLICATION & IN-PLACE OVERWRITE
 */

const KAAMWALE_MH_SATELLITE = "https://script.google.com/macros/s/AKfycbzbK2ij2FS5bQjWYgv3gYdyTohXlJsCQcOXrEn9TArWLTEh3kQU50zvTZa87w9tb2vM/exec";
const RENTAL_MH_SATELLITE = "https://script.google.com/macros/s/AKfycbwuyK4piN5jnYG1WOxIo_xua5BRcORroGHi-6EI04ycI_T-ALlP5eP83lZvN_InpWkyaw/exec";

const PHONE = "9136910676";
const UID = "k69ijCqMovRxyApVHEmCuNRvPTR2";

async function testInPlaceOverwrite() {
    console.log("🚀 Testing In-Place Phone Match & Overwrite on KaamWale Service Satellite Sheet...");

    const claimPayload = {
        type: "PROVIDER_SYNC",
        providers: [{
            id: UID,
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
            whatsappNumber: PHONE,
            callNumber: PHONE,
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
        }]
    };

    try {
        const res = await axios.post(KAAMWALE_MH_SATELLITE, claimPayload, { timeout: 60000 });
        console.log("   ✅ Direct KaamWale Satellite Response:", res.data);
    } catch (e) {
        console.error("   ❌ Direct Sync Failed:", e.message);
    }
}

testInPlaceOverwrite();
