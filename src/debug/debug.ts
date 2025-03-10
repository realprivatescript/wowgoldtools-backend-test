export function checkMemoryUsage(memoryUsage: NodeJS.MemoryUsage) {
  console.log("Memory Usage:");
  console.log(`RSS (Resident Set Size): ${memoryUsage.rss / 1024 / 1024} MB`);
  console.log(`Heap Total: ${memoryUsage.heapTotal / 1024 / 1024} MB`);
  console.log(`Heap Used: ${memoryUsage.heapUsed / 1024 / 1024} MB`);
  console.log(`External: ${memoryUsage.external / 1024 / 1024} MB`);
}
