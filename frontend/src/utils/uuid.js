// UUID generation utility with fallback for browsers that don't support crypto.randomUUID

export function generateUUID() {
  // Try to use crypto.randomUUID if available (modern browsers)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try {
      return crypto.randomUUID();
    } catch (error) {
      console.warn('crypto.randomUUID failed, using fallback:', error);
    }
  }
  
  // Fallback: Generate a UUID v4 using crypto.getRandomValues
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    try {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const array = new Uint8Array(1);
        crypto.getRandomValues(array);
        const r = array[0] % 16;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    } catch (error) {
      console.warn('crypto.getRandomValues failed, using Math.random fallback:', error);
    }
  }
  
  // Final fallback: Use Math.random (less secure but works everywhere)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
