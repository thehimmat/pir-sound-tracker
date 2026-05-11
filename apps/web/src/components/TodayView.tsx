import { DayView } from './DayView.js';

export function TodayView() {
  const today = new Date().toLocaleDateString('sv'); // YYYY-MM-DD
  return <DayView date={today} />;
}
