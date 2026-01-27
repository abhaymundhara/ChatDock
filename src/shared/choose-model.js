function normalize(val) {
  if (!val) return '';
  return String(val).trim();
}

function chooseModel({ requested, last, available }) {
  const req = normalize(requested);
  if (req) return req;

  const lastModel = normalize(last);
  if (lastModel) return lastModel;

  if (Array.isArray(available) && available.length > 0) {
    const first = normalize(available[0]);
    return first || null;
  }

  return null;
}

module.exports = { chooseModel };
