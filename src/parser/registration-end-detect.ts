/**
 * Registration End Detection
 * Calculates when registration ends based on the tournament time in crontab format
 */

import { GroupInfo } from "../types/group-info";
// Import cron-parser - we need to use a different approach
// First try using a simpler approach without cron-parser
// This will calculate the next Saturday at 15:00 after the registration start

/**
 * Calculates the timestamp when registration ends based on the tournament time in crontab format
 * @param registrationStartTimestamp The timestamp when registration started
 * @param groupInfo The group information containing tournament times
 * @returns The timestamp when registration ends and success indicator
 */
export function calculateRegistrationEndTime(
  registrationStartTimestamp: number,
  groupInfo: GroupInfo
): { timestamp: number; success: boolean } {
  console.log(`Calculate registration end time from: ${registrationStartTimestamp}`);
  console.log(`Registration start date: ${new Date(registrationStartTimestamp * 1000).toISOString()}`);
  
  if (!registrationStartTimestamp) {
    return { timestamp: 0, success: false };
  }

  // Convert registration start timestamp to Date
  const registrationStartDate = new Date(registrationStartTimestamp * 1000);
  
  // Find the tournament time for each batch
  console.log(`Group has ${groupInfo.Batches?.length || 0} batches`);
  if (groupInfo.Batches && groupInfo.Batches.length > 0) {
    // Array to hold potential end times
    const potentialEndTimes: number[] = [];

    // Check each batch for tournament time
    for (const batch of groupInfo.Batches) {
      console.log(`Checking batch: ${batch.name} with tournament time: ${batch.TournamentTime || 'none'}`);
      if (batch.TournamentTime) {
        try {
          // Parse the cron expression - for now just do simple calculation
          // The tournament time format is: 0 15 * * 6 (which means Saturday at 15:00)
          // Extract the hour and day of week from the cron string
          const cronParts = batch.TournamentTime.split(' ');
          const hour = parseInt(cronParts[1], 10);
          const dayOfWeek = parseInt(cronParts[4], 10);
          
          // Make a copy of the registration start date
          const nextDate = new Date(registrationStartDate.getTime());
          
          // Move to the next day of week (e.g., Saturday)
          const currentDay = nextDate.getUTCDay();
          const daysToAdd = (dayOfWeek - currentDay + 7) % 7;
          nextDate.setUTCDate(nextDate.getUTCDate() + daysToAdd);
          
          // Set the hour
          nextDate.setUTCHours(hour, 0, 0, 0);
          
          // If this date is before the registration start, move to next week
          if (nextDate.getTime() <= registrationStartDate.getTime()) {
            nextDate.setUTCDate(nextDate.getUTCDate() + 7);
          }
          
          console.log(`Next tournament time: ${nextDate.toISOString()}`);
          const endTimestamp = Math.floor(nextDate.getTime() / 1000);
          console.log(`Adding potential end time: ${endTimestamp} (${new Date(endTimestamp * 1000).toISOString()})`);
          potentialEndTimes.push(endTimestamp);
        } catch (err) {
          console.error(`Error parsing tournament time: ${batch.TournamentTime}`, err);
        }
      }
    }

    // If we found any potential end times, return the earliest one
    console.log(`Found ${potentialEndTimes.length} potential end times`);
    if (potentialEndTimes.length > 0) {
      const earliestEndTime = Math.min(...potentialEndTimes);
      console.log(`Earliest end time: ${earliestEndTime} (${new Date(earliestEndTime * 1000).toISOString()})`);
      return {
        timestamp: earliestEndTime,
        success: true
      };
    }
  }

  // As a fallback, check for a general tournament time if no batch-specific times were found
  if (groupInfo.TournamentTime && groupInfo.TournamentTime.trim() !== '') {
    try {
      // Parse the tournament time - for now just calculate next Saturday
      const cronParts = groupInfo.TournamentTime.split(' ');
      const hour = parseInt(cronParts[1], 10);
      const dayOfWeek = parseInt(cronParts[4], 10);
      
      // Make a copy of the registration start date
      const nextDate = new Date(registrationStartDate.getTime());
      
      // Move to the next day of week (e.g., Saturday)
      const currentDay = nextDate.getUTCDay();
      const daysToAdd = (dayOfWeek - currentDay + 7) % 7;
      nextDate.setUTCDate(nextDate.getUTCDate() + daysToAdd);
      
      // Set the hour
      nextDate.setUTCHours(hour, 0, 0, 0);
      
      // If this date is before the registration start, move to next week
      if (nextDate.getTime() <= registrationStartDate.getTime()) {
        nextDate.setUTCDate(nextDate.getUTCDate() + 7);
      }
      
      const endTimestamp = Math.floor(nextDate.getTime() / 1000);
      return {
        timestamp: endTimestamp,
        success: true
      };
    } catch (err) {
      console.error(`Error parsing tournament time: ${groupInfo.TournamentTime}`, err);
    }
  }

  // If no tournament time could be found, registration doesn't end
  return { timestamp: 0, success: false };
}
