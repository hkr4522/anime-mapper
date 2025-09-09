import NodeCache from 'node-cache';

// Create a new cache instance
const apiCache = new NodeCache({ stdTTL: 300 }); // Default TTL 5 minutes

/**
 * Middleware for caching API responses
 * @param {string} duration Cache duration in format: '5 minutes', '1 hour', etc.
 */
export function cache(duration) {
  return (req, res, next) => {
    // Skip caching for non-GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Create a unique cache key from the request URL
    const key = req.originalUrl || req.url;
    
    // Check if we have a cached response for this request
    const cachedResponse = apiCache.get(key);
    
    if (cachedResponse) {
      console.log(`Cache hit for: ${key}`);
      return res.json(cachedResponse);
    }
    
    // Store the original json method
    const originalJson = res.json;
    
    // Override the json method to cache the response
    res.json = function(data) {
      try {
        // Only cache successful responses (statusCode < 400)
        if ((res.statusCode || 200) < 400) {
          console.log(`Caching response for: ${key}`);
          apiCache.set(key, data);
        } else {
          console.log(`Skip caching error for: ${key} (status ${res.statusCode})`);
        }
      } catch (e) {
        console.warn(`Cache middleware error: ${e?.message || e}`);
      }
      
      // Call the original json method
      return originalJson.call(this, data);
    };
    
    next();
  };
}