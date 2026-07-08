import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getActiveLimit,
  getWarningBuffer,
  classifyReading,
  getTrackDateStr,
  isOperatingHours,
  isQuietHours,
  getDayStatus,
} from '@pir/types';

// All expectations are in track time (America/Los_Angeles). July/August/
// September dates below are PDT (UTC-7), so track time = UTC - 7h.
function pdt(dateStr: string, hour: number, minute = 0): number {
  return Date.parse(`${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00-07:00`);
}

describe('getTrackDateStr', () => {
  it('uses the track date, not UTC', () => {
    // 11 PM PDT on Jul 7 is 6 AM UTC on Jul 8
    assert.equal(getTrackDateStr(pdt('2026-07-07', 23)), '2026-07-07');
  });
});

describe('getActiveLimit', () => {
  it('is 103 on a weekday during operating hours', () => {
    assert.equal(getActiveLimit(pdt('2026-07-07', 12)), 103); // Tuesday noon
  });

  it('is 90 all day on Mondays', () => {
    assert.equal(getActiveLimit(pdt('2026-07-06', 12)), 90); // Monday noon
  });

  it('is 90 before 9 AM and from 10 PM', () => {
    assert.equal(getActiveLimit(pdt('2026-07-07', 8, 59)), 90);
    assert.equal(getActiveLimit(pdt('2026-07-07', 9)), 103);      // 9:00 AM boundary
    assert.equal(getActiveLimit(pdt('2026-07-07', 21, 59)), 103);
    assert.equal(getActiveLimit(pdt('2026-07-07', 22)), 90);      // 10:00 PM boundary
  });

  it('uses the variance event limit on event days, any hour', () => {
    assert.equal(getActiveLimit(pdt('2026-07-10', 12)), 112); // Rose Cup
    assert.equal(getActiveLimit(pdt('2026-07-10', 23)), 112); // still event limit at night
    assert.equal(getActiveLimit(pdt('2026-08-14', 12)), 115); // IndyCar
    assert.equal(getActiveLimit(pdt('2026-09-05', 12)), 110); // Sovren/ABFM
  });

  it('maps late-evening UTC rollover to the correct track date', () => {
    // Jul 9 5 PM PDT is Jul 10 midnight UTC; must NOT pick up Rose Cup limit
    assert.equal(getActiveLimit(pdt('2026-07-09', 17)), 103);
  });
});

describe('getWarningBuffer', () => {
  it('is 3 dB during the day', () => {
    assert.equal(getWarningBuffer(pdt('2026-07-07', 12)), 3);
    assert.equal(getWarningBuffer(pdt('2026-07-07', 8)), 3);  // 8:00 AM boundary
    assert.equal(getWarningBuffer(pdt('2026-07-07', 21, 59)), 3);
  });

  it('is 5 dB during quiet hours (10 PM to 8 AM)', () => {
    assert.equal(getWarningBuffer(pdt('2026-07-07', 22)), 5); // 10:00 PM boundary
    assert.equal(getWarningBuffer(pdt('2026-07-07', 2)), 5);
    assert.equal(getWarningBuffer(pdt('2026-07-07', 7, 59)), 5);
  });
});

describe('classifyReading', () => {
  it('classifies against the 103 weekday limit with a 3 dB buffer', () => {
    const ts = pdt('2026-07-07', 12); // Tuesday noon
    assert.equal(classifyReading(99.9, ts), 'normal');
    assert.equal(classifyReading(100, ts), 'loud_document');   // 103 - 3
    assert.equal(classifyReading(102.9, ts), 'loud_document');
    assert.equal(classifyReading(103, ts), 'over_limit_report');
    assert.equal(classifyReading(110, ts), 'over_limit_report');
  });

  it('classifies against the 90 Monday limit', () => {
    const ts = pdt('2026-07-06', 12); // Monday noon
    assert.equal(classifyReading(86.9, ts), 'normal');
    assert.equal(classifyReading(87, ts), 'loud_document');    // 90 - 3
    assert.equal(classifyReading(90, ts), 'over_limit_report');
  });

  it('uses the 5 dB buffer against the 90 limit during quiet hours', () => {
    const ts = pdt('2026-07-07', 23); // Tuesday 11 PM
    assert.equal(classifyReading(84.9, ts), 'normal');
    assert.equal(classifyReading(85, ts), 'loud_document');    // 90 - 5
    assert.equal(classifyReading(90, ts), 'over_limit_report');
  });

  it('uses the 90 limit with the 3 dB day buffer between 8 and 9 AM', () => {
    const ts = pdt('2026-07-07', 8, 30);
    assert.equal(classifyReading(86.9, ts), 'normal');
    assert.equal(classifyReading(87, ts), 'loud_document');    // 90 - 3
    assert.equal(classifyReading(90, ts), 'over_limit_report');
  });

  it('classifies against the event limit on variance days', () => {
    const ts = pdt('2026-07-10', 14); // Rose Cup, 112 dBA
    assert.equal(classifyReading(108.9, ts), 'normal');
    assert.equal(classifyReading(109, ts), 'loud_document');   // 112 - 3
    assert.equal(classifyReading(112, ts), 'over_limit_report');
  });
});

describe('isOperatingHours / isQuietHours', () => {
  it('tracks the 9 AM and 10 PM operating boundaries', () => {
    assert.equal(isOperatingHours(pdt('2026-07-07', 8, 59)), false);
    assert.equal(isOperatingHours(pdt('2026-07-07', 9)), true);
    assert.equal(isOperatingHours(pdt('2026-07-07', 21, 59)), true);
    assert.equal(isOperatingHours(pdt('2026-07-07', 22)), false);
  });

  it('tracks the 10 PM and 8 AM quiet boundaries', () => {
    assert.equal(isQuietHours(pdt('2026-07-07', 21, 59)), false);
    assert.equal(isQuietHours(pdt('2026-07-07', 22)), true);
    assert.equal(isQuietHours(pdt('2026-07-07', 7, 59)), true);
    assert.equal(isQuietHours(pdt('2026-07-07', 8)), false);
  });

  it('is neither operating nor quiet between 8 and 9 AM', () => {
    const ts = pdt('2026-07-07', 8, 30);
    assert.equal(isOperatingHours(ts), false);
    assert.equal(isQuietHours(ts), false);
  });
});

describe('getDayStatus', () => {
  it('describes a normal weekday during operating hours', () => {
    const s = getDayStatus(pdt('2026-07-07', 12)); // Tuesday noon
    assert.equal(s.headline, 'Normal operating day');
    assert.equal(s.hoursNote, 'Operating hours (9:00 AM to 10:00 PM)');
    assert.equal(s.limitDb, 103);
    assert.equal(s.event, null);
    assert.equal(s.isMonday, false);
    assert.equal(s.inOperatingHours, true);
    assert.equal(s.inQuietHours, false);
  });

  it('describes a Monday with the reduced all-day limit', () => {
    const s = getDayStatus(pdt('2026-07-06', 12)); // Monday noon
    assert.equal(s.headline, 'Monday: 90 dBA limit all day');
    assert.equal(s.limitDb, 90);
    assert.equal(s.isMonday, true);
  });

  it('describes a race day with the event name and limit', () => {
    const s = getDayStatus(pdt('2026-07-10', 14)); // Rose Cup Friday
    assert.equal(s.headline, 'Race day: Rose Cup Races');
    assert.equal(s.event?.name, 'Rose Cup Races');
    assert.equal(s.limitDb, 112);
  });

  it('describes quiet hours on a normal day', () => {
    const s = getDayStatus(pdt('2026-07-07', 23)); // Tuesday 11 PM
    assert.equal(s.headline, 'Normal operating day');
    assert.equal(s.hoursNote, 'Quiet hours (10:00 PM to 8:00 AM)');
    assert.equal(s.limitDb, 90);
    assert.equal(s.inQuietHours, true);
  });

  it('describes the 8 to 9 AM gap as outside operating hours', () => {
    const s = getDayStatus(pdt('2026-07-07', 8, 30));
    assert.equal(s.hoursNote, 'Outside operating hours');
    assert.equal(s.limitDb, 90);
  });

  it('keeps the race-day limit during the evening', () => {
    const s = getDayStatus(pdt('2026-07-10', 23)); // Rose Cup 11 PM
    assert.equal(s.headline, 'Race day: Rose Cup Races');
    assert.equal(s.limitDb, 112);
    assert.equal(s.inQuietHours, true);
  });

  it('reports the track date across the UTC rollover', () => {
    const s = getDayStatus(pdt('2026-07-09', 17)); // Jul 10 00:00 UTC
    assert.equal(s.dateStr, '2026-07-09');
    assert.equal(s.event, null); // not yet Rose Cup at the track
  });
});
