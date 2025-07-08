export const calculateMemoSize = (createdAt: number): number => {
  const now = Date.now();
  const hoursElapsed = (now - createdAt) / (1000 * 60 * 60);
  
  // Size growth schedule as specified
  // origin memo size to 16px
  
  if (hoursElapsed < 1) return 1.25;
  if (hoursElapsed < 3) return 1.5;
  if (hoursElapsed < 6) return 2.0;
  if (hoursElapsed < 12) return 2.5;
  if (hoursElapsed < 18) return 3.0;
  if (hoursElapsed < 24) return 3.5;
  if (hoursElapsed < 30) return 4.0;
  if (hoursElapsed < 36) return 4.5;
  if (hoursElapsed < 42) return 5.0;
  if (hoursElapsed < 48) return 5.5;
  if (hoursElapsed < 54) return 6.0;
  if (hoursElapsed < 60) return 6.5;
  if (hoursElapsed < 66) return 7.0;
  if (hoursElapsed < 72) return 7.5;
  
  return 8.0; // Maximum size after 72 hours
};