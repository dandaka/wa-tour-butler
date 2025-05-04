// Basic types for the tournament system
// This is a placeholder file to fix import errors
// You can expand these types as you implement the tournament functionality

export interface Player {
  phoneNumber: string;
  name: string;
  skillLevel?: number;
  availability?: string[];
}

export interface Match {
  id: string;
  team1: string[];  // Array of player phone numbers
  team2: string[];  // Array of player phone numbers
  score: {
    team1: number;
    team2: number;
  };
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  scheduledTime: Date | null;
}

export interface Tournament {
  id: string;
  name: string;
  groupId: string;
  organizerId: string;
  players: Player[];
  createdAt: Date;
  scheduledDate: Date | null;
  isActive: boolean;
  matches: Match[];
  status: 'registration' | 'in_progress' | 'completed' | 'cancelled';
}
