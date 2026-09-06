/**
 * 🏛️ RUDRASPARK RENTAL MAIN HUB SCRIPT
 * Central Intelligence Hub for Rental Ecosystem with Robust Case-Insensitive State Routing
 */

var CACHE_TTL = 900;

function doGet(e) {
  var type = (e.parameter && e.parameter.type) ? e.parameter.type : "app_data";
  var nocache = (e.parameter && e.parameter.nocache === "true");

  if (!nocache) {
    var cachedData = getLargeCache(type);
    if (cachedData) return ContentService.createTextOutput(cachedData).setMimeType(ContentService.MimeType.JSON);
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result;

  try {
    if (type === "app_data" || type === "config") {
      result = {
        config: fetchConfig(ss),
        categories: fetchCategories(ss),
        locations: fetchLocations(ss),
        stateUrls: fetchStateUrls(ss)
      };
    } else {
      result = { status: "success", msg: "Rental Hub Active" };
    }

    var jsonOutput = JSON.stringify(result || []);
    if (!nocache) putLargeCache(type, jsonOutput);
    return ContentService.createTextOutput(jsonOutput).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ "error": err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var data = JSON.parse(e.postData.contents);

    if (data.type === "ADD_TO_REFRESH_QUEUE") {
      var qSheet = ss.getSheetByName("RefreshQueue") || ss.insertSheet("RefreshQueue");
      if (qSheet.getLastRow() === 0) { qSheet.appendRow(["ID", "Name", "Address", "State", "Status", "Timestamp", "City", "CategoryId", "Subcategory"]); }
      var ids = qSheet.getRange(1, 1, Math.max(qSheet.getLastRow(), 1), 1).getValues().flat().map(String);
      if (ids.indexOf(String(data.id)) === -1) {
        qSheet.appendRow([data.id, data.name, data.addr, data.state, "PENDING", Date.now(), data.city || "", data.categoryId || "", data.subcategory || ""]);
        return ContentService.createTextOutput("Success: Added to Queue");
      }
      return ContentService.createTextOutput("Already in Queue");
    }

    if (data.type === "GET_REFRESH_QUEUE") {
      var qSheet = ss.getSheetByName("RefreshQueue");
      if (!qSheet || qSheet.getLastRow() <= 1) return ContentService.createTextOutput("[]");
      var qData = qSheet.getDataRange().getValues();
      var tasks = [];
      for (var i = 1; i < qData.length; i++) {
        tasks.push({ id: qData[i][0], name: qData[i][1], addr: qData[i][2], state: qData[i][3], city: qData[i][6], categoryId: qData[i][7], subcategory: qData[i][8] });
      }
      return ContentService.createTextOutput(JSON.stringify(tasks));
    }

    if (data.type === "MARK_REFRESH_DONE") {
      var qSheet = ss.getSheetByName("RefreshQueue");
      if (qSheet) {
        var targetIds = data.ids || [data.id];
        var allIds = qSheet.getRange(1, 1, Math.max(qSheet.getLastRow(), 1), 1).getValues().flat().map(String);
        var rowsToDelete = [];
        targetIds.forEach(function(id) {
          var idx = allIds.indexOf(String(id).trim());
          if (idx !== -1) rowsToDelete.push(idx + 1);
        });
        rowsToDelete.sort(function(a, b) { return b - a; });
        rowsToDelete.forEach(function(row) { qSheet.deleteRow(row); });
        return ContentService.createTextOutput("Success: Cleaned Queue");
      }
      return ContentService.createTextOutput("Success");
    }

    if (data.type === "PROVIDER_SYNC" || data.type === "DELETE_ENTRIES" || data.type === "BATCH_PROVIDER_SYNC" || data.type === "IMAGE_UPDATE" || data.type === "BATCH_IMAGE_UPDATE") {
        return routeToSatellite(ss, data);
    }

    return ContentService.createTextOutput("Success");
  } catch (error) { return ContentService.createTextOutput("Error: " + error.toString()); }
  finally { lock.releaseLock(); }
}

function routeToSatellite(ss, data) {
  var items = data.providers || data.updates || [data];
  var stateGroups = {};
  items.forEach(function(item) {
    var s = String(item.state || data.state || "").trim();
    if (s && s !== "" && s !== "null" && s !== "undefined") {
      if (!stateGroups[s]) stateGroups[s] = [];
      stateGroups[s].push(item);
    }
  });

  var results = [];
  var rawConfigs = fetchStateUrls(ss);
  var stateConfigs = {};
  Object.keys(rawConfigs).forEach(function(k) {
    stateConfigs[k.toLowerCase().trim()] = String(rawConfigs[k]).trim();
  });

  Object.keys(stateGroups).forEach(function(state) {
    var satelliteUrl = stateConfigs[state.toLowerCase().trim()];
    if (satelliteUrl && satelliteUrl.length > 10) {
      var payload = {
        type: data.type,
        providers: stateGroups[state]
      };
      var options = { 'method': 'post', 'contentType': 'application/json', 'payload': JSON.stringify(payload), 'muteHttpExceptions': true };
      try {
        var response = UrlFetchApp.fetch(satelliteUrl, options);
        results.push(state + ": " + response.getContentText());
      } catch (e) {
        results.push(state + ": Fail - " + e.toString());
      }
    } else {
      results.push(state + ": Unmapped State (No Satellite URL)");
    }
  });
  return ContentService.createTextOutput(results.join(" | "));
}

function fetchConfig(ss) {
  var sheet = ss.getSheetByName("AppConfig"); var config = {};
  if (sheet && sheet.getLastRow() > 1) {
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
    for (var i = 0; i < data.length; i++) { var key = String(data[i][0]).trim(); if (key) config[key] = data[i][1]; }
  }
  return config;
}

function fetchCategories(ss) {
  var sheet = ss.getSheetByName("Categories"); var cats = [];
  if (sheet && sheet.getLastRow() > 1) {
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
    for (var i = 0; i < data.length; i++) {
      cats.push({ "id": String(data[i][0]), "name": String(data[i][1]), "icon": String(data[i][2]), "sub": data[i][3] ? data[i][3].toString().split(",") : [], "isTop": (data[i][4] === true || data[i][4] === "TRUE"), "sortOrder": parseInt(data[i][5]) || 0 });
    }
  }
  return cats;
}

function fetchLocations(ss) {
  var sheet = ss.getSheetByName("Locations"); var locs = [];
  if (sheet && sheet.getLastRow() > 1) {
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
    for (var i = 0; i < data.length; i++) { if (data[i][2] === true || data[i][2] === "TRUE") { locs.push({ "state": String(data[i][0]), "cities": data[i][1] ? data[i][1].toString().split(",") : [] }); } }
  }
  return locs;
}

function fetchStateUrls(ss) {
  var sheet = ss.getSheetByName("StateConfigs"); var urls = {};
  if (sheet && sheet.getLastRow() > 1) {
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
    for (var i = 0; i < data.length; i++) { var state = String(data[i][0]).trim(); if (state) urls[state] = String(data[i][1]).trim(); }
  }
  return urls;
}

function putLargeCache(key, value) {
  var cache = CacheService.getScriptCache(); var chunkSize = 90 * 1024;
  for (var i = 0; i < value.length; i += chunkSize) { cache.put(key + "_" + (i/chunkSize), value.substring(i, i + chunkSize), CACHE_TTL); }
  cache.put(key + "_count", Math.ceil(value.length / chunkSize).toString(), CACHE_TTL);
}

function getLargeCache(key) {
  var cache = CacheService.getScriptCache(); var count = cache.get(key + "_count"); if (!count) return null;
  var fullValue = ""; for (var i = 0; i < parseInt(count); i++) { fullValue += cache.get(key + "_" + i); } return fullValue;
}
