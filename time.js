function getTimeOfDay() {
  elapsed = millis() / 1000; // converting ms to seconds
  let dayFraction =
    (elapsed / clock.dayLengthSeconds + clock.startHour / 24) % 1;
  const relativeTime = dayFraction * 24;
  // console.log(dayFraction);
  return formatTime(relativeTime);
  // return dayFraction, parseInt(dayFraction), dayFraction % 1;
}

function formatTime(relativeTime) {
  const hours24 = Math.floor(relativeTime);
  const hours = hours24 % 12 || 12;
  const meridian = hours24 < 12 ? "AM" : "PM";
  const mins = Math.floor((relativeTime % 1) * 60);
  const paddedMins = String(mins).padStart(2, "0");
  const formattedTime = `${hours}:${paddedMins} ${meridian}`;
  return formattedTime;
}
