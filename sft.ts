const [, , unix] = process.argv;
function logTimeToUnix(logTime: string): number {
  const [time] = logTime.split(".");
  const [h, m, s] = time.split(":").map(Number);
  const now = new Date();
  now.setHours(h, m, s, Number(logTime.split(".")[1]));
  return now.getTime();
}

console.log(logTimeToUnix(unix));
