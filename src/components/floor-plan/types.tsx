// components/floor-plan/types.ts
export interface User {
	id: number
	name: string
	status: 'presenting' | 'viewing' | 'away' | 'active'
	avatar: string
	activity: string
  }
  
  export interface Space {
	id: string
	name: string
	type: 'conference' | 'workspace' | 'breakout' | 'social'
	status: 'active' | 'available' | 'maintenance'
	position: { x: number, y: number, width: number, height: number }
	capacity: number
	features: string[]
	users: User[]
  }