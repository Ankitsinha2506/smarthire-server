function interviewTimeSeconds(value) {
  const match = String(value ?? '').trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return Infinity;
  let hour = Number(match[1]);
  const minute = Number(match[2]), second = Number(match[3] || 0), period = match[4]?.toUpperCase();
  if (minute > 59 || second > 59 || hour > (period ? 12 : 23) || (period && hour < 1)) return Infinity;
  if (period) hour = hour % 12 + (period === 'PM' ? 12 : 0);
  return hour * 3600 + minute * 60 + second;
}

function day(slot) {
  return slot.interviewDateKey || slot.interviewDate?.toISOString().slice(0, 10) || '9999-12-31';
}

export function compareSchedule(a, b) {
  const dateOrder = day(a).localeCompare(day(b));
  if (dateOrder) return dateOrder;
  const first = interviewTimeSeconds(a.interviewTime);
  const second = interviewTimeSeconds(b.interviewTime);
  return first === second ? String(a._id).localeCompare(String(b._id)) : first - second;
}
