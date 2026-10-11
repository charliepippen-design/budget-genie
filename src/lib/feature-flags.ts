// Build-time UI flags. Defaults are OFF; set the env var to the string "true" to enable.

/** NOWPayments crypto checkout. The code stays in place but is hidden from the UI unless enabled. */
export const SHOW_CRYPTO_CHECKOUT = import.meta.env.VITE_ENABLE_CRYPTO_CHECKOUT === 'true';
