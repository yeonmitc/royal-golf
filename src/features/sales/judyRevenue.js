export function isJudyConsignmentCode(code) {
  return String(code || '').trim().toUpperCase().startsWith('JD');
}

export function recognizedRevenue(code, paidAmount) {
  const amount = Number(paidAmount) || 0;
  return isJudyConsignmentCode(code) ? amount * 0.5 : amount;
}
