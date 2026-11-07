function setup() {
  const doc = SpreadsheetApp.getActiveSpreadsheet();
  SCRIPT_PROP.setProperty("key", doc.getId());
}

/**
 * Modern POST Entry Point
 */
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);

    // Route based on "action" key
    switch (payload.action) {
      case "log":
        return createJsonResponse(processAnalyticsPost(payload)); // the whole payload: version 2 has more than data

      case "search":
        return createJsonResponse(getSearchResults(payload.query));

      case "resetPassword":
        return createJsonResponse(handlePasswordReset(payload.email));

      default:
        return createJsonResponse({ error: "No valid action specified" });
    }
  } catch (error) {
    return createJsonResponse({ error: "POST Error: " + error.toString() });
  }
}

/**
 * GET only answers that the backend is up. The app has sent analytics by POST since Nov 2026;
 * the old query-string format lost most of its data anyway (see migrateResponses).
 */
function doGet(e) {
  return createJsonResponse({ message: "yCanta Backend Active. Use POST for analytics." });
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
