import {createHash} from 'node:crypto';

const columns = {
  interviewDate:['interviewdate'], interviewTime:['interviewtime'], technology:['technology'],
  companyName:['companyname'], hrName:['hrname'], hrEmail:['hremail'], hrMobile:['hrmobileno','hrmobile'],
  rounds:['noofrounds','interviewround'], status:['interviewstatus','status'],
  selectedCompanyName:['selectedcompanyname','selectedcompany'], remarks:['remarks']
};
const key = value => String(value).trim().toLowerCase().replace(/[^a-z0-9]/g,'');
const fail = message => { throw Object.assign(new Error(message), {status:400}); };
export const sheetRevision = row => createHash('sha256').update(JSON.stringify(row)).digest('hex');

export function validateSheetChanges(changes) {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) fail('Provide the fields to update.');
  const result = {};
  for (const [field, value] of Object.entries(changes)) {
    if (!Object.hasOwn(columns, field)) fail(`Cannot edit ${field}.`);
    if (field === 'rounds') {
      if (!Array.isArray(value) || value.length > 1 || value.some(round => typeof round !== 'string')) fail('Provide a single interview round.');
      result[field] = value.map(round => round.trim());
      continue;
    }
    if (typeof value !== 'string') fail(`Invalid ${field}.`);
    const text = value.trim();
    if (['hrName','companyName','technology','interviewDate','interviewTime','status'].includes(field) && !text) fail(`${field} cannot be empty.`);
    if (field === 'hrName' && !/^[A-Za-z]+(?:\s+[A-Za-z]+)*$/.test(text)) fail('Please enter a valid HR name.');
    if (field === 'hrMobile' && !/^\d{10}$/.test(text)) fail('Please enter a valid 10-digit HR mobile number.');
    if (field === 'hrEmail' && text && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) fail('Please enter a valid HR email address.');
    if (field === 'interviewDate' && (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(text)) || new Date(text).toISOString().slice(0,10) !== text)) fail('Please enter a valid interview date.');
    if (field === 'interviewTime' && !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(text)) fail('Please enter a valid interview time.');
    if (field === 'status' && !['Scheduled','In Progress','Selected','Placed','Rejected','On Hold'].includes(text)) fail('Invalid interview status.');
    result[field] = text;
  }
  if (!Object.keys(result).length) fail('No changes provided.');
  return result;
}

function columnName(index) {
  let name = '';
  for (let number=index+1; number>0; number=Math.floor((number-1)/26)) name=String.fromCharCode(65+(number-1)%26)+name;
  return name;
}

export function sheetEditRanges(headers, row, range, changes) {
  const separator = range.lastIndexOf('!');
  if (separator < 0) fail('Configure GOOGLE_SHEET_RANGE with a sheet name and A1 range.');
  const sheet = range.slice(0,separator);
  // Reading responses assumes the header is row 1 and the first column is A.
  if (!/^A(?:1)?:/i.test(range.slice(separator+1))) fail('Editing requires a response range starting at column A, row 1.');
  return Object.entries(changes).flatMap(([field,value]) => {
    const matches=headers.map((header,index)=>columns[field].includes(key(header))?index:-1).filter(index=>index>=0);
    if (!matches.length) fail(`The response sheet has no column for ${field}. Add the column before editing this field.`);
    return matches.map(index => ({range:`${sheet}!${columnName(index)}${row}`,values:[[field==='rounds'?value[0]||'':value]]}));
  });
}

export async function editSheetResponse({sheetRow, revision, changes, read, write, audit}) {
  if (!Number.isInteger(sheetRow) || sheetRow < 2) fail('Invalid Google Sheet row.');
  const updates=validateSheetChanges(changes);
  const {spreadsheetId,headers,rows,range,resolvedRange}=await read();
  const source=rows.find(row=>row.__row===sheetRow);
  if (!source) throw Object.assign(new Error('Google response was not found.'),{status:404});
  if (!revision || revision!==sheetRevision(source)) throw Object.assign(new Error('This response has changed. Close this dialog, refresh the list, and reopen it before saving.'),{status:409});
  // Google resolves sheet-only names, named ranges and unqualified A1 ranges
  // to the actual tab and cell range. Use that same tab for writes.
  const data=sheetEditRanges(headers,sheetRow,resolvedRange||range,updates);
  await write({spreadsheetId,requestBody:{valueInputOption:'RAW',data}});
  await audit({sheetRow,fields:Object.keys(updates)});
  return {sheetRow,updated:true};
}
