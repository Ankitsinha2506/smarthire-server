// Interview form dates represent calendar dates in India, regardless of host timezone.
export function interviewStart(date, time) {
  const day = date instanceof Date ? date.toISOString().slice(0, 10) : String(date || '').slice(0, 10);
  const match = String(time || '').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  let hour = Number(match[1]); const minute = Number(match[2]);
  if (minute > 59 || hour > 23 || (match[3] && (hour < 1 || hour > 12))) return null;
  if (match[3]) hour = hour % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0);
  const result = new Date(`${day}T${String(hour).padStart(2, '0')}:${match[2]}:00+05:30`);
  return Number.isNaN(result.getTime()) ? null : result;
}
export function supportMessage(name, details, kind) {
  const format = date => new Intl.DateTimeFormat('en-IN', {timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short'}).format(date) + ' IST';
  return {
    subject: `${kind === 'reminder' ? 'Interview Support Reminder' : 'Interview Support Assigned'} — ${details.candidateName}`,
    text: `Hi ${name},\n\n${kind === 'reminder' ? 'Please be ready to support' : 'You have been assigned to support'} ${details.candidateName}’s interview.\n\nInterview: ${format(new Date(details.start))}\nPlease be available by: ${format(new Date(new Date(details.start).getTime() - 600000))}\nContact: ${details.candidateMobile || 'Not provided'}\nCompany: ${details.companyName || 'Not provided'}\nTechnology: ${details.technology || 'Not provided'}\n\nPlease contact ${details.candidateName} and be available 10 minutes before the interview.\n\nSmartHire : SmartGroup`
  };
}
