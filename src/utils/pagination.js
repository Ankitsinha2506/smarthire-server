export function pagination(query = {}) {
  const positive = (value, fallback) => {
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? number : fallback;
  };
  const page = positive(query.page, 1);
  const limit = Math.min(positive(query.limit, 10), 100);
  return {page, limit};
}
export function pageMeta(total, requestedPage, limit) {
  const pages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(requestedPage, pages);
  return {total, page, pages, limit, offset: (page - 1) * limit};
}

export function combinedPageWindow(sheetItems, offset, limit) {
  const items = sheetItems.slice(offset, offset + limit);
  return {items, databaseOffset: Math.max(0, offset - sheetItems.length), databaseLimit: limit - items.length};
}
