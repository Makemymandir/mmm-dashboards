/**
 * design_brief.gs — Design Brief storage for the MMM Costing System
 * ------------------------------------------------------------------
 * Stores one row per project in a sheet tab called "Design_Briefs".
 * The sheet (and its header row) is created automatically on first use.
 *
 * ==================================================================
 * INTEGRATION — add the two actions below to the router in Code.gs.
 * Inside doPost(), alongside the other `if (action === ...)` branches:
 *
 *     if (action === 'save_design_brief') return jsonResponse(saveDesignBrief(data));
 *     if (action === 'get_design_brief')  return jsonResponse(getDesignBrief(data));
 *
 * Notes:
 *  - `data` is the parsed request body (JSON.parse(e.postData.contents)).
 *  - `jsonResponse` is whatever helper Code.gs already uses to wrap a
 *    plain object in a ContentService JSON response. If Code.gs does the
 *    wrapping inline, return the object instead and let the router wrap it.
 *  - `get_design_brief` is intentionally PUBLIC (no token required) so the
 *    client-facing shareable link (project.html?id=...&brief=client) works
 *    without a login. `save_design_brief` is staff-only — see the token
 *    check inside saveDesignBrief().
 * ==================================================================
 */

var DESIGN_BRIEF_SHEET = 'Design_Briefs';

// Canonical column order for the Design_Briefs sheet.
var DESIGN_BRIEF_COLUMNS = [
  'project_id', 'status',
  'confirmed_width', 'confirmed_depth', 'confirmed_height', 'space_constraints',
  'deity_names', 'murti_sizes', 'photo_frame_sizes',
  'style_confirmed', 'colour_preference', 'wood_finish', 'reference_links',
  'j_hook', 'pocket_doors', 'akhand_jyot', 'electrical_points',
  'storage_requirements', 'jain_requirements',
  'factory_instructions', 'client_constraints',
  'site_photo_links', 'site_photos',
  'updated_by', 'updated_at', 'created_at'
];

/**
 * Returns the spreadsheet that holds the costing data.
 * If Code.gs already exposes a helper (e.g. getSpreadsheet_() or a
 * SHEET_ID constant), swap this body to use that for consistency.
 */
function db_getSpreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

/** Returns the Design_Briefs sheet, creating it with headers if missing. */
function db_getSheet_() {
  var ss = db_getSpreadsheet_();
  var sh = ss.getSheetByName(DESIGN_BRIEF_SHEET);
  if (!sh) {
    sh = ss.insertSheet(DESIGN_BRIEF_SHEET);
    sh.appendRow(DESIGN_BRIEF_COLUMNS);
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Maps a sheet row array to an object using the header row. */
function db_rowToObject_(headers, row) {
  var o = {};
  for (var i = 0; i < headers.length; i++) {
    o[headers[i]] = row[i];
  }
  return o;
}

/** Looks up minimal project info so the client view needs no extra call. */
function db_lookupProject_(projectId) {
  try {
    var sh = db_getSpreadsheet_().getSheetByName('Projects');
    if (!sh) return {};
    var values = sh.getDataRange().getValues();
    var headers = values[0];
    var idCol = headers.indexOf('project_id');
    if (idCol < 0) return {};
    for (var r = 1; r < values.length; r++) {
      if (String(values[r][idCol]) === String(projectId)) {
        var o = db_rowToObject_(headers, values[r]);
        return {
          project_id:  o.project_id,
          client_name: o.client_name,
          location:    o.location,
          framework:   o.framework
        };
      }
    }
  } catch (e) {
    // Non-fatal — client view still renders without project meta.
  }
  return {};
}

/**
 * get_design_brief — PUBLIC (no token).
 * data: { project_id }
 * Returns: { ok, brief, project }
 */
function getDesignBrief(data) {
  try {
    var projectId = data && data.project_id;
    if (!projectId) return { ok: false, error: 'project_id is required' };

    var sh = db_getSheet_();
    var values = sh.getDataRange().getValues();
    var headers = values[0];

    var brief = null;
    for (var r = 1; r < values.length; r++) {
      if (String(values[r][0]) === String(projectId)) {
        brief = db_rowToObject_(headers, values[r]);
        break;
      }
    }
    // No brief yet — return an empty one so the UI shows "Not Started".
    if (!brief) {
      brief = { project_id: projectId, status: 'Not Started' };
    }

    return {
      ok: true,
      brief: brief,
      project: db_lookupProject_(projectId)
    };
  } catch (e) {
    return { ok: false, error: 'getDesignBrief: ' + e.message };
  }
}

/**
 * save_design_brief — STAFF ONLY.
 * data: { token, brief: { project_id, ... } }
 * Returns: { ok, brief }
 */
function saveDesignBrief(data) {
  try {
    // Staff-only. If Code.gs has a real token validator (e.g.
    // validateToken_(token) or getUserFromToken_(token)), call it here:
    //     if (!validateToken_(data && data.token)) return { ok:false, error:'Not authorised' };
    if (!data || !data.token) {
      return { ok: false, error: 'Not authorised — please sign in again.' };
    }

    var brief = data.brief;
    if (!brief || !brief.project_id) {
      return { ok: false, error: 'brief.project_id is required' };
    }

    var sh = db_getSheet_();
    var values = sh.getDataRange().getValues();
    var headers = values[0];
    var now = new Date();

    var rowIndex = -1;
    for (var r = 1; r < values.length; r++) {
      if (String(values[r][0]) === String(brief.project_id)) {
        rowIndex = r;
        break;
      }
    }

    var existing = rowIndex > -1 ? db_rowToObject_(headers, values[rowIndex]) : {};
    brief.created_at = existing.created_at || now;
    brief.updated_at = now;

    // Build the row in canonical column order; keep existing values for
    // any column the client did not send.
    var rowData = headers.map(function(h) {
      if (brief[h] !== undefined && brief[h] !== null) return brief[h];
      if (existing[h] !== undefined) return existing[h];
      return '';
    });

    if (rowIndex > -1) {
      sh.getRange(rowIndex + 1, 1, 1, headers.length).setValues([rowData]);
    } else {
      sh.appendRow(rowData);
    }

    return { ok: true, brief: db_rowToObject_(headers, rowData) };
  } catch (e) {
    return { ok: false, error: 'saveDesignBrief: ' + e.message };
  }
}
