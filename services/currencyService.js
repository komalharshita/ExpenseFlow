// Currency service with caching support
class CurrencyService {
  constructor() {
    this.validCurrencies = ['USD', 'EUR', 'GBP', 'INR', 'JPY'];
    this.exchangeRates = {
      'USD': 1,
      'EUR': 0.85,
      'GBP': 0.73,
      'INR': 83.12,
      'JPY': 110.25
    };
    // Cache for exchange rates with TTL (time-to-live) in milliseconds
    // Default TTL: 5 minutes (300000 ms)
    this.rateCache = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes
  }

  init() {
    console.log('Currency service initialized');
  }

  isValidCurrency(currency) {
    return this.validCurrencies.includes(currency);
  }

  /**
   * Get exchange rate with caching
   * @param {string} baseCurrency - The base currency code
   * @returns {Object} Exchange rates object with timestamp
   */
  getExchangeRatesWithCache(baseCurrency = 'USD') {
    const cacheKey = `rates_${baseCurrency}`;
    const cached = this.rateCache.get(cacheKey);

    if (cached && (Date.now() - cached.timestamp) < this.cacheTTL) {
      return cached;
    }

    // Return current rates (in a real app, this would fetch from an external API)
    const rates = { ...this.exchangeRates };
    
    // If base is not USD, normalize rates
    if (baseCurrency !== 'USD') {
      const baseRate = this.exchangeRates[baseCurrency];
      for (const currency in rates) {
        rates[currency] = rates[currency] / baseRate;
      }
    }

    // Store in cache
    this.rateCache.set(cacheKey, {
      rates,
      timestamp: Date.now()
    });

    return { rates, timestamp: Date.now() };
  }

  /**
   * Get a specific exchange rate
   * @param {string} from - Source currency
   * @param {string} to - Target currency
   * @returns {number} Exchange rate
   */
  getExchangeRate(fromCurrency, toCurrency) {
    const cached = this.getExchangeRatesWithCache();
    const fromRate = cached.rates[fromCurrency];
    const toRate = cached.rates[toCurrency];
    return toRate / fromRate;
  }

  /**
   * Convert amount from one currency to another
   * @param {number} amount - Amount to convert
   * @param {string} fromCurrency - Source currency code
   * @param {string} toCurrency - Target currency code
   * @returns {Object} Conversion result with convertedAmount and exchangeRate
   */
  async convertCurrency(amount, fromCurrency, toCurrency) {
    if (!this.isValidCurrency(fromCurrency) || !this.isValidCurrency(toCurrency)) {
      throw new Error('Invalid currency');
    }

    // Use cached exchange rates
    const cached = this.getExchangeRatesWithCache();
    const fromRate = cached.rates[fromCurrency];
    const toRate = cached.rates[toCurrency];
    const convertedAmount = (amount / fromRate) * toRate;

    return {
      convertedAmount: Math.round(convertedAmount * 100) / 100,
      exchangeRate: toRate / fromRate,
      fromCurrency,
      toCurrency
    };
  }

  /**
   * Clear the exchange rate cache
   */
  clearCache() {
    this.rateCache.clear();
  }

  /**
   * Update exchange rates (would be called by a cron job in production)
   * @param {Object} newRates - New exchange rates to use
   */
  updateExchangeRates(newRates) {
    this.exchangeRates = { ...this.exchangeRates, ...newRates };
    this.clearCache(); // Clear cache when rates are updated
  }
}

module.exports = new CurrencyService();
