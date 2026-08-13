const FOLDER_ID = '1GmdG9H5wJ2d3_5KFuKLlUlseOzXY9gGU';

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const expectedSecret = PropertiesService
      .getScriptProperties()
      .getProperty('DRIVE_BRIDGE_SECRET');

    if (!expectedSecret || body.secret !== expectedSecret) {
      return jsonResponse({ ok: false, error: 'Unauthorized' });
    }

    if (!body.pdf_base64 || !body.email) {
      return jsonResponse({ ok: false, error: 'Missing pdf_base64 or email' });
    }

    const safeEmail = String(body.email)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9@._+-]/g, '_');

    const filename = safeEmail + '.pdf';

    const folder = DriveApp.getFolderById(FOLDER_ID);
    const bytes = Utilities.base64Decode(body.pdf_base64);
    const blob = Utilities.newBlob(bytes, MimeType.PDF, filename);
    const file = folder.createFile(blob);

    // Intentionally do NOT call file.setSharing().
    // The PDF remains private in SlidesOut. The end user downloads
    // independently through Spark/Vercel.
    return jsonResponse({
      ok: true,
      file_id: file.getId(),
      filename: filename
    });

  } catch (err) {
    return jsonResponse({
      ok: false,
      error: String(err && err.message ? err.message : err)
    });
  }
}
