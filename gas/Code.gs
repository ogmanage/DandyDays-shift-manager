// ================================================================
// DandyDays シフト管理 - Google Apps Script
// このファイルを Google Apps Script に貼り付けてデプロイしてください
// ================================================================

var SPREADSHEET_ID = ''; // ← スプレッドシートのURL /d/XXXX/edit の「XXXX」部分を貼り付ける

// ─── GET: シフトデータ取得 ──────────────────────────────────────
function doGet(e) {
  try {
    // SPREADSHEET_IDの設定チェック
    if (!SPREADSHEET_ID) {
      return jsonResponse({ error: 'SPREADSHEET_ID が未設定です。Code.gsの先頭にスプレッドシートIDを入力してください。' });
    }

    var monthId = e.parameter.monthId;
    var memberId = e.parameter.memberId; // 指定時は既存回答も返す

    if (!monthId) {
      return jsonResponse({ error: 'monthId is required' });
    }

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    // shift_months シートからmonthIdに一致する月を取得
    var monthSheet = ss.getSheetByName('shift_months');
    var monthData = sheetToObjects(monthSheet);
    var shiftMonth = monthData.find(function(m) { return m.id === monthId; });

    if (!shiftMonth) {
      return jsonResponse({ error: 'ShiftMonth not found' });
    }

    // shift_slots シートから該当月のスロットを取得
    var slotsSheet = ss.getSheetByName('shift_slots');
    var allSlots = sheetToObjects(slotsSheet);
    var slots = allSlots.filter(function(s) { return s.shiftMonthId === monthId; });

    var result = {
      shiftMonth: castMonth(shiftMonth),
      slots: slots.map(castSlot),
    };

    // memberIdが指定されていれば既存回答も返す（過去履歴の復元用）
    if (memberId) {
      var responsesSheet = ss.getSheetByName('staff_responses');
      var allResponses = sheetToObjects(responsesSheet);
      var slotIds = slots.map(function(s) { return s.id; });
      result.responses = allResponses
        .filter(function(r) {
          return r.memberId === memberId && slotIds.indexOf(r.shiftSlotId) !== -1;
        })
        .map(castResponse);
    }

    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

// ─── POST: データ書き込み ───────────────────────────────────────
function doPost(e) {
  try {
    if (!SPREADSHEET_ID) {
      return jsonResponse({ error: 'SPREADSHEET_ID が未設定です' });
    }
    var body = JSON.parse(e.postData.contents);
    var action = body.action;

    if (action === 'addMember') {
      return handleAddMember(body);
    } else if (action === 'submitResponse') {
      return handleSubmitResponse(body);
    } else {
      return jsonResponse({ error: 'Unknown action: ' + action });
    }
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

// membersシートのヘッダー定義（lineUserIdを含む）
var MEMBER_HEADERS = ['id','name','email','city','role','createdAt','lastAccessedAt','lineUserId'];

// membersシートにlineUserId列が存在しない場合は追加する
function ensureMemberColumns(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) return;
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  MEMBER_HEADERS.forEach(function(h) {
    if (headers.indexOf(h) === -1) {
      sheet.getRange(1, lastCol + 1).setValue(h);
      lastCol++;
    }
  });
}

// ─── メンバー追加（LINE IDまたはメールで重複チェック）────────────────
function handleAddMember(body) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('members');
  ensureMemberColumns(sheet);
  var members = sheetToObjects(sheet);

  // ① LINE IDで既存メンバーを検索（LIFF経由）
  if (body.lineUserId) {
    var existingLine = members.find(function(m) { return m.lineUserId === body.lineUserId; });
    if (existingLine) {
      // 名前とlastAccessedAtを更新
      updateRowByKey(sheet, 'id', existingLine.id, {
        id: existingLine.id,
        name: body.name || existingLine.name,
        email: existingLine.email || '',
        city: existingLine.city || '',
        role: existingLine.role || 'user',
        createdAt: existingLine.createdAt,
        lastAccessedAt: new Date().toISOString(),
        lineUserId: body.lineUserId,
      }, MEMBER_HEADERS);
      return jsonResponse({ member: { ...existingLine, name: body.name || existingLine.name } });
    }
    // 新規LINEメンバー
    var newLineMember = {
      id: body.id || Utilities.getUuid(),
      name: body.name || '',
      email: '',
      city: '',
      role: 'user',
      createdAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
      lineUserId: body.lineUserId,
    };
    appendRow(sheet, newLineMember, MEMBER_HEADERS);
    return jsonResponse({ member: newLineMember });
  }

  // ② メールアドレスで既存メンバーを検索（従来方式・フォールバック）
  var existing = members.find(function(m) { return body.email && m.email === body.email; });
  if (existing) {
    updateRowByKey(sheet, 'id', existing.id, {
      id: existing.id,
      name: existing.name,
      email: existing.email,
      city: existing.city,
      role: existing.role,
      createdAt: existing.createdAt,
      lastAccessedAt: new Date().toISOString(),
      lineUserId: existing.lineUserId || '',
    }, MEMBER_HEADERS);
    return jsonResponse({ member: existing });
  }

  // 新規追加
  var newMember = {
    id: body.id || Utilities.getUuid(),
    name: body.name || '',
    email: body.email || '',
    city: body.city || '',
    role: 'user',
    createdAt: body.createdAt || new Date().toISOString(),
    lastAccessedAt: new Date().toISOString(),
    lineUserId: '',
  };
  appendRow(sheet, newMember, MEMBER_HEADERS);
  return jsonResponse({ member: newMember });
}

// ─── シフト回答の書き込み（Upsert: shiftSlotId + memberIdで検索）──
function handleSubmitResponse(body) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('staff_responses');
  var headers = ['id','shiftSlotId','memberId','isAvailable','submittedAt','isAssigned'];

  var allData = sheet.getDataRange().getValues();
  if (allData.length < 2) {
    // ヘッダーのみ or 空 → 新規追加
    appendRow(sheet, body, headers);
    return jsonResponse({ ok: true, action: 'inserted' });
  }

  var headerRow = allData[0];
  var slotIdCol = headerRow.indexOf('shiftSlotId');
  var memberIdCol = headerRow.indexOf('memberId');

  // shiftSlotId AND memberId が一致する行を検索（重複なし保証）
  for (var i = 1; i < allData.length; i++) {
    var row = allData[i];
    if (row[slotIdCol] === body.shiftSlotId && row[memberIdCol] === body.memberId) {
      // 既存行を上書き
      var newRow = headers.map(function(h) {
        if (h === 'isAvailable') return String(body[h]);
        if (h === 'isAssigned') return String(body[h] || false);
        return body[h] !== undefined ? String(body[h]) : String(row[headerRow.indexOf(h)] || '');
      });
      sheet.getRange(i + 1, 1, 1, newRow.length).setValues([newRow]);
      return jsonResponse({ ok: true, action: 'updated' });
    }
  }

  // 見つからなければ新規追加
  appendRow(sheet, body, headers);
  return jsonResponse({ ok: true, action: 'inserted' });
}

// ─── ユーティリティ ────────────────────────────────────────────

function sheetToObjects(sheet) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0];
  return values.slice(1)
    .filter(function(row) { return row[0] !== ''; })
    .map(function(row) {
      var obj = {};
      headers.forEach(function(h, i) {
        var v = row[i];
        obj[h] = (v === '' || v === null || v === undefined) ? null : String(v);
      });
      return obj;
    });
}

function appendRow(sheet, obj, headers) {
  var row = headers.map(function(h) {
    var v = obj[h];
    return (v === null || v === undefined) ? '' : String(v);
  });
  sheet.appendRow(row);
}

function updateRowByKey(sheet, keyField, keyValue, obj, headers) {
  var data = sheet.getDataRange().getValues();
  var headerRow = data[0];
  var keyCol = headerRow.indexOf(keyField);
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][keyCol]) === String(keyValue)) {
      var newRow = headers.map(function(h) {
        var v = obj[h];
        return (v === null || v === undefined) ? '' : String(v);
      });
      sheet.getRange(i + 1, 1, 1, newRow.length).setValues([newRow]);
      return;
    }
  }
  // 見つからなければ追加
  appendRow(sheet, obj, headers);
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── 型変換ヘルパー ────────────────────────────────────────────

function castMonth(m) {
  return {
    id: m.id,
    year: Number(m.year),
    month: Number(m.month),
    status: m.status,
    deadlineAt: m.deadlineAt || null,
    publishedAt: m.publishedAt || null,
    closedAt: m.closedAt || null,
  };
}

function castSlot(s) {
  return {
    id: s.id,
    shiftMonthId: s.shiftMonthId,
    locationName: s.locationName,
    date: s.date,
    requiredCount: Number(s.requiredCount),
    status: s.status,
    note: s.note || '',
  };
}

function castResponse(r) {
  return {
    id: r.id,
    shiftSlotId: r.shiftSlotId,
    memberId: r.memberId,
    isAvailable: r.isAvailable === 'true',
    submittedAt: r.submittedAt,
    isAssigned: r.isAssigned === 'true',
  };
}
