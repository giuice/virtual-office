// components/floor-plan/types.ts
export interface User {
	id: number;
	name: string;
	avatar: string;
	status: 'presenting' | 'viewing' | 'active' | 'away';
	activity: string;
  }
  
  export interface Space {
	id: string;
	name: string;
	type: 'conference' | 'workspace' | 'breakout' | 'social';
	status: 'active' | 'available' | 'maintenance';
	position: { 
	  x: number; 
	  y: number; 
	  width: number; 
	  height: number;
	};
	capacity: number;
	features: string[];
	users: User[];
  }
  
  export interface Announcement {
	id: number;
	author: string;
	role: string;
	avatar: string;
	message: string;
	time: string;
  }
  
  // Color themes for different room types
  export interface ColorTheme {
	color: string;
	lightColor: string;
  }
  
  // Status indicators for room and users
  export interface StatusConfig {
	color: string;
	icon?: React.ReactNode;
	label: string;
  }