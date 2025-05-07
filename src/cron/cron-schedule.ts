/**
 * Cron Schedule Handling Module
 * 
 * This module handles getting the most recent date when registration should have opened
 * based on the cron schedule. This allows us to find the correct registration message.
 */

import { GroupInfo } from '../types/signups';

/**
 * Parse a simple cron expression in the format "0 HH * * D" where
 * HH is the hour (0-23) and D is the day of week (0-6, where 0 is Sunday)
 * 
 * @param cronExpression The cron expression to parse
 * @returns Object with hour and day of week, or null if invalid
 */
function parseSimpleCron(cronExpression: string): { hour: number; dayOfWeek: number } | null {
  // Supports format: "0 HH * * D"
  const cronPattern = /^(\d+)\s+(\d+)\s+\*\s+\*\s+(\d+)$/;
  const match = cronExpression.match(cronPattern);
  
  if (!match) {
    console.error(`Invalid cron expression: ${cronExpression}`);
    return null;
  }
  
  const minute = parseInt(match[1], 10);
  const hour = parseInt(match[2], 10);
  const dayOfWeek = parseInt(match[3], 10);
  
  if (isNaN(hour) || hour < 0 || hour > 23 || isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    console.error(`Invalid hour or day of week in cron: ${cronExpression}`);
    return null;
  }
  
  return { hour, dayOfWeek };
}

/**
 * Get the timestamp for the most recent scheduled registration opening
 * 
 * @param group The group information with cron schedule
 * @param currentTime The current time to use as reference
 * @returns Unix timestamp in seconds when registration should have last opened, or null if invalid
 */
export function getLastScheduledRegistrationTime(group: GroupInfo, currentTime: Date = new Date()): number | null {
  // If no signup start time is specified, return null (no scheduled time)
  if (!group.signupStartTime) {
    console.log(`No signup schedule for group ${group.name}`);
    return null;
  }

  // Parse the cron expression
  const schedule = parseSimpleCron(group.signupStartTime);
  if (!schedule) {
    // Invalid cron expression
    return null;
  }

  // Clone the current time to avoid modifying it
  const lastScheduledDate = new Date(currentTime.getTime());
  
  // Find how many days we need to go back to reach the last scheduled day of week
  const currentDayOfWeek = currentTime.getDay();
  let daysToSubtract = 0;
  
  if (currentDayOfWeek === schedule.dayOfWeek) {
    // Same day of week, check if we're before the scheduled hour
    if (currentTime.getHours() < schedule.hour) {
      // Before the scheduled hour on the correct day, go back 7 days
      daysToSubtract = 7;
    }
    // Otherwise we're after the scheduled hour on the correct day, no need to go back
  } else {
    // Different day of week
    // Calculate days to go back: if current day < scheduled day, go back (current + 7 - scheduled) days
    // if current day > scheduled day, go back (current - scheduled) days
    daysToSubtract = (currentDayOfWeek > schedule.dayOfWeek) 
      ? currentDayOfWeek - schedule.dayOfWeek 
      : currentDayOfWeek + 7 - schedule.dayOfWeek;
  }
  
  // Adjust the date to the last scheduled day
  lastScheduledDate.setDate(lastScheduledDate.getDate() - daysToSubtract);
  
  // Set the time to the scheduled hour
  lastScheduledDate.setHours(schedule.hour, 0, 0, 0);
  
  console.log(`Last scheduled registration time for ${group.name}: ${lastScheduledDate.toLocaleString()}`);
  
  // Return the timestamp in seconds (as used in WhatsApp messages)
  return Math.floor(lastScheduledDate.getTime() / 1000);
}
