// ============================================================
//  AC Monitor — Google Apps Script (Code.gs)
//  Paste this entire file into your Apps Script editor.
//
//  Sheet columns (A→H):
//  date | time | location | acCount | kwhr | staff | tech | remarks
//
//  IMPORTANT: After pasting, go to Deploy → Manage Deployments →
//  edit your existing deployment and click "Deploy" again to
//  apply the updated code to the same URL.
// ============================================================

var SHEET_NAME = "AC Logs";

// ── GET — Return all rows as JSON ────────────────────────────
function doGet(e) {
  try {
    var sheet = getOrCreateSheet();
    var data  = sheet.getDataRange().getValues();
    var rows  = [];

    for (var i = 1; i < data.length; i++) {
      var r = data[i];
      // Skip completely blank rows
      if (r[0] === '' && r[1] === '' && r[2] === '') continue;

      var dateStr = formatDate(r[0]);
      // Skip rows where we cannot recover a valid date (e.g. Sheets 1899 ghost rows)
      if (!dateStr || dateStr === '1899-12-30') continue;

      rows.push({
        id:       'ROW-' + i,          // stable: based on physical row index
        date:     dateStr,
        time:     formatTime(r[1]),
        location: r[2]  ? String(r[2]).trim()  : '',
        acCount:  r[3]  !== '' ? String(r[3]) : '0',
        kwhr:     r[4]  !== '' ? String(r[4]) : '0',
        staff:    r[5]  ? String(r[5]).trim()  : '',
        tech:     r[6]  ? String(r[6]).trim()  : '',
        remarks:  r[7]  ? String(r[7]).trim()  : ''
      });
    }

    rows.reverse(); // newest first
    return buildResponse({ status: 'ok', rows: rows });

  } catch(err) {
    return buildResponse({ status: 'error', message: err.message });
  }
}

// ── POST — Add or delete a row ───────────────────────────────
function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var sheet   = getOrCreateSheet();

    if (payload.action === 'add') {
      sheet.appendRow([
        payload.date     || '',
        payload.time     || '',
        payload.location || '',
        parseInt(payload.acCount)  || 0,
        parseFloat(payload.kwhr)   || 0,
        payload.staff    || '',
        payload.tech     || '',
        payload.remarks  || ''
      ]);
      sheet.autoResizeColumns(1, 8);
      return buildResponse({ status: 'ok', message: 'Row added' });
    }

    if (payload.action === 'delete') {
      // payload.id is 'ROW-N' where N is the data row index (1-based, excluding header)
      var id = String(payload.id);
      if (id.startsWith('ROW-')) {
        var rowIdx = parseInt(id.replace('ROW-', ''));
        // +1 for 1-based sheet indexing, +1 for the header row
        var sheetRow = rowIdx + 1;
        var lastRow  = sheet.getLastRow();
        if (sheetRow >= 2 && sheetRow <= lastRow) {
          sheet.deleteRow(sheetRow);
          return buildResponse({ status: 'ok', message: 'Row deleted' });
        }
      }
      return buildResponse({ status: 'error', message: 'Row not found: ' + id });
    }

    return buildResponse({ status: 'error', message: 'Unknown action: ' + payload.action });

  } catch(err) {
    return buildResponse({ status: 'error', message: err.message });
  }
}

// ── Helpers ──────────────────────────────────────────────────

function getOrCreateSheet() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    var header = ['Date', 'Time', 'Location', 'AC Units Off', 'kWhr Saved', 'Facilities Staff', 'Technician', 'Remarks'];
    sheet.appendRow(header);
    var hr = sheet.getRange(1, 1, 1, header.length);
    hr.setFontWeight('bold');
    hr.setBackground('#07090f');
    hr.setFontColor('#00d4ff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// Robustly convert any value Google Sheets puts in a date cell → "YYYY-MM-DD"
function formatDate(val) {
  if (val === '' || val === null || val === undefined) return '';

  // Google Sheets returns Date objects for date-formatted cells
  if (val instanceof Date) {
    // Guard against the Sheets epoch ghost "December 30 1899"
    if (val.getFullYear() === 1899) return '';
    var y  = val.getFullYear();
    var mo = String(val.getMonth() + 1).padStart(2, '0');
    var dd = String(val.getDate()).padStart(2, '0');
    return y + '-' + mo + '-' + dd;
  }

  // If it's already a string in YYYY-MM-DD form, pass it through
  var s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);

  // Try parsing whatever string we got
  var d = new Date(s);
  if (!isNaN(d.getTime()) && d.getFullYear() > 1900) {
    var y2  = d.getFullYear();
    var mo2 = String(d.getMonth() + 1).padStart(2, '0');
    var dd2 = String(d.getDate()).padStart(2, '0');
    return y2 + '-' + mo2 + '-' + dd2;
  }

  return '';
}

// Convert time values — Sheets can store time as a decimal fraction of a day
function formatTime(val) {
  if (val === '' || val === null || val === undefined) return '';

  // Already a HH:MM string
  if (typeof val === 'string' && /^\d{1,2}:\d{2}/.test(val.trim())) return val.trim().substring(0, 5);

  // Sheets stores time as a Date object too
  if (val instanceof Date) {
    var h = String(val.getHours()).padStart(2, '0');
    var m = String(val.getMinutes()).padStart(2, '0');
    return h + ':' + m;
  }

  // Numeric fraction of a day (e.g. 0.5 = 12:00)
  if (typeof val === 'number') {
    var totalMins = Math.round(val * 24 * 60);
    var hh = Math.floor(totalMins / 60) % 24;
    var mm = totalMins % 60;
    return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  }

  return String(val).trim().substring(0, 5);
}

function buildResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
