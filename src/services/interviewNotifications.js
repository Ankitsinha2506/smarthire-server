// Compare identities rather than totals: deleting one entry and adding another
// must still produce a notification. The first successful snapshot is a baseline.
export function reconcileNotifications(state, keys, scope) {
  if (!state || state.scope !== scope) return {scope, known: keys, unread: []};
  const known = new Set(state.known);
  const added = keys.filter(key => !known.has(key));
  return {
    scope,
    known: [...new Set([...state.known, ...keys])],
    unread: [...new Set([...state.unread, ...added])]
  };
}
