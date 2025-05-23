const applyProfitMargin = (price, profitMargin) => {
  const adjusted = price + (price * profitMargin) / 100;
  return parseFloat(adjusted.toFixed(2));
};

const applyDiscount = (price, discount) => {
  const discounted = price - (price * discount) / 100;
  return parseFloat(discounted.toFixed(2));
};

module.exports = { applyProfitMargin, applyDiscount };