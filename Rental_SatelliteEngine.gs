/**
 * 🛰️ RUDRASPARK RENTAL SATELLITE ENGINE
 * Handles display values, 10-digit phone mapping, and in-place row updates on Claiming.
 */
function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return ContentService.createTextOutput("Error: SS not found").setMimeType(ContentService.MimeType.JSON);
  var params = e.parameter || {};
  var type = params.type;
  var cityParam = params.city;
  var offset = parseInt(params.offset || 0);
  var limit = parseInt(params.limit || 200);

  var sheet = ss.getSheetByName("Providers") || ss.getSheets()[0];
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);

  if (type === "get_ids") {
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues().flat().map(String);
    return ContentService.createTextOutput(JSON.stringify(ids)).setMimeType(ContentService.MimeType.JSON);
  }

  if (type === "providers") {
    var allData = sheet.getRange(2, 1, lastRow - 1, 31).getDisplayValues();
    var filtered = [];
    for (var i = 0; i < allData.length; i++) {
      filtered.push(mapRowToProvider(allData[i]));
    }
    if (cityParam && cityParam.length > 2) {
      filtered = filtered.filter(function(p) {
        return p.city.toLowerCase().indexOf(cityParam.toLowerCase()) !== -1 || p.locality.toLowerCase().indexOf(cityParam.toLowerCase()) !== -1;
      });
    }
    var paged = filtered.slice(offset, offset + limit);
    return ContentService.createTextOutput(JSON.stringify(paged)).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    var data = JSON.parse(e.postData.contents);
    var type = (data.type || "").toUpperCase();
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Providers") || ss.getSheets()[0];

    if (type === "BATCH_PROVIDER_SYNC" || type === "PROVIDER_SYNC") {
      var providers = data.providers || [data];
      var lastRow = sheet.getLastRow();
      var idMap = {};
      var phoneMap = {};

      if (lastRow > 1) {
        // 🚀 CRITICAL FIX: Use getDisplayValues() to prevent scientific notation (9.13691E+09)
        var dataMatrix = sheet.getRange(2, 1, lastRow - 1, 31).getDisplayValues();
        for (var i = 0; i < dataMatrix.length; i++) {
          var idInSheet = String(dataMatrix[i][0] || "").trim();
          if (idInSheet) idMap[idInSheet] = i + 2;

          var wPhone = String(dataMatrix[i][11] || "").replace(/[^0-9]/g, "").slice(-10);
          var cPhone = String(dataMatrix[i][12] || "").replace(/[^0-9]/g, "").slice(-10);
          if (wPhone.length === 10) phoneMap[wPhone] = i + 2;
          if (cPhone.length === 10) phoneMap[cPhone] = i + 2;
        }
      }

      var rowsToAdd = [];
      providers.forEach(function(p) {
        var providerId = String(p.id || "").trim();
        var inPhone = String(p.whatsappNumber || p.callNumber || p.id || "").replace(/[^0-9]/g, "").slice(-10);

        // 🚀 IN-PLACE MATCH: Matches by ID or 10-digit phone
        var rowIdx = idMap[providerId] || phoneMap[inPhone];

        var rowData = [
          p.id || "",
          p.businessName || "",
          p.primaryCategoryId || "",
          p.subcategory || "",
          p.experienceYears || 0,
          p.serviceMode || "Local",
          p.city || "",
          p.locality || "",
          p.state || "Maharashtra",
          p.startingPrice || 0,
          p.priceUnit || "Per Day",
          p.whatsappNumber || "",
          p.callNumber || p.whatsappNumber || "",
          p.aboutDescription || "",
          (p.isApproved === true || String(p.isApproved).toUpperCase() === "TRUE"),
          (p.isVerified === true || String(p.isVerified).toUpperCase() === "TRUE"),
          p.rating || 0.0,
          p.profilePhotoUrl || "",
          p.recommendationCount || 0,
          Array.isArray(p.portfolioUrls) ? p.portfolioUrls.join(",") : (p.portfolioUrls || ""),
          Array.isArray(p.searchKeywords) ? p.searchKeywords.join(",") : (p.searchKeywords || ""),
          Date.now(),
          p.callCount || 0,
          p.fullAddress || "",
          (p.isNumberHidden === true || String(p.isNumberHidden).toUpperCase() === "TRUE"),
          p.referredBy || "USER_CLAIMED",
          (p.referralBonusPaid === true || String(p.referralBonusPaid).toUpperCase() === "TRUE"),
          p.fcmToken || "",
          (p.notificationsEnabled === true || String(p.notificationsEnabled).toUpperCase() === "TRUE"),
          p.latitude || 0,
          p.longitude || 0
        ];

        if (rowIdx) {
          // 🚀 OVERWRITE EXISTING SHADOW ROW IN-PLACE
          sheet.getRange(rowIdx, 1, 1, 31).setValues([rowData]);
        } else {
          rowsToAdd.push(rowData);
          idMap[providerId] = lastRow + rowsToAdd.length + 1;
        }
      });

      if (rowsToAdd.length > 0) {
        sheet.getRange(sheet.getLastRow() + 1, 1, rowsToAdd.length, 31).setValues(rowsToAdd);
      }
      return ContentService.createTextOutput("Success");
    }

    if (type === "DELETE_ENTRIES") {
      var ids = data.ids || [data.id];
      var idValues = sheet.getRange(1, 1, sheet.getLastRow(), 1).getDisplayValues().flat().map(String);
      ids.forEach(function(id) {
        var rowNum = idValues.indexOf(String(id).trim()) + 1;
        if (rowNum > 1) {
          sheet.getRange(rowNum, 15).setValue(false);
          sheet.getRange(rowNum, 22).setValue(Date.now());
        }
      });
      return ContentService.createTextOutput("Deactivated");
    }
    return ContentService.createTextOutput("Done");
  } catch (error) {
    return ContentService.createTextOutput("Error: " + error.toString());
  } finally {
    lock.releaseLock();
  }
}

function mapRowToProvider(r) {
  return {
    "id": String(r[0] || ""), "businessName": String(r[1] || ""), "primaryCategoryId": String(r[2] || ""), "subcategory": String(r[3] || ""),
    "experienceYears": parseInt(r[4]) || 0, "serviceMode": String(r[5] || "Local"), "city": String(r[6] || ""), "locality": String(r[7] || ""),
    "state": String(r[8] || ""), "startingPrice": parseInt(r[9]) || 0, "priceUnit": String(r[10] || "Per Day"), "whatsappNumber": String(r[11] || ""),
    "callNumber": String(r[12] || ""), "aboutDescription": String(r[13] || ""), "isApproved": (r[14] === true || String(r[14]).toUpperCase() === "TRUE"),
    "isVerified": (r[15] === true || String(r[15]).toUpperCase() === "TRUE"), "rating": parseFloat(r[16]) || 0.0, "profilePhotoUrl": String(r[17] || ""),
    "recommendationCount": parseInt(r[18]) || 0, "portfolioUrls": r[19] ? r[19].toString().split(",") : [], "searchKeywords": r[20] ? r[20].toString().split(",") : [],
    "lastSeen": parseInt(r[21]) || 0, "callCount": parseInt(r[22]) || 0, "fullAddress": String(r[23] || ""), "isNumberHidden": (r[24] === true || String(r[24]).toUpperCase() === "TRUE"),
    "referredBy": String(r[25] || ""), "referralBonusPaid": (r[26] === true || String(r[26]).toUpperCase() === "TRUE"), "fcmToken": String(r[27] || ""),
    "notificationsEnabled": (r[28] === true || String(r[28]).toUpperCase() === "TRUE"), "latitude": parseFloat(r[29] || 0.0), "longitude": parseFloat(r[30]) || 0.0
  };
}
