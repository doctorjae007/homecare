/** Google Apps Script backend: bind this script to the destination Google Sheet. */
const SHEET_NAME = 'HomeVisits';
const PHOTO_FOLDER_NAME = 'รูปเยี่ยมบ้านนักเรียน';
const ADMIN_EMAILS = ['ta458@hatyairat.ac.th','jaeautobot@gmail.com'];
const API_VERSION = '2026-07-19-v8';
const HEADERS = [
  'recordId','createdAt','updatedAt','studentName','nickname','classLevel','room','studentNo','gender',
  'villageName','houseNo','villageNo','soi','road','subdistrict','district','province','postalCode',
  'guardianName','guardianJob','guardianPhone','guardianRelation','parentStatus','incomePerPerson',
  'hasDisease','diseaseDetail','distanceKm','distanceMeters','travelHours','travelMinutes','houseCondition',
  'responsibilities','responsibilityOther','hobbies','riskBehaviors','riskDetail','supportNeeds','followUpNote',
  'teacher1','teacher2','visitDate','academicYear','studentPhoto','housePhoto','visitPhoto','submittedBy'
];

function doGet() {
  return json_({ok:true,message:'Home Visit API พร้อมใช้งาน',apiVersion:API_VERSION});
}

function doPost(e) {
  try {
    const contents = (e && e.postData && e.postData.contents) || '{}';
    if (contents.length > 12 * 1024 * 1024) throw new Error('ข้อมูลหรือรูปภาพมีขนาดใหญ่เกินกำหนด');
    const body = JSON.parse(contents);
    if (body.action === 'version') return json_({ok:true,apiVersion:API_VERSION});
    if (body.action === 'saveStudent') {
      const studentData = body.data || {};
      let editToken = '';
      if (studentData.recordId) {
        requireStudentEditToken_(studentData.recordId, body.editToken);
        const original = getRecord_(studentData.recordId);
        studentData.createdAt = original.createdAt;
        editToken = studentEditToken_(studentData.recordId);
      } else {
        studentData.recordId = 'HV-' + Date.now() + '-' + Utilities.getUuid().slice(0,8);
        studentData.createdAt = new Date().toISOString();
        editToken = studentEditToken_(studentData.recordId);
      }
      studentData.updatedAt = new Date().toISOString();
      studentData.submittedBy = 'student-form';
      return json_({ok:true,data:saveRecord_(studentData),editToken:editToken});
    }
    if (body.action === 'getStudent') {
      requireStudentEditToken_(body.recordId, body.editToken);
      return json_({ok:true,data:getRecord_(body.recordId)});
    }
    if (body.action === 'getStudentPrint') {
      requireStudentEditToken_(body.recordId, body.editToken);
      return json_({ok:true,data:getPrintRecord_(body.recordId)});
    }
    if (body.action === 'searchStudentByPhone') {
      return json_({ok:true,data:findStudentRecordsByPhone_(body.guardianPhone)});
    }
    const user = verifyGoogleIdToken_(body.idToken);
    requireAdmin_(user);
    if (body.action === 'ping') return json_({ok:true,message:'เชื่อมต่อสำเร็จ',apiVersion:API_VERSION,user:{email:user.email,isAdmin:true}});
    if (body.action === 'list') {
      return json_({ok:true,data:listRecords_()});
    }
    if (body.action === 'getPrintRecord') {
      return json_({ok:true,data:getPrintRecord_(body.recordId)});
    }
    if (body.action === 'saveTeacher') {
      const data = body.data || {};
      data.submittedBy = user.email;
      return json_({ok:true,data:saveRecord_(data)});
    }
    if (body.action === 'deleteTeacher') {
      return json_({ok:true,data:deleteRecord_(body.recordId)});
    }
    throw new Error('ไม่รองรับคำสั่งนี้');
  } catch (error) {
    return json_({ok:false,message:error.message || String(error)});
  }
}

function verifyGoogleIdToken_(idToken) {
  if (!idToken) throw new Error('กรุณาเข้าสู่ระบบด้วย Google');
  const clientId = PropertiesService.getScriptProperties().getProperty('GOOGLE_CLIENT_ID');
  if (!clientId) throw new Error('ยังไม่ได้ตั้ง Script Property: GOOGLE_CLIENT_ID');
  const response = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), {muteHttpExceptions:true});
  if (response.getResponseCode() !== 200) throw new Error('Google ID Token ไม่ถูกต้องหรือหมดอายุ');
  const payload = JSON.parse(response.getContentText());
  const issuerOk = payload.iss === 'accounts.google.com' || payload.iss === 'https://accounts.google.com';
  const verified = payload.email_verified === true || payload.email_verified === 'true';
  if (payload.aud !== clientId || !issuerOk || !verified || Number(payload.exp) * 1000 <= Date.now()) {
    throw new Error('ไม่สามารถยืนยันบัญชี Google ได้');
  }
  return {email:String(payload.email || '').toLowerCase(),sub:payload.sub};
}

/**
 * เรียกใช้จากหน้า Apps Script Editor เพียงครั้งเดียวหลังติดตั้งหรือเปลี่ยน Deployment
 * เพื่ออนุญาตสิทธิ์ UrlFetchApp, Google Sheets และ Google Drive ให้เจ้าของสคริปต์
 */
function resetAuthorization() {
  ScriptApp.invalidateAuth();
  console.log('ล้างสิทธิ์เดิมแล้ว กรุณารัน authorizeServices อีกครั้งและอนุญาตทุกสิทธิ์');
}

function authorizeServices() {
  ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  const response = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo', {
    muteHttpExceptions:true
  });
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (spreadsheet) spreadsheet.getId();
  DriveApp.getRootFolder().getId();
  const message = 'อนุญาต UrlFetchApp, Google Sheets และ Google Drive เรียบร้อย (HTTP ' + response.getResponseCode() + ')';
  console.log(message);
  return message;
}

function requireAdmin_(user) {
  if (ADMIN_EMAILS.indexOf(user.email) === -1) throw new Error('บัญชีนี้ไม่มีสิทธิ์ดูหรือพิมพ์ข้อมูล');
}

function studentEditToken_(recordId) {
  const properties = PropertiesService.getScriptProperties();
  let secret = properties.getProperty('STUDENT_EDIT_SECRET');
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    properties.setProperty('STUDENT_EDIT_SECRET',secret);
  }
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(String(recordId),secret)).replace(/=+$/,'');
}

function requireStudentEditToken_(recordId,editToken) {
  if (!recordId || !editToken || String(editToken) !== studentEditToken_(recordId)) {
    throw new Error('ไม่มีสิทธิ์เปิดหรือแก้ไขรายการนี้');
  }
}

function normalizePhone_(value) {
  return String(value || '').replace(/\D/g,'');
}

function findStudentRecordsByPhone_(guardianPhone) {
  const submittedPhone = normalizePhone_(guardianPhone);
  if (submittedPhone.length < 9) throw new Error('กรุณากรอกเบอร์มือถือให้ถูกต้อง');
  const records = listRecords_().filter(record => submittedPhone === normalizePhone_(record.guardianPhone)).slice(0,10);
  if (!records.length) {
    Utilities.sleep(350);
    throw new Error('ไม่พบฟอร์มที่ตรงกับเบอร์มือถืนี้');
  }
  return records.map(record => ({record:record,editToken:studentEditToken_(record.recordId)}));
}

function getSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('กรุณาสร้าง Apps Script จากเมนูส่วนขยายของ Google Sheet');
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(SHEET_NAME);
  if (sheet.getMaxColumns() < HEADERS.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), HEADERS.length - sheet.getMaxColumns());
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1,1,1,HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1,1,1,HEADERS.length).setFontWeight('bold').setBackground('#17365d').setFontColor('#ffffff');
  } else {
    const existingHeaders = sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0];
    if (existingHeaders.indexOf('distanceMeters') === -1) {
      const distanceMetersColumn = HEADERS.indexOf('distanceMeters') + 1;
      sheet.insertColumnBefore(distanceMetersColumn);
      sheet.getRange(1,distanceMetersColumn).setValue('distanceMeters');
    }
    sheet.getRange(1,1,1,HEADERS.length).setValues([HEADERS]);
  }
  return sheet;
}

function listRecords_() {
  const sheet = getSheet_(), lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2,1,lastRow-1,HEADERS.length).getDisplayValues().map(rowToObject_).reverse();
}

function findRecordRow_(sheet,recordId) {
  if (!recordId || sheet.getLastRow() < 2) return -1;
  const ids = sheet.getRange(2,1,sheet.getLastRow()-1,1).getDisplayValues().flat();
  const index = ids.indexOf(String(recordId));
  return index < 0 ? -1 : index + 2;
}

function getPrintRecord_(recordId) {
  const record = getRecord_(recordId);
  ['studentPhoto','housePhoto','visitPhoto'].forEach(key => {
    record[key] = photoDataUrl_(record[key]);
  });
  return record;
}

function getRecord_(recordId) {
  const sheet = getSheet_(), targetRow = findRecordRow_(sheet,recordId);
  if (targetRow < 0) throw new Error('ไม่พบรายการที่ต้องการ');
  return rowToObject_(sheet.getRange(targetRow,1,1,HEADERS.length).getDisplayValues()[0]);
}

function deleteRecord_(recordId) {
  if (!recordId) throw new Error('ไม่พบรหัสรายงานที่ต้องการลบ');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = getSheet_(), targetRow = findRecordRow_(sheet,recordId);
    if (targetRow < 0) throw new Error('ไม่พบรายงานที่ต้องการลบ');
    const record = rowToObject_(sheet.getRange(targetRow,1,1,HEADERS.length).getDisplayValues()[0]);
    sheet.deleteRow(targetRow);
    ['studentPhoto','housePhoto','visitPhoto'].forEach(key => trashPhoto_(record[key]));
    return {recordId:String(recordId)};
  } finally {
    lock.releaseLock();
  }
}

function rowToObject_(row) {
  const result = {};
  HEADERS.forEach((header,index) => {
    let value = row[index] || '';
    if (['responsibilities','riskBehaviors','supportNeeds'].indexOf(header) !== -1) {
      try { value = value ? JSON.parse(value) : []; } catch (_) { value = value ? value.split(', ') : []; }
    }
    result[header] = value;
  });
  return result;
}

function saveRecord_(data) {
  if (!data.recordId || !data.studentName) throw new Error('ข้อมูลนักเรียนไม่ครบถ้วน');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = getSheet_(), folder = getPhotoFolder_();
    ['studentPhoto','housePhoto','visitPhoto'].forEach(key => {
      if (data[key] && String(data[key]).indexOf('data:image/') === 0) data[key] = savePhoto_(folder,data.recordId,key,data[key]);
    });
    const row = HEADERS.map(header => Array.isArray(data[header]) ? JSON.stringify(data[header]) : (data[header] == null ? '' : data[header]));
    let targetRow = -1;
    if (sheet.getLastRow() >= 2) {
      const ids = sheet.getRange(2,1,sheet.getLastRow()-1,1).getDisplayValues().flat();
      const index = ids.indexOf(String(data.recordId));
      if (index >= 0) targetRow = index + 2;
    }
    if (targetRow > 0) sheet.getRange(targetRow,1,1,HEADERS.length).setValues([row]);
    else sheet.appendRow(row);
    return data;
  } finally { lock.releaseLock(); }
}

function getPhotoFolder_() {
  const props = PropertiesService.getScriptProperties(), id = props.getProperty('PHOTO_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (_) {} }
  const folders = DriveApp.getFoldersByName(PHOTO_FOLDER_NAME);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(PHOTO_FOLDER_NAME);
  props.setProperty('PHOTO_FOLDER_ID',folder.getId());
  return folder;
}

function savePhoto_(folder,recordId,kind,dataUrl) {
  const match = String(dataUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) throw new Error('รูปภาพมีรูปแบบไม่ถูกต้อง');
  const ext = match[1].indexOf('png') !== -1 ? 'png' : 'jpg';
  const blob = Utilities.newBlob(Utilities.base64Decode(match[2]),match[1],recordId+'_'+kind+'_'+Date.now()+'.'+ext);
  const file = folder.createFile(blob);
  return 'https://drive.google.com/uc?export=view&id='+file.getId();
}

function driveFileId_(url) {
  const text = String(url || '');
  const queryMatch = text.match(/[?&]id=([^&]+)/);
  if (queryMatch) return decodeURIComponent(queryMatch[1]);
  const pathMatch = text.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return pathMatch ? pathMatch[1] : '';
}

function photoDataUrl_(value) {
  if (!value || String(value).indexOf('data:image/') === 0) return value || '';
  const fileId = driveFileId_(value);
  if (!fileId) return value;
  try {
    const blob = DriveApp.getFileById(fileId).getBlob();
    const mimeType = blob.getContentType() || 'image/jpeg';
    return 'data:' + mimeType + ';base64,' + Utilities.base64Encode(blob.getBytes());
  } catch (_) {
    return '';
  }
}

function trashPhoto_(value) {
  const fileId = driveFileId_(value);
  if (!fileId) return;
  try { DriveApp.getFileById(fileId).setTrashed(true); } catch (_) {}
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
