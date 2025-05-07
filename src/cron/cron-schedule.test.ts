/**
 * Tests for the cron schedule handling
 * These tests verify that the last scheduled registration time is correctly calculated
 */

import { GroupInfo } from '../types/signups';
import { getLastScheduledRegistrationTime } from '../cron/cron-schedule';

describe('Cron Schedule Handling', () => {
  test('should correctly calculate the last scheduled registration time', () => {
    // Create a test group with Wednesday 14:00 cron (0 14 * * 3)
    const group: GroupInfo = {
      id: '351919755889-1635955006@g.us',
      name: 'Dom19h Saldanha P4ALL M4+',
      admin: '351916949231',
      signupStartTime: '0 14 * * 3' // Wednesdays at 2:00 PM
    };

    // If it's Wednesday at 14:30, the last scheduled time should be today at 14:00
    const currentTime = new Date(2025, 4, 7, 14, 30); // Wednesday at 14:30
    const expectedTimestamp = Math.floor(new Date(2025, 4, 7, 14, 0).getTime() / 1000);
    expect(getLastScheduledRegistrationTime(group, currentTime)).toBe(expectedTimestamp);

    // If it's Wednesday at 13:30, the last scheduled time should be previous Wednesday at 14:00
    const beforeScheduledTime = new Date(2025, 4, 7, 13, 30); // Wednesday at 13:30
    const prevWeekTimestamp = Math.floor(new Date(2025, 4, 0, 14, 0).getTime() / 1000); // Previous Wednesday
    expect(getLastScheduledRegistrationTime(group, beforeScheduledTime)).toBe(prevWeekTimestamp);

    // If it's Thursday, the last scheduled time should be Wednesday at 14:00
    const nextDay = new Date(2025, 4, 8, 10, 0); // Thursday at 10:00
    const yesterdayTimestamp = Math.floor(new Date(2025, 4, 7, 14, 0).getTime() / 1000);
    expect(getLastScheduledRegistrationTime(group, nextDay)).toBe(yesterdayTimestamp);

    // If it's Monday, the last scheduled time should be previous Wednesday at 14:00
    const monday = new Date(2025, 4, 5, 10, 0); // Monday at 10:00
    const prevWedTimestamp = Math.floor(new Date(2025, 4, 0, 14, 0).getTime() / 1000);
    expect(getLastScheduledRegistrationTime(group, monday)).toBe(prevWedTimestamp);
  });

  test('should handle invalid cron expressions', () => {
    // Group with invalid cron expression
    const invalidGroup: GroupInfo = {
      id: 'test-group',
      name: 'Test Group',
      admin: 'admin-id',
      signupStartTime: 'invalid-cron'
    };

    // Should return null for invalid cron
    const time = new Date();
    expect(getLastScheduledRegistrationTime(invalidGroup, time)).toBeNull();
  });

  test('should handle missing cron expression', () => {
    // Group with no cron expression
    const noScheduleGroup: GroupInfo = {
      id: 'test-group',
      name: 'Test Group',
      admin: 'admin-id'
      // No signupStartTime provided
    };

    // Should return null when no cron is provided
    const time = new Date();
    expect(getLastScheduledRegistrationTime(noScheduleGroup, time)).toBeNull();
  });

  test('should work with actual Dom19h Saldanha group schedule', () => {
    // This test uses the actual group data from the observed issue
    const group: GroupInfo = {
      id: '351919755889-1635955006@g.us',
      name: 'Dom19h Saldanha P4ALL M4+',
      admin: '351916949231',
      signupStartTime: '0 14 * * 3' // Wednesdays at 2:00 PM
    };

    // If we check on May 5th at 20:36 (Monday), the last scheduled time should be the previous Wednesday
    const incorrectOpeningTime = new Date(2025, 4, 5, 20, 36);
    const previousWednesdayTimestamp = Math.floor(new Date(2025, 3, 30, 14, 0).getTime() / 1000);
    expect(getLastScheduledRegistrationTime(group, incorrectOpeningTime)).toBe(previousWednesdayTimestamp);

    // If we check on the correct day and time, the last scheduled time should be today
    const correctOpeningTime = new Date(2025, 4, 7, 14, 30); // Wednesday at 14:30
    const todayTimestamp = Math.floor(new Date(2025, 4, 7, 14, 0).getTime() / 1000);
    expect(getLastScheduledRegistrationTime(group, correctOpeningTime)).toBe(todayTimestamp);
  });
});
